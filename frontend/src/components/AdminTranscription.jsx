import React, { useEffect, useState } from "react";
import LanguageSelector from "./LanguageSelector";
import Transcription from "./Transcription";

function AdminTranscription({ socketRef }) {
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [lines, setLines] = useState("");

  useEffect(() => {
    socketRef.current.emit("init:client", { selectedLanguage, voiceModel: "aura-2-apollo-en" });

    socketRef.current.on("transcript", ({ text, isFinal }) => {
      if (isFinal) {
        setLines((prev) => {
          const cleanedPrev = prev.trim().replace(/,\s*$/, "");
          return cleanedPrev ? `${cleanedPrev}, ${text}` : text;
        });
      }
    });
  }, []);

  const changeLang = (lang) => {
    setSelectedLanguage(lang);
    if (socketRef.current) {
      socketRef.current.emit("setLanguage", lang);
      setLines(""); // clear old transcript
    }
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
        <h3 className="h5 mb-0 text-primary d-inline-flex align-items-center">
          <i className="bi bi-mic-fill me-2"></i>
          Transcription Controls
        </h3>
      </div>
      <div className="card-body">
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <LanguageSelector selectedLanguage={selectedLanguage} onLanguageChange={changeLang} />
          </div>
          <div className="col-md-8">
            <Transcription lines={lines} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminTranscription;
