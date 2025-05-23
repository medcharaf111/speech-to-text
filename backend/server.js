require("dotenv").config(); // Load environment variables from .env file

const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const { createClient, LiveTranscriptionEvents, LiveTTSEvents } = require("@deepgram/sdk");
const { TranslationServiceClient } = require("@google-cloud/translate").v3;
const cors = require("cors");
const express = require("express");

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const translateClient = new TranslationServiceClient();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

let adminSocket = null;
const clients = new Map(); // socket -> { language: '' }
let recognizeStream = null;

io.on("connection", (socket) => {
  let dgConnection; // Deepgram live connection

  socket.on("init:admin", () => {
    adminSocket = socket;
    socket.isAdmin = true;
  });

  socket.on("init:client", ({ language = "en-US", voiceModel }) => {
    clients.set(socket, { language });
    dgConnection = initSpeakingStream(socket, dgConnection, voiceModel);
  });

  socket.on("setLanguage", (language) => {
    if (clients.has(socket)) {
      clients.get(socket).language = language;
    }
  });

  socket.on("setVoiceModel", (voiceModel) => {
    if (clients.has(socket)) {
      dgConnection = initSpeakingStream(socket, dgConnection, voiceModel);
    }
  });

  socket.on("stop:admin", () => {
    if (socket.isAdmin) stopRecognitionStream();
  });

  socket.on("start:admin", ({ adminLanguage }) => {
    if (socket.isAdmin) {
      console.log(`Admin requested start with language: ${adminLanguage}`);
      stopRecognitionStream(); // Ensure any previous stream is stopped
      startRecognitionStream(adminLanguage);
    }
  });

  socket.on("audio", (audioChunk) => {
    if (socket === adminSocket && recognizeStream) {
      recognizeStream.send(audioChunk);
    }
  });

  socket.on("tts_send_text", (text) => {
    if (dgConnection) {
      dgConnection.sendText(text); // Send text
      dgConnection.flush();
    }
  });

  socket.on("stop_tts_stream", () => {
    console.log("Received stop_tts_stream from client.");
    if (dgConnection && dgConnection.getReadyState() === WebSocket.OPEN) {
      dgConnection.flush(); // Flush any remaining text
      dgConnection.requestClose(); // Close Deepgram connection
      dgConnection = null;
      console.log("Deepgram TTS connection explicitly finished.");
    }
  });

  socket.on("disconnect", () => {
    if (socket === adminSocket) {
      stopRecognitionStream();
      adminSocket = null;
    } else {
      clients.delete(socket);

      if (!dgConnection) return;
      dgConnection.requestClose();
      dgConnection = null;
    }
  });
});

function startRecognitionStream(adminLang) {
  recognizeStream = deepgram.listen.live({
    model: adminLang == "en-US" ? "nova-3" : "nova-2",
    language: adminLang, //adminLang == "en-US" ? "multi" : adminLang,
    smart_format: true,
    // filler_words: true,
    // utterance_end_ms: 3000,
    // endpointing: 100,
  });
  recognizeStream.on(LiveTranscriptionEvents.Open, () => {
    recognizeStream.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      if (transcript) {
        onSpeechData(
          {
            transcript,
            isFinal: true,
          },
          adminLang
        );
      }
    });
    recognizeStream.on(LiveTranscriptionEvents.Close, () => {
      console.log("Deepgram connection closed.");
    });
    recognizeStream.on(LiveTranscriptionEvents.Error, (error) => {
      console.log("Deepgram error:", error);
      stopRecognitionStream(); // Stop on error
    });
  });
}

function initSpeakingStream(socket, dgConnection, voiceModel) {
  if (dgConnection && dgConnection.getReadyState() === WebSocket.OPEN) {
    console.log("Existing Deepgram connection, flushing and sending new text.");
    dgConnection.flush();
    return;
  }

  try {
    const dgConn = deepgram.speak.live({
      model: voiceModel, // Choose your desired Deepgram voice model
      encoding: "linear16", // Recommended for real-time streaming
      sample_rate: 48000, // Sample rate should match what your client expects
    });

    dgConn.on(LiveTTSEvents.Open, () => {
      dgConn.on(LiveTTSEvents.Audio, (audioChunk) => {
        socket.emit("tts_audio_chunk", audioChunk); // Emit audio data to the client
      });

      dgConn.on(LiveTTSEvents.Close, () => {
        console.log("Deepgram TTS connection closed.");
      });

      dgConn.on(LiveTTSEvents.Error, (error) => {
        console.log("Deepgram TTS error:", error);
        socket.emit("tts_error", "Deepgram TTS error occurred.");
      });
    });
    return dgConn;
  } catch (error) {
    console.error("Error starting Deepgram TTS connection:", error);
    socket.emit("tts_error", "Failed to start TTS connection.");
  }
}

function stopRecognitionStream() {
  if (!recognizeStream) return;
  recognizeStream.requestClose();
  recognizeStream = null;
}

async function translateText(text, targetLanguage, sourceLanguage) {
  if (targetLanguage === sourceLanguage) {
    return text;
  }

  try {
    const [translationResponse] = await translateClient.translateText({
      parent: `projects/${process.env.GOOGLE_PROJECT_ID}/locations/global`,
      contents: [text],
      mimeType: "text/plain",
      sourceLanguageCode: sourceLanguage,
      targetLanguageCode: targetLanguage,
    });
    return translationResponse.translations[0].translatedText;
  } catch (error) {
    console.error(`Error translating text to ${targetLanguage}:`, error);
    return text; // Return original text if translation fails
  }
}

async function onSpeechData(data, adminLang) {
  if (!data.transcript) {
    return;
  }
  const text = data.transcript;
  const isFinal = data.isFinal;

  try {
    const translationPromises = [];
    for (const [socket, { language: clientLanguage }] of clients) {
      translationPromises.push(
        translateText(text, clientLanguage, adminLang)
          .then((translatedText) => {
            socket.emit("transcript", { text: translatedText, isFinal, language: clientLanguage });
          })
          .catch((error) => {
            // This catch is for errors in emitting or post-processing
            console.error(`Error processing or emitting transcript for client ${socket.id}:`, error);
          })
      );
    }
    await Promise.all(translationPromises);
  } catch (error) {
    // This catch is mainly for programming errors in the setup of Promise.all
    console.error("Error during parallel translation processing:", error);
  }
}

// API routes for List of supported languages
app.get("/api/languages", (req, res) => {
  const supportedLanguages = JSON.parse(
    fs.readFileSync(req.query.isAdmin === "true" ? "./admin_languages.json" : "./languages.json", "utf-8")
  );
  res.json(supportedLanguages);
});

const PORT = process.env.PORT || 3001; // Fallback port
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
