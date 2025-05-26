require("dotenv").config(); // Load environment variables from .env file

const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const textToSpeech = require("@google-cloud/text-to-speech");
const { TranslationServiceClient } = require("@google-cloud/translate").v3;
const cors = require("cors");
const express = require("express");
const { getVoiceLangCode } = require("./utils");

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const translateClient = new TranslationServiceClient();
const ttsClient = new textToSpeech.TextToSpeechClient();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

let adminSocket = null;
const clients = new Map(); // socket -> { language: '' }
const adminTextQueues = new Map(); // Map: socket.id -> { textQueue: [], isProcessing: boolean }
let recognizeStream = null;

io.on("connection", (socket) => {
  socket.on("init:admin", () => {
    adminSocket = socket;
    socket.isAdmin = true;
  });

  socket.on("init:client", ({ language }) => {
    clients.set(socket, { language });
    adminTextQueues.set(socket.id, { textQueue: [], isProcessing: false });
  });

  socket.on("setLanguage", (language) => {
    if (clients.has(socket)) {
      clients.get(socket).language = language;
    }
  });

  // socket.on("setVoiceModel", (voiceModel) => {
  //   if (clients.has(socket)) {
  //     clients.get(socket).language = voiceModel;
  //   }
  // });

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

  socket.on("tts_send_text", (text, voiceModel, language) => {
    const adminState = adminTextQueues.get(socket.id);
    if (adminState) {
      adminState.textQueue.push(text);
      processAdminTextQueue(socket.id, voiceModel, getVoiceLangCode(language)); // Continue processing or add to queue
    }
  });

  socket.on("stop_tts_stream", () => {
    console.log("Received stop_tts_stream from client.");
    adminTextQueues.delete(socket.id);
  });

  socket.on("disconnect", () => {
    if (socket === adminSocket) {
      stopRecognitionStream();
      adminSocket = null;
    } else {
      clients.delete(socket);
      adminTextQueues.delete(socket.id);
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

async function processAdminTextQueue(socketId, voiceModel, language) {
  const adminState = adminTextQueues.get(socketId);
  if (!adminState || adminState.isProcessing || adminState.textQueue.length === 0) {
    return;
  }

  adminState.isProcessing = true;
  const textToSynthesize = adminState.textQueue.shift(); // Get the next chunk of text
  try {
    const request = {
      input: { text: textToSynthesize },
      voice: { languageCode: language, name: voiceModel, ssmlGender: "FEMALE" }, // Use your preferred voice
      audioConfig: { audioEncoding: "MP3" },
    };
    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioContent = response.audioContent; // This is a Buffer

    // Broadcast the audio data to all connected clients (excluding the admin themselves if desired)
    io.emit("tts_audio_chunk", audioContent);
  } catch (error) {
    console.error(`Error synthesizing speech for admin ${socketId}:`, error);
    // Optionally notify the admin of the error
    io.to(socketId).emit("admin:synthesisError", "Failed to synthesize speech chunk.");
  } finally {
    adminState.isProcessing = false;
    // Process the next item in the queue recursively
    if (adminState.textQueue.length > 0) {
      processAdminTextQueue(socketId, voiceModel, language);
    } else {
      io.to(socketId).emit("admin:queueEmpty"); // Notify admin when queue is cleared
    }
  }
}

function stopRecognitionStream() {
  if (!recognizeStream) return;
  recognizeStream.requestClose();
  recognizeStream = null;
}

async function translateText(text, targetLanguage, sourceLanguage) {
  if (targetLanguage === sourceLanguage || sourceLanguage.includes(targetLanguage)) {
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

app.get("/api/voiceModelList", async (req, res) => {
  try {
    const langCode = getVoiceLangCode(req.query.language);
    let response = await ttsClient.listVoices();
    response = response[0].voices.map((item) => ({ ...item, languageCodes: item.languageCodes[0] }));
    const list = response.filter(
      (item) => item.languageCodes === langCode && (item.name.includes("Chirp3") || item.name.includes("Standard"))
    );
    res.json(list);
  } catch (error) {
    console.log(error);
    res.status(405).send("Error" + String(error));
  }
});

const PORT = process.env.PORT || 3001; // Fallback port
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
