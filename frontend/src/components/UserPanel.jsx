import React from "react";
import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import LanguageSelector from "./LanguageSelector";
import { fetchLanguages } from "../utils/api";
import { BsInfoCircleFill } from "react-icons/bs";
import { BsChatTextFill } from "react-icons/bs";

const wsUrl = import.meta.env.VITE_APP_API_URL;

function UserPanel() {
  const [socket, setSocket] = useState(null);
  const [lines, setLines] = useState("");
  const [languages, setLanguages] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const transcriptRef = useRef(null);

  useEffect(() => {
    const sock = io(wsUrl);
    sock.on("connect", () => {
      sock.emit("init:client", { selectedLanguage });
    });

    sock.on("transcript", ({ text, isFinal }) => {
      if (isFinal) {
        setLines((prev) => {
          const cleanedPrev = prev.trim().replace(/,\s*$/, "");
          return cleanedPrev ? `${cleanedPrev}, ${text}` : text;
        });
      }
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

  // Auto scroll to bottom when new content arrives
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [lines]);

  function changeLang(lang) {
    setSelectedLanguage(lang);
    if (socket) {
      socket.emit("setLanguage", lang);
      setLines(""); // clear old transcript
    }
  }

  return (
    <div className="row g-4 h-100">
      <div className="col-md-4">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white py-3">
            <h3 className="h5 mb-0 text-primary d-flex flex-col gap-2">
              <BsInfoCircleFill className="" />
              Settings
            </h3>
          </div>
          <div className="card-body">
            <LanguageSelector languages={languages} selectedLanguage={selectedLanguage} onLanguageChange={changeLang} />
          </div>
          <div className="alert alert-info m-3">
            You will see real-time transcriptions of the admin's speech in your selected language below.
          </div>
        </div>
      </div>

      <div className="col-md-8">
        <div className="card shadow-sm h-100">
          <div className="card-header bg-white py-3">
            <div className="d-flex justify-content-between align-items-center">
              <h3 className="h5 mb-0 text-primary">
                <BsChatTextFill style={{ marginRight: "0.5rem" }} />
                Live Transcriptions
              </h3>
            </div>
          </div>
          <div className="card-body p-0">
            <div
              ref={transcriptRef}
              className="transcript-container p-4 bg-light"
              style={{
                height: "calc(100vh - 250px)",
                overflowY: "auto",
                lineHeight: "1.6",
              }}
            >
              {!lines ? (
                <div className="text-center text-muted" style={{ paddingTop: "5.5rem", paddingBottom: "5.5rem" }}>
                  <p>No transcriptions yet. They will appear here when the admin starts speaking.</p>
                </div>
              ) : (
                <div className="transcript-text">
                  {lines.split(". ").map((sentence, index, array) => (
                    <p key={index}>
                      {sentence.trim() && (
                        <p className="mb-3">
                          {sentence.trim()}
                          {index < array.length - 1 ? "." : ""}
                        </p>
                      )}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserPanel;
