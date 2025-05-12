// server.js
const fs = require("fs");
const http = require("http");
const socketIo = require("socket.io");
const { SpeechClient } = require("@google-cloud/speech");
const { TranslationServiceClient } = require("@google-cloud/translate").v3;
const cors = require("cors");
const express = require("express");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// GCP clients (requires GOOGLE_APPLICATION_CREDENTIALS env var)
const speechClient = new SpeechClient();
const translateClient = new TranslationServiceClient();

const currentAdminLanguage = "en-US";
const RECORDING_CONFIG = {
  config: {
    encoding: "WEBM_OPUS",
    sampleRateHertz: 48000,
    languageCode: "en-US",
    interimResults: true,
  },
  // singleUtterance: false,
};

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

let adminSocket = null;
const clients = new Map(); // socket -> { language: 'en-US' }
let recognizeStream = null;

io.on("connection", (socket) => {
  socket.on("init:admin", ({ adminLanguage = currentAdminLanguage }) => {
    adminSocket = socket;
    socket.isAdmin = true;
    startRecognitionStream(adminLanguage);
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

  socket.on("audio", (audioChunk) => {
    if (socket === adminSocket && recognizeStream) {
      recognizeStream.write(audioChunk);
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
  RECORDING_CONFIG.config.languageCode = adminLang;
  recognizeStream = speechClient
    .streamingRecognize(RECORDING_CONFIG)
    .on("data", onSpeechData)
    .on("error", (e) => console.log(e));
}

function stopRecognitionStream() {
  if (!recognizeStream) return;
  recognizeStream.destroy();
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

async function onSpeechData(data) {
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
        translateText(text, clientLanguage, currentAdminLanguage)
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

const supportedLanguages = JSON.parse(fs.readFileSync("./languages.json", "utf-8"));
// API routes for List of supported languages
app.get("/api/languages", (req, res) => {
  res.json(supportedLanguages);
});

const PORT = process.env.PORT || 3001; // Fallback port
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
