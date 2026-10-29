"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, ".env") });

// Resolve the Google credentials file relative to this folder so it works regardless of the cwd.
{
  const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS || "seamo.json";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.isAbsolute(cred) ? cred : path.join(__dirname, cred);
}

const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const { TranslationServiceClient } = require("@google-cloud/translate").v3;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const cfg = {
  port: Number(process.env.PORT) || 5000,
  host: process.env.HOST || "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  adminEmail: (process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  tokenSecret: process.env.ADMIN_TOKEN_SECRET || "",
  tokenTtlMs: (Number(process.env.ADMIN_TOKEN_TTL_HOURS) || 24) * 60 * 60 * 1000,
  deepgramKey: process.env.DEEPGRAM_API_KEY || "",
  deepgramModel: process.env.DEEPGRAM_MODEL || "",
  // Leave unset: Deepgram's default endpointing gave one clean final per sentence in testing,
  // while 300ms produced empty finals that dropped whole sentences.
  endpointingMs: Number(process.env.DEEPGRAM_ENDPOINTING_MS) || 0,
  googleProject: process.env.GOOGLE_PROJECT_ID || "",
  pauseFromDisplay: (process.env.PAUSE_FROM_DISPLAY || "true") !== "false",
  maxTranslateChars: Number(process.env.MAX_TRANSLATE_CHARS) || 2000,
  loginMaxAttempts: 10,
  loginWindowMs: 15 * 60 * 1000,
};

if (!cfg.adminEmail || !cfg.adminPassword) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in backend/.env; refusing to start.");
  process.exit(1);
}
if (!cfg.deepgramKey) {
  console.error("DEEPGRAM_API_KEY must be set in backend/.env; refusing to start.");
  process.exit(1);
}
if (!cfg.tokenSecret) {
  // Derived deterministically so a restart does not log the speaker out.
  cfg.tokenSecret = crypto.createHash("sha256").update(`seamo-token:${cfg.adminPassword}`).digest("hex");
}

const listenerLanguages = JSON.parse(fs.readFileSync(path.join(__dirname, "static/languages.json"), "utf-8"));
const adminLanguages = JSON.parse(fs.readFileSync(path.join(__dirname, "static/admin_languages.json"), "utf-8"));
const listenerCodes = new Set(listenerLanguages.map((l) => l.code));
const adminCodes = new Set(adminLanguages.map((l) => l.code));

const deepgram = createClient(cfg.deepgramKey);
const translateClient = new TranslationServiceClient();

// ---------------------------------------------------------------------------
// Speaker authentication: password checked here, short-lived signed token for the socket.
// ---------------------------------------------------------------------------
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest();
}
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}
function sign(payload) {
  return crypto.createHmac("sha256", cfg.tokenSecret).update(payload).digest("base64url");
}
function issueToken() {
  const exp = String(Date.now() + cfg.tokenTtlMs);
  return `${exp}.${sign(exp)}`;
}
function verifyToken(token) {
  if (typeof token !== "string" || token.length > 200) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

const loginAttempts = new Map(); // ip -> { count, resetAt }
function clientIp(req) {
  return req.headers["cf-connecting-ip"] || req.ip || "unknown";
}
function registerLoginAttempt(ip) {
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + cfg.loginWindowMs };
    loginAttempts.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= cfg.loginMaxAttempts;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) if (entry.resetAt < now) loginAttempts.delete(ip);
}, 60 * 1000).unref();

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------
const app = express();
app.set("trust proxy", true);
app.use(cors({ origin: cfg.corsOrigin }));
app.use(express.json({ limit: "10kb" }));

app.get("/api/languages", (req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json(req.query.isAdmin === "true" ? adminLanguages : listenerLanguages);
});

app.get("/api/health", (req, res) => {
  const stats = listenerStats();
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    listeners: stats.total,
    streaming: Boolean(recognition),
    finals: usage.finals,
    translatedChars: usage.translatedChars,
  });
});

app.post("/api/admin/login", (req, res) => {
  const ip = clientIp(req);
  if (!registerLoginAttempt(ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }
  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const ok = safeEqual(email, cfg.adminEmail) && safeEqual(password, cfg.adminPassword);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  loginAttempts.delete(ip);
  const token = issueToken();
  console.log(`[auth] speaker login from ${ip}`);
  res.json({ token, expiresAt: Number(token.split(".")[0]) });
});

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: cfg.corsOrigin },
  serveClient: false,
  maxHttpBufferSize: 1e6,
  pingInterval: 25000,
  pingTimeout: 20000,
  perMessageDeflate: false,
});

const ROOM_PREFIX = "lang:";
const roomFor = (code) => `${ROOM_PREFIX}${code}`;

let adminSocket = null;
let recognition = null; // { conn, lang, model, open, keepAlive, finals }
const pausingSockets = new Set(); // display sockets currently playing audio into the room
let finalSeq = 0;
const usage = { finals: 0, translatedChars: 0, translateCalls: 0, translateErrors: 0 };

function isPaused() {
  return pausingSockets.size > 0;
}
function setPause(socket, on) {
  const before = isPaused();
  if (on) pausingSockets.add(socket.id);
  else pausingSockets.delete(socket.id);
  const after = isPaused();
  if (before !== after && adminSocket) adminSocket.emit(after ? "pause_recording" : "resume_recording");
}

// Languages that currently have at least one socket in their room (admin included, so the
// speaker's own transcription panel is served too).
function activeLanguages() {
  const codes = [];
  for (const [room, members] of io.sockets.adapter.rooms) {
    if (room.startsWith(ROOM_PREFIX) && members.size > 0) codes.push(room.slice(ROOM_PREFIX.length));
  }
  return codes;
}

// Listener counts for the speaker's dashboard. The admin's own socket and the
// presentation displays are not listeners; displays are reported separately.
function listenerStats() {
  const byLanguage = {};
  let total = 0;
  let displays = 0;
  for (const s of io.sockets.sockets.values()) if (s.role === "display") displays += 1;
  for (const [room, members] of io.sockets.adapter.rooms) {
    if (!room.startsWith(ROOM_PREFIX)) continue;
    let n = 0;
    for (const id of members) {
      const s = io.sockets.sockets.get(id);
      if (s && !s.isAdmin && s.role !== "display") n += 1;
    }
    if (n > 0) {
      byLanguage[room.slice(ROOM_PREFIX.length)] = n;
      total += n;
    }
  }
  return { total, displays, byLanguage };
}

// A listener follows one language; the presentation display follows several on one socket.
const MAX_LANGUAGES_PER_SOCKET = 20;
function setSocketLanguages(socket, codes) {
  const list = Array.isArray(codes) ? codes : [codes];
  const wanted = new Set(list.filter((c) => typeof c === "string" && listenerCodes.has(c)).slice(0, MAX_LANGUAGES_PER_SOCKET));
  const current = socket.languages || new Set();
  for (const code of current) if (!wanted.has(code)) socket.leave(roomFor(code));
  for (const code of wanted) if (!current.has(code)) socket.join(roomFor(code));
  socket.languages = wanted;
  return wanted.size > 0;
}

io.on("connection", (socket) => {
  socket.on("init:admin", (payload) => {
    const token = payload && typeof payload === "object" ? payload.token : payload;
    if (!verifyToken(token)) {
      socket.emit("admin:unauthorized");
      return;
    }
    if (adminSocket && adminSocket !== socket) {
      adminSocket.isAdmin = false;
      adminSocket.emit("admin:replaced");
      stopRecognition();
    }
    adminSocket = socket;
    socket.isAdmin = true;
    socket.emit("admin:ready", { streaming: Boolean(recognition), paused: isPaused(), stats: listenerStats() });
  });

  socket.on("init:client", (payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    socket.role = p.role === "display" ? "display" : "listener";
    setSocketLanguages(socket, p.languages !== undefined ? p.languages : p.language);
  });

  socket.on("setLanguage", (code) => {
    setSocketLanguages(socket, code);
  });

  socket.on("setLanguages", (codes) => {
    setSocketLanguages(socket, codes);
  });

  socket.on("start:admin", (payload) => {
    if (!socket.isAdmin || socket !== adminSocket) return;
    const lang = payload && typeof payload === "object" ? payload.adminLanguage : null;
    if (!adminCodes.has(lang)) {
      socket.emit("recognition:error", { message: `Unsupported speaking language: ${lang}` });
      return;
    }
    startRecognition(lang);
  });

  socket.on("stop:admin", () => {
    if (socket === adminSocket) stopRecognition();
  });

  socket.on("audio", (chunk) => {
    if (socket !== adminSocket || !recognition || !recognition.open || isPaused()) return;
    if (!chunk || !chunk.length || chunk.length > 262144) return;
    try {
      recognition.conn.send(chunk);
    } catch (err) {
      console.error("[deepgram] send failed:", err.message);
    }
  });

  // Only the presentation display (which plays audio into the same room as the microphone)
  // may pause the speaker. Remote listeners never do.
  socket.on("pause_listening", () => {
    if (cfg.pauseFromDisplay && socket.role === "display") setPause(socket, true);
  });
  socket.on("resume_listening", () => {
    if (socket.role === "display") setPause(socket, false);
  });

  socket.on("disconnect", () => {
    if (socket === adminSocket) {
      adminSocket = null;
      stopRecognition();
    }
    if (pausingSockets.has(socket.id)) setPause(socket, false);
  });
});

// Speaker dashboard stats.
setInterval(() => {
  if (adminSocket) adminSocket.emit("stats", listenerStats());
}, 5000).unref();

// Periodic usage line in the log.
setInterval(() => {
  const s = listenerStats();
  console.log(
    `[usage] listeners=${s.total} languages=${Object.keys(s.byLanguage).length} streaming=${Boolean(recognition)} ` +
      `finals=${usage.finals} translateCalls=${usage.translateCalls} translatedChars=${usage.translatedChars} translateErrors=${usage.translateErrors}`
  );
}, 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Deepgram live recognition (one stream for the single speaker)
// ---------------------------------------------------------------------------
function startRecognition(lang) {
  stopRecognition();
  const model = cfg.deepgramModel || (lang.startsWith("en") ? "nova-3" : "nova-2");
  const options = { model, language: lang, smart_format: true, interim_results: true };
  if (cfg.endpointingMs > 0) options.endpointing = cfg.endpointingMs;
  const conn = deepgram.listen.live(options);
  const rec = { conn, lang, model, open: false, keepAlive: null, finals: 0, startedAt: Date.now() };
  recognition = rec;
  console.log(`[deepgram] starting (${model}, ${lang})`);

  conn.on(LiveTranscriptionEvents.Open, () => {
    if (recognition !== rec) return;
    rec.open = true;
    rec.keepAlive = setInterval(() => {
      try {
        conn.keepAlive();
      } catch (err) {
        console.error("[deepgram] keep-alive failed:", err.message);
      }
    }, 8000);
    console.log("[deepgram] open");
    if (adminSocket) adminSocket.emit("recognition:open", { model, language: lang });
  });

  conn.on(LiveTranscriptionEvents.Transcript, (data) => {
    if (recognition !== rec) return;
    const text = data && data.channel && data.channel.alternatives && data.channel.alternatives[0]
      ? data.channel.alternatives[0].transcript
      : "";
    if (!text || !text.trim()) return;
    if (data.is_final) {
      rec.finals += 1;
      handleFinal(text.trim(), lang);
    } else if (adminSocket) {
      adminSocket.emit("transcript:interim", { text });
    }
  });

  conn.on(LiveTranscriptionEvents.Error, (err) => {
    console.error("[deepgram] error:", (err && err.message) || err);
    if (recognition !== rec) return;
    stopRecognition();
    if (adminSocket) adminSocket.emit("recognition:error", { message: "Speech recognition error. Press Start Speaking again." });
  });

  conn.on(LiveTranscriptionEvents.Close, (event) => {
    if (recognition !== rec) return;
    const code = event && event.code;
    const reason = event && event.reason;
    console.log(`[deepgram] closed by remote (code ${code}${reason ? `, ${reason}` : ""})`);
    stopRecognition();
    if (adminSocket) adminSocket.emit("recognition:closed");
  });
}

function stopRecognition() {
  const rec = recognition;
  if (!rec) return;
  recognition = null;
  if (rec.keepAlive) clearInterval(rec.keepAlive);
  try {
    rec.conn.requestClose();
  } catch (err) {
    // already closed
  }
  const secs = Math.round((Date.now() - rec.startedAt) / 1000);
  console.log(`[deepgram] stopped after ${secs}s, ${rec.finals} final segments`);
}

// ---------------------------------------------------------------------------
// Translation: once per language per final segment, then broadcast to the language room.
// ---------------------------------------------------------------------------
function normalizeLang(code) {
  if (!code) return code;
  if (/^zh/i.test(code)) {
    const c = code.toLowerCase();
    return c === "zh-tw" || c === "zh-hant" || c === "zh-hk" ? "zh-TW" : "zh-CN";
  }
  const m = /^([a-z]{2,3})-[A-Z0-9]{2,3}$/.exec(code); // en-US, pt-BR, es-419 -> base language
  if (m) return m[1];
  return code; // fr, ms-Arab, mni-Mtei, pa-Arab stay as they are
}

const translateCache = new Map();
const TRANSLATE_CACHE_MAX = 2000;

async function translate(text, target, source) {
  if (text.length > cfg.maxTranslateChars) text = text.slice(0, cfg.maxTranslateChars);
  const key = `${source}|${target}|${text}`;
  const cached = translateCache.get(key);
  if (cached !== undefined) return cached;
  usage.translateCalls += 1;
  usage.translatedChars += text.length;
  const [response] = await translateClient.translateText({
    parent: `projects/${cfg.googleProject}/locations/global`,
    contents: [text],
    mimeType: "text/plain",
    sourceLanguageCode: source,
    targetLanguageCode: target,
  });
  const out = (response.translations && response.translations[0] && response.translations[0].translatedText) || text;
  translateCache.set(key, out);
  if (translateCache.size > TRANSLATE_CACHE_MAX) translateCache.delete(translateCache.keys().next().value);
  return out;
}

async function handleFinal(text, sourceLang) {
  const id = ++finalSeq;
  const ts = Date.now();
  usage.finals += 1;
  if (adminSocket) adminSocket.emit("transcript:final", { id, text, language: sourceLang, ts });

  const languages = activeLanguages();
  if (languages.length === 0) return;
  const src = normalizeLang(sourceLang);

  await Promise.all(
    languages.map(async (code) => {
      let out = text;
      const tgt = normalizeLang(code);
      if (tgt !== src) {
        try {
          out = await translate(text, tgt, src);
        } catch (err) {
          usage.translateErrors += 1;
          console.error(`[translate] ${src}->${tgt} failed: ${err.message}`);
        }
      }
      io.to(roomFor(code)).emit("transcript", { id, text: out, language: code, isFinal: true, ts });
    })
  );
}

// ---------------------------------------------------------------------------
// Startup / shutdown
// ---------------------------------------------------------------------------
server.listen(cfg.port, cfg.host, () => {
  console.log(`Server listening on ${cfg.host}:${cfg.port} (pauseFromDisplay=${cfg.pauseFromDisplay}, endpointing=${cfg.endpointingMs > 0 ? `${cfg.endpointingMs}ms` : "default"})`);
});

function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  stopRecognition();
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
