import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import Select from "react-select";
import { fetchLanguages } from "../utils/api";
import { WS_URL, SOCKET_OPTS } from "../utils/socket";
import { createDeviceSpeaker } from "../utils/deviceSpeech";
import { selectStyles } from "../utils/selectStyles";

const PREFS_KEY = "seamo.stage";
const BUFFER_CHARS = 600; // rolling history kept per language
const SPEAK_CHARS = 300; // how much of the tail "Speak" reads out
const LINE_HEIGHT = 1.18; // must match .panel__text
const HIDE_CONTROLS_AFTER_MS = 3000;
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.5;

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

const isCJK = (code) => /^(zh|ja|ko)/.test(code);

// Biggest font that still shows the whole latest sentence in a panel of the given size, bounded by a
// geometric maximum (about 18 characters per line at least). `scale` is the manual A−/A+ multiplier.
// Capacity is how many characters fit at the chosen size; the panel shows the newest text that fits,
// so smaller text means more history on screen.
function fitPanel(width, height, cjk, scale, needed) {
  if (!width || !height) return { fontSize: 40, capacity: 120 };
  const avgCharWidth = cjk ? 1.0 : 0.6; // em; Lexend is a wide face
  const usableW = Math.max(120, width - 48);
  const usableH = Math.max(60, height - 64);
  const charsPerLine = (s) => Math.max(1, Math.floor(usableW / (s * avgCharWidth)));
  const linesAvailable = (s) => Math.max(1, Math.floor(usableH / (s * LINE_HEIGHT) + 0.05));
  const targetLines = Math.min(5, Math.max(2, Math.round((usableH / usableW) * 6)));
  const geometricMax = Math.max(16, Math.min(usableH / (targetLines * LINE_HEIGHT), usableW / (18 * avgCharWidth), 360));
  let sentenceFit = geometricMax;
  if (needed > 0) {
    const fits = (s) => charsPerLine(s) * linesAvailable(s) >= needed;
    if (!fits(16)) sentenceFit = 16;
    else {
      let lo = 16;
      let hi = geometricMax;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      sentenceFit = lo;
    }
  }
  // A−/A+ scale the geometric size; the latest sentence is never cut, so A+ stops at the sentence fit.
  const requested = Math.min(400, geometricMax * scale);
  const fontSize = Math.max(16, Math.min(requested, sentenceFit));
  return { fontSize, capacity: charsPerLine(fontSize) * linesAvailable(fontSize), capped: requested > sentenceFit + 0.5 };
}

// Newest `capacity` characters of the text, starting on a word boundary but never after the start of
// the latest sentence, so that sentence stays complete whenever it fits.
function tailOf(text, capacity, cjk, latest = "") {
  if (!text) return "";
  if (text.length <= capacity) return text;
  const latestStart = latest && text.endsWith(latest) ? text.length - latest.length : text.length;
  let start = Math.max(0, text.length - capacity);
  if (!cjk && start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space + 1 < text.length) {
      const boundary = space + 1;
      // when the latest sentence fits, never advance past its first character
      start = start <= latestStart ? Math.min(boundary, latestStart) : boundary;
    }
  }
  return text.slice(start);
}

function PresentationDisplay() {
  const prefs = useRef(loadPrefs());
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]); // [{ code, name }]
  const [buffers, setBuffers] = useState({}); // code -> rolling text
  const [versions, setVersions] = useState({}); // code -> id of the newest sentence (re-triggers the entrance animation)
  const [latest, setLatest] = useState({}); // code -> newest sentence, which the fit always keeps fully visible
  const [sizes, setSizes] = useState({}); // code -> { w, h }
  const [scale, setScale] = useState(prefs.current.scale || 1);
  const [theme, setTheme] = useState(prefs.current.theme === "light" ? "light" : "dark");
  const [connected, setConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speaking, setSpeaking] = useState({ active: false, lang: null });

  const socketRef = useRef(null);
  const speakerRef = useRef(null);
  const speakingRef = useRef(false);
  const selectedRef = useRef([]);
  const buffersRef = useRef({});
  const panelEls = useRef(new Map());
  const observerRef = useRef(null);
  const hideTimer = useRef(null);
  const restored = useRef(false);

  const codes = useMemo(() => selected.map((l) => l.code), [selected]);
  useEffect(() => {
    selectedRef.current = codes;
  }, [codes]);
  useEffect(() => {
    buffersRef.current = buffers;
  }, [buffers]);
  useEffect(() => {
    savePrefs({ codes, scale, theme });
  }, [codes, scale, theme]);

  // Language list, then restore the last selection.
  useEffect(() => {
    fetchLanguages(false)
      .then((langs) => {
        setAvailable(langs);
        if (!restored.current) {
          restored.current = true;
          const wanted = prefs.current.codes || [];
          setSelected(langs.filter((l) => wanted.includes(l.code)));
        }
      })
      .catch((err) => console.error("Error fetching languages:", err));
  }, []);

  // Device voice for "Speak". While it plays into the room, the speaker's mic is paused server-side.
  useEffect(() => {
    const speaker = createDeviceSpeaker({ maxBacklog: 30, rate: 0.95 });
    speakerRef.current = speaker;
    const unsubscribe = speaker.subscribe((state) => {
      const active = state.speaking || state.backlog > 0;
      setSpeaking({ active, lang: state.lang || null });
      if (speakingRef.current && !active) socketRef.current?.emit("resume_listening");
      speakingRef.current = active;
    });
    return () => {
      unsubscribe();
      speaker.cancel();
    };
  }, []);

  // One socket for all displayed languages.
  useEffect(() => {
    const socket = io(WS_URL, SOCKET_OPTS);
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("init:client", { languages: selectedRef.current, role: "display" });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("transcript", ({ id, text, language }) => {
      if (!text || !selectedRef.current.includes(language)) return;
      setBuffers((prev) => {
        const joined = prev[language] ? (isCJK(language) ? prev[language] + text : `${prev[language]} ${text}`) : text;
        return { ...prev, [language]: joined.length > BUFFER_CHARS ? joined.slice(-BUFFER_CHARS) : joined };
      });
      setVersions((prev) => ({ ...prev, [language]: id }));
      setLatest((prev) => ({ ...prev, [language]: text }));
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (socketRef.current?.connected) socketRef.current.emit("setLanguages", codes);
  }, [codes]);

  // Measure every panel so the text can be fitted to it; re-measures on window resize and fullscreen.
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setSizes((prev) => {
        const next = { ...prev };
        for (const entry of entries) next[entry.target.dataset.code] = { w: entry.contentRect.width, h: entry.contentRect.height };
        return next;
      });
    });
    observerRef.current = observer;
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const observer = observerRef.current;
    if (!observer) return;
    observer.disconnect();
    for (const el of panelEls.current.values()) observer.observe(el);
  }, [codes, controlsVisible]);

  // Fullscreen + auto-hiding controls.
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    if (document.fullscreenElement) hideTimer.current = setTimeout(() => setControlsVisible(false), HIDE_CONTROLS_AFTER_MS);
  }, []);
  useEffect(() => {
    if (fullscreen) wakeControls();
    else {
      clearTimeout(hideTimer.current);
      setControlsVisible(true);
    }
    return () => clearTimeout(hideTimer.current);
  }, [fullscreen, wakeControls]);
  useEffect(() => {
    window.addEventListener("mousemove", wakeControls);
    return () => window.removeEventListener("mousemove", wakeControls);
  }, [wakeControls]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const bump = useCallback((delta) => setScale((s) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((s + delta) * 100) / 100))), []);
  const clearAll = useCallback(() => {
    setBuffers({});
    setVersions({});
    setLatest({});
  }, []);
  const speakCodes = useCallback((list) => {
    const speaker = speakerRef.current;
    const items = list.map((code) => [code, buffersRef.current[code]]).filter(([, text]) => text);
    if (!speaker || items.length === 0) return;
    speaker.cancel();
    socketRef.current?.emit("pause_listening");
    speakingRef.current = true;
    setSpeaking({ active: true, lang: items[0][0] });
    setTimeout(() => {
      for (const [code, text] of items) speaker.enqueue(tailOf(text, SPEAK_CHARS, isCJK(code)), code);
    }, 60);
  }, []);
  const speakAll = useCallback(() => speakCodes(selectedRef.current), [speakCodes]);
  const speakOne = useCallback((code) => speakCodes([code]), [speakCodes]);
  const stopSpeaking = useCallback(() => {
    speakerRef.current?.cancel();
    speakingRef.current = false;
    setSpeaking({ active: false, lang: null });
    socketRef.current?.emit("resume_listening");
  }, []);
  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  // Keyboard: F fullscreen, +/- text size, S speak/stop, C clear, T theme.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "f") toggleFullscreen();
      else if (key === "+" || key === "=") bump(0.1);
      else if (key === "-") bump(-0.1);
      else if (key === "c") clearAll();
      else if (key === "t") toggleTheme();
      else if (key === "s") (speakingRef.current ? stopSpeaking : speakAll)();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, bump, clearAll, toggleTheme, stopSpeaking, speakAll]);

  const hasText = codes.some((code) => buffers[code]);
  const columns = selected.length >= 5 ? 2 : 1;
  const fitted = selected.map((lang) => {
    const cjk = isCJK(lang.code);
    const size = sizes[lang.code];
    const fit = fitPanel(size?.w, size?.h, cjk, scale, (latest[lang.code] || "").length);
    return { lang, cjk, ...fit, text: tailOf(buffers[lang.code], fit.capacity, cjk, latest[lang.code]) };
  });
  const atMax = fitted.some((f) => f.text && f.capped);

  return (
    <div className={`stage ${controlsVisible ? "" : "is-hidden-controls"}`} data-theme={theme} data-testid="stage" style={{ "--scale": scale }}>
      <div className="stage__bar" data-testid="stage-bar">
        <div className="brand brand--stage">
          <span className={`live-dot ${connected ? "is-live" : ""}`} />
          Seamo Live
        </div>
        <div className="stage__select" data-testid="stage-languages">
          <Select
            isMulti
            options={available}
            value={selected}
            onChange={(value) => setSelected(value || [])}
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.code}
            placeholder="Add the languages to show…"
            styles={selectStyles(theme, { minHeight: 38 })}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            closeMenuOnSelect={false}
            inputId="stage-language-input"
          />
        </div>
        <div className="stage__tools">
          <div className="seg" role="group" aria-label="Text size">
            <button type="button" onClick={() => bump(-0.1)} title="Smaller text (−)" aria-label="Smaller text" data-testid="text-smaller">
              A−
            </button>
            <span className="seg__label" data-testid="scale-label" title={atMax ? "Larger would cut the latest sentence" : undefined}>
              {atMax ? "max" : `${Math.round(scale * 100)}%`}
            </span>
            <button type="button" onClick={() => bump(0.1)} title="Bigger text (+)" aria-label="Bigger text" data-testid="text-bigger">
              A+
            </button>
          </div>
          <button
            type="button"
            className={`sbtn ${speaking.active ? "is-active" : ""}`}
            onClick={speaking.active ? stopSpeaking : speakAll}
            disabled={!speaking.active && !hasText}
            title="Read every panel aloud, one after another (S)"
            data-testid="speak-all"
          >
            <i className={`bi ${speaking.active ? "bi-stop-fill" : "bi-megaphone-fill"}`} />
            {speaking.active ? "Stop" : "Speak all"}
          </button>
          <button type="button" className="sbtn" onClick={clearAll} title="Clear all panels (C)" data-testid="clear">
            <i className="bi bi-eraser-fill" />
            Clear
          </button>
          <button type="button" className="sbtn" onClick={toggleTheme} title="Switch light / dark (T)" aria-label="Switch theme" data-testid="theme-toggle">
            <i className={`bi ${theme === "dark" ? "bi-sun-fill" : "bi-moon-stars-fill"}`} />
          </button>
          <button type="button" className="sbtn sbtn--primary" onClick={toggleFullscreen} title="Fullscreen (F)" data-testid="fullscreen-toggle">
            <i className={`bi ${fullscreen ? "bi-fullscreen-exit" : "bi-arrows-fullscreen"}`} />
            {fullscreen ? "Exit" : "Fullscreen"}
          </button>
          <span className="stage__hint">F fullscreen · + / − text · S speak · C clear · T theme</span>
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="stage__empty" data-testid="stage-empty">
          <div className="stage__empty-mark">
            <i className="bi bi-translate" />
          </div>
          <h1>Pick the languages to show</h1>
          <p>
            Each one becomes a large caption panel that fills the screen. Press <kbd>F</kbd> for fullscreen once you are set; the controls hide
            themselves and come back when the mouse moves.
          </p>
        </div>
      ) : (
        <div className="stage__panels" data-cols={columns}>
          {fitted.map(({ lang, fontSize, text }) => {
            return (
              <section
                key={lang.code}
                className={`panel ${speaking.lang === lang.code ? "is-speaking" : ""}`}
                data-code={lang.code}
                data-testid={`panel-${lang.code}`}
                ref={(el) => {
                  if (el) panelEls.current.set(lang.code, el);
                  else panelEls.current.delete(lang.code);
                }}
              >
                <header className="panel__label">
                  <span>{lang.name}</span>
                  <button
                    type="button"
                    className="panel__speak"
                    onClick={() => speakOne(lang.code)}
                    disabled={!buffers[lang.code] || speaking.active}
                    title="Read this panel aloud"
                    aria-label={`Read ${lang.name} aloud`}
                  >
                    <i className="bi bi-volume-up-fill" />
                  </button>
                </header>
                <div className={`panel__text ${text ? "" : "is-empty"}`} style={text ? { fontSize: `${fontSize}px` } : undefined} dir="auto" lang={lang.code} data-testid={`text-${lang.code}`}>
                  {text ? (
                    <span key={versions[lang.code] || 0}>{text}</span>
                  ) : (
                    <span className="panel__waiting">
                      <i className="live-dot is-live" /> Waiting for the speaker
                    </span>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PresentationDisplay;
