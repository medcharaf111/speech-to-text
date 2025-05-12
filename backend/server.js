// server.js
const fs = require("fs");
const http = require("http");
const socketIo = require("socket.io");
// const { SpeechClient } = require("@google-cloud/speech");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const { TranslationServiceClient } = require("@google-cloud/translate").v3;
const cors = require("cors");
const express = require("express");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// GCP clients (requires GOOGLE_APPLICATION_CREDENTIALS env var)
// const speechClient = new SpeechClient();
const speechClient = createClient(process.env.DEEPGRAM_API_KEY);
const translateClient = new TranslationServiceClient();

// const RECORDING_CONFIG = {
//   config: {
//     encoding: "WEBM_OPUS",
//     sampleRateHertz: 48000,
//     interimResults: true,
//   },
//   // singleUtterance: false,
// };

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

let adminSocket = null;
const clients = new Map(); // socket -> { language: '' }
let recognizeStream = null;

io.on("connection", (socket) => {
  socket.on("init:admin", () => {
    adminSocket = socket;
    socket.isAdmin = true;
  });

  socket.on("init:client", ({ language = "en-US" }) => {
    clients.set(socket, { language });
  });

  socket.on("setLanguage", (language) => {
    if (clients.has(socket)) {
      clients.get(socket).language = language;
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
      // recognizeStream.write(audioChunk);
      recognizeStream.send(audioChunk);
    }
  });

  socket.on("disconnect", () => {
    if (socket === adminSocket) {
      stopRecognitionStream();
      adminSocket = null;
    } else {
      clients.delete(socket);
    }
  });
});

function startRecognitionStream(adminLang) {
  // RECORDING_CONFIG.config.languageCode = adminLang;
  // recognizeStream = speechClient
  //   .streamingRecognize(RECORDING_CONFIG)
  //   .on("data", onSpeechData)
  //   .on("error", (e) => console.log(e));
  recognizeStream = speechClient.listen.live({
    model: adminLang == "en-US" ? "nova-3" : "nova-2",
    language: adminLang,
    smart_format: true,
  });
  recognizeStream.addListener(LiveTranscriptionEvents.Open, () => {
    recognizeStream.addListener(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      if (transcript) {
        onSpeechData(
          {
            results: [
              {
                alternatives: [
                  {
                    transcript,
                  },
                ],
                isFinal: true,
              },
            ],
          },
          adminLang
        );
      }
    });
    recognizeStream.addListener(LiveTranscriptionEvents.Close, () => {
      console.log("Deepgram connection closed.");
    });
    recognizeStream.addListener(LiveTranscriptionEvents.Error, (error) => {
      console.log("Deepgram error:", error);
      stopRecognitionStream(); // Stop on error
    });
  });
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
  if (!data.results || !data.results[0] || !data.results[0].alternatives[0]) {
    return;
  }
  const result = data.results[0];
  const text = result.alternatives[0].transcript;
  const isFinal = result.isFinal;

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
