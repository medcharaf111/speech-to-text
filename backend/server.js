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

const RECORDING_CONFIG = {
  config: {
    encoding: "WEBM_OPUS",
    sampleRateHertz: 48000,
    languageCode: "en-US",
    interimResults: true,
  },
  singleUtterance: false,
};

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

let adminSocket = null;
const clients = new Map(); // socket -> { language: 'en-US' }
let recognizeStream = null;

io.on("connection", (socket) => {
  socket.on("init:admin", ({ adminLanguage = "en-US" }) => {
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

async function onSpeechData(data) {
  const result = data.results[0];
  if (!result) return;
  const text = result.alternatives[0].transcript;
  const isFinal = result.isFinal;

  // broadcast to each client in their chosen language
  for (let [socket, { language }] of clients) {
    let outText = text;

    if (language !== RECORDING_CONFIG.config.languageCode) {
      const [translation] = await translateClient.translateText({
        parent: `projects/${process.env.GOOGLE_PROJECT_ID}/locations/global`,
        contents: [text],
        mimeType: "text/plain",
        sourceLanguageCode: RECORDING_CONFIG.config.languageCode,
        targetLanguageCode: language,
      });
      outText = translation.translations[0].translatedText;
    }

    socket.emit("transcript", { text: outText, isFinal });
  }
}

const supportedLanguages = JSON.parse(
  fs.readFileSync("./languages.json", "utf-8")
);
// API routes for List of supported languages
app.get("/api/languages", (req, res) => {
  res.json(supportedLanguages);
});

server.listen(process.env.PORT, () =>
  console.log("Server listening on port " + process.env.PORT)
);
