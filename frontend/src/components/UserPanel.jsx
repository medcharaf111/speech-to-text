import React from "react";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import LanguageSelector from "./LanguageSelector";
import { fetchLanguages } from "../utils/api";

const wsUrl = import.meta.env.VITE_APP_API_URL;

function UserPanel({ isRecording }) {
  const [socket, setSocket] = useState(null);
  const [lines, setLines] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");

  useEffect(() => {
    const sock = io(wsUrl);
    sock.on("connect", () => {
      sock.emit("init:client", { selectedLanguage });
    });

    sock.on("transcript", ({ text, isFinal }) => {
      setLines((cur) => [...cur, (isFinal ? "✅ " : "… ") + text]);
    });

    setSocket(sock);

    // Fetch supported languages
    const getLanguages = async () => {
      try {
        const languageList = await fetchLanguages();
        setLanguages(languageList);
      } catch (error) {
        console.error("Failed to fetch languages:", error);
      }
    };

    getLanguages();

    return () => sock.disconnect();
  }, []);

  function changeLang(lang) {
    setSelectedLanguage(lang);
    if (socket) {
      socket.emit("setLanguage", lang);
      setLines([]); // clear old transcript
    }
  }

  return (
    <div>
      <div className="user-panel">
        <div className="card mb-4">
          <div className="card-header bg-secondary text-white">
            <h3>Listener View</h3>
          </div>
          <div className="card-body">
            <div className="alert alert-info">
              <p className="mb-0">
                <i className="bi bi-info-circle me-2"></i>
                You will see real-time transcriptions of the admin's speech in
                your selected language below.
              </p>
            </div>
            <div className="d-flex align-items-center mb-3">
              <span className="ms-2">
                {isRecording
                  ? "Admin is currently speaking"
                  : "Waiting for admin to start speaking"}
              </span>
            </div>
          </div>
        </div>
        <LanguageSelector
          languages={languages}
          selectedLanguage={selectedLanguage}
          onLanguageChange={changeLang}
        />

        <h4>Live Transcriptions</h4>
        <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default UserPanel;
