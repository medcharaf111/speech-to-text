// Reads transcripts aloud with the listener's own device voice (Web Speech API).
// Free, no server involvement, and it scales to any number of listeners.

const VOICE_LANG = {
  en: "en-US", ar: "ar-SA", fr: "fr-FR", es: "es-ES", de: "de-DE", it: "it-IT", pt: "pt-PT",
  ru: "ru-RU", zh: "zh-CN", "zh-CN": "zh-CN", "zh-TW": "zh-TW", ja: "ja-JP", ko: "ko-KR",
  hi: "hi-IN", tr: "tr-TR", nl: "nl-NL", pl: "pl-PL", sv: "sv-SE", da: "da-DK", no: "nb-NO",
  fi: "fi-FI", cs: "cs-CZ", hu: "hu-HU", ro: "ro-RO", th: "th-TH", vi: "vi-VN", id: "id-ID",
  ms: "ms-MY", uk: "uk-UA", el: "el-GR", he: "he-IL", bn: "bn-IN", ta: "ta-IN", te: "te-IN",
  mr: "mr-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", ur: "ur-PK", fa: "fa-IR",
  af: "af-ZA", sq: "sq-AL", am: "am-ET", hy: "hy-AM", az: "az-AZ", eu: "eu-ES", be: "be-BY",
  bs: "bs-BA", bg: "bg-BG", ca: "ca-ES", hr: "hr-HR", et: "et-EE", fil: "fil-PH", gl: "gl-ES",
  ka: "ka-GE", is: "is-IS", jv: "jv-ID", kk: "kk-KZ", km: "km-KH", lo: "lo-LA", lv: "lv-LV",
  lt: "lt-LT", mk: "mk-MK", mn: "mn-MN", my: "my-MM", ne: "ne-NP", si: "si-LK", sk: "sk-SK",
  sl: "sl-SI", su: "su-ID", sw: "sw-KE", uz: "uz-UZ", cy: "cy-GB", zu: "zu-ZA",
};

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

// Voices load asynchronously in Chrome; touching getVoices() early starts that load.
if (synth) {
  try {
    synth.getVoices();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => synth.getVoices();
  } catch {
    // ignore
  }
}

export function pickVoice(langCode) {
  if (!synth) return null;
  const voices = synth.getVoices() || [];
  const wanted = (VOICE_LANG[langCode] || langCode || "").toLowerCase();
  const base = (langCode || "").toLowerCase().split("-")[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === wanted) ||
    voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base + "-")) ||
    voices.find((v) => v.lang.toLowerCase() === base) ||
    null
  );
}

export function hasVoiceFor(langCode) {
  return Boolean(pickVoice(langCode));
}

// A small queue that speaks finals in order and drops the oldest backlog if the device
// cannot keep up, so listeners always hear something close to live.
export function createDeviceSpeaker({ maxBacklog = 3, rate = 1 } = {}) {
  const queue = [];
  const subscribers = new Set();
  let current = null;
  let currentLang = null;
  let muted = false;
  let unlocked = false;

  const notify = () => {
    const state = { speaking: Boolean(current), backlog: queue.length, muted, lang: current ? currentLang : null };
    for (const fn of subscribers) fn(state);
  };

  const next = () => {
    if (!synth || current || muted || queue.length === 0) return;
    const { text, lang } = queue.shift();
    currentLang = lang;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = VOICE_LANG[lang] || lang;
    }
    utterance.rate = rate;
    const done = () => {
      if (current === utterance) current = null;
      notify();
      next();
    };
    utterance.onend = done;
    utterance.onerror = done;
    current = utterance;
    notify();
    synth.speak(utterance);
  };

  return {
    supported: Boolean(synth),
    // Must be called from a user gesture once (iOS/Safari requirement).
    unlock() {
      if (!synth || unlocked) return;
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        synth.speak(u);
        unlocked = true;
      } catch {
        // ignore
      }
    },
    enqueue(text, lang) {
      if (!synth || !text) return;
      queue.push({ text, lang });
      while (queue.length > maxBacklog) queue.shift();
      next();
    },
    cancel() {
      queue.length = 0;
      current = null;
      try {
        synth && synth.cancel();
      } catch {
        // ignore
      }
      notify();
    },
    setMuted(value) {
      muted = Boolean(value);
      if (muted) this.cancel();
      else next();
      notify();
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
