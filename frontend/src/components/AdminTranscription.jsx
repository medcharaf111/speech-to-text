import { useEffect, useRef, useState } from "react";
import LanguageSelector from "./LanguageSelector";
import Transcription from "./Transcription";

const MAX_LINES = 200;

// The speaker's own view: finals translated into the chosen language, plus the live
// (not yet final) source text in grey so the speaker sees recognition is working.
function AdminTranscription({ socketRef }) {
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [lines, setLines] = useState([]);
  const [interim, setInterim] = useState("");
  const languageRef = useRef(selectedLanguage);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;

    const register = () => socket.emit("init:client", { language: languageRef.current, role: "listener" });
    const onFinal = ({ text, language }) => {
      if (language !== languageRef.current) return;
      setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), text]);
      setInterim("");
    };
    const onInterim = ({ text }) => setInterim(text);

    if (socket.connected) register();
    socket.on("connect", register);
    socket.on("transcript", onFinal);
    socket.on("transcript:interim", onInterim);

    return () => {
      socket.off("connect", register);
      socket.off("transcript", onFinal);
      socket.off("transcript:interim", onInterim);
    };
  }, [socketRef]);

  const changeLang = (lang) => {
    setSelectedLanguage(lang);
    languageRef.current = lang;
    setLines([]);
    setInterim("");
    socketRef.current?.emit("setLanguage", lang);
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
        <h3 className="h5 mb-0 text-primary d-inline-flex align-items-center">
          <i className="bi bi-card-text me-2"></i>
          Your Transcription
        </h3>
      </div>
      <div className="card-body">
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <LanguageSelector selectedLanguage={selectedLanguage} onLanguageChange={changeLang} />
            <div className="form-text mt-2">Grey text is live recognition; it turns into a sentence once final.</div>
          </div>
          <div className="col-md-8">
            <Transcription lines={lines} interim={interim} placeholder="Press Start Speaking to see your words here." />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminTranscription;
