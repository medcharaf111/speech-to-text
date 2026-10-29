import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Link } from "react-router-dom";
import LanguageSelector from "./LanguageSelector";
import { WS_URL, SOCKET_OPTS } from "../utils/socket";
import { createDeviceSpeaker, hasVoiceFor } from "../utils/deviceSpeech";

const MAX_LINES = 200;
const PREFS_KEY = "seamo.listener";
const SCALE_MIN = 0.8;
const SCALE_MAX = 2.2;
const SCALE_STEP = 0.15;

const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
};
const savePrefs = (prefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
};

// Keeps the phone screen on while the page is visible (where the browser supports it).
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // not granted; nothing to do
      }
    };
    request();
    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        lock && lock.release();
      } catch {
        // ignore
      }
    };
  }, []);
}

function UserPanel() {
  const prefs = useRef(loadPrefs());
  const [language, setLanguage] = useState(prefs.current.language || "en");
  const [scale, setScale] = useState(prefs.current.scale || 1);
  const [voiceOn, setVoiceOn] = useState(false); // always starts off: phones need a tap first
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const languageRef = useRef(language);
  const voiceOnRef = useRef(false);
  const socketRef = useRef(null);
  const speakerRef = useRef(null);
  const feedRef = useRef(null);
  const nextId = useRef(1);

  useWakeLock();

  useEffect(() => {
    savePrefs({ language, scale });
  }, [language, scale]);

  // Device voice: free, runs on the listener's own phone or computer.
  useEffect(() => {
    const speaker = createDeviceSpeaker();
    speakerRef.current = speaker;
    const unsubscribe = speaker.subscribe((state) => setSpeaking(state.speaking));
    return () => {
      unsubscribe();
      speaker.cancel();
    };
  }, []);

  // Socket: join the language room, receive final translated sentences.
  useEffect(() => {
    const socket = io(WS_URL, SOCKET_OPTS);
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("init:client", { language: languageRef.current, role: "listener" });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("transcript", ({ text, language: lang }) => {
      if (!text || lang !== languageRef.current) return;
      setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), { id: nextId.current++, text }]);
      if (voiceOnRef.current) speakerRef.current?.enqueue(text, lang);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Follow the newest line unless the reader scrolled up.
  useEffect(() => {
    const el = feedRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [lines, atBottom, scale]);

  const onScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  }, []);

  const jumpToLatest = () => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  };

  const changeLanguage = (code) => {
    setLanguage(code);
    languageRef.current = code;
    setLines([]);
    speakerRef.current?.cancel();
    socketRef.current?.emit("setLanguage", code);
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceOnRef.current = next;
    if (next) {
      speakerRef.current?.unlock(); // inside the tap, as iOS requires
      speakerRef.current?.setMuted(false);
    } else {
      speakerRef.current?.setMuted(true);
    }
  };

  const bump = (delta) => setScale((s) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((s + delta) * 100) / 100)));

  const voiceSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const voiceAvailable = voiceSupported && hasVoiceFor(language);
  const status = !connected ? "Reconnecting…" : lines.length ? "Live" : "Connected · waiting for the speaker";

  return (
    <div className="listener" style={{ "--scale": scale }} data-testid="listener">
      <header className="listener__bar">
        <div className="brand">
          <span className={`live-dot ${connected ? "is-live" : ""}`} />
          Seamo Live
        </div>
        <div className="listener__status" data-testid="status">
          {status}
        </div>
        <Link to="/admin-login" className="ghost-link" title="Speaker login" aria-label="Speaker login">
          <i className="bi bi-mic-fill" />
        </Link>
      </header>

      <div className="listener__controls">
        <LanguageSelector compact theme="auto" selectedLanguage={language} onLanguageChange={changeLanguage} testId="language" />
        <button
          type="button"
          className={`pill ${voiceOn ? "is-on" : ""}`}
          onClick={toggleVoice}
          disabled={!voiceSupported}
          data-testid="voice-toggle"
          aria-pressed={voiceOn}
          title={voiceSupported ? "Read the captions aloud with your device's voice" : "This browser cannot read text aloud"}
        >
          <i className={`bi ${voiceOn ? "bi-volume-up-fill" : "bi-volume-mute-fill"}`} />
          {voiceOn ? (speaking ? "Speaking" : "Voice on") : "Voice off"}
        </button>
        <div className="seg" role="group" aria-label="Text size">
          <button type="button" onClick={() => bump(-SCALE_STEP)} aria-label="Smaller text" data-testid="text-smaller">
            A−
          </button>
          <button type="button" onClick={() => bump(SCALE_STEP)} aria-label="Bigger text" data-testid="text-bigger">
            A+
          </button>
        </div>
      </div>

      {voiceOn && !voiceAvailable && (
        <div className="listener__note">Your device has no voice installed for this language. You will still see the text.</div>
      )}

      <main className="listener__feed" ref={feedRef} onScroll={onScroll} data-testid="feed" aria-live="polite">
        {lines.length === 0 ? (
          <div className="feed-empty">
            <i className="bi bi-chat-square-quote" />
            <div>{connected ? "The speaker's words will appear here in your language." : "Connecting to the live session…"}</div>
          </div>
        ) : (
          lines.map((line, index) => (
            <p key={line.id} className={`feed-line ${index === lines.length - 1 ? "is-latest" : ""}`} dir="auto" lang={language}>
              {line.text}
            </p>
          ))
        )}
      </main>

      {!atBottom && lines.length > 0 && (
        <button type="button" className="jump" onClick={jumpToLatest}>
          <i className="bi bi-arrow-down me-2" />
          Latest
        </button>
      )}
    </div>
  );
}

export default UserPanel;
