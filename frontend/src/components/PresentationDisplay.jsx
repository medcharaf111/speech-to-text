import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { fetchLanguages } from "../utils/api";
import Select from "react-select";

const WS_URL = import.meta.env.VITE_APP_API_URL;

function PresentationDisplay() {
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [transcripts, setTranscripts] = useState({}); // { languageCode: "transcript text" }
  const [isConnected, setIsConnected] = useState(false);
  const languageSocketsRef = useRef({}); // { languageCode: socketInstance }

  useEffect(() => {
    // Fetch available languages
    fetchLanguages(false)
      .then((langs) => setAvailableLanguages(langs))
      .catch((err) => console.error("Error fetching languages:", err));

    return () => {
      // Clean up all sockets on unmount
      Object.values(languageSocketsRef.current).forEach((socket) => {
        socket.disconnect();
      });
    };
  }, []);

  useEffect(() => {
    if (!WS_URL) {
      console.error("WebSocket URL (VITE_APP_API_URL) is not defined.");
      return;
    }

    // Add new language sockets
    selectedLanguages.forEach((lang) => {
      const langCode = lang.code;

      if (!languageSocketsRef.current[langCode]) {
        console.log(`Creating socket for language: ${langCode}`);
        
        // Create a new socket for this language
        const socket = io(WS_URL);
        languageSocketsRef.current[langCode] = socket;

        socket.on("connect", () => {
          console.log(`Socket connected for ${langCode}`);
          setIsConnected(true);
          // Initialize this socket as a client for this language
          socket.emit("init:client", { language: langCode });
        });

        socket.on("disconnect", () => {
          console.log(`Socket disconnected for ${langCode}`);
          // Check if any sockets are still connected
          const anyConnected = Object.values(languageSocketsRef.current).some(
            (s) => s.connected
          );
          setIsConnected(anyConnected);
        });

        socket.on("transcript", ({ text, isFinal, language }) => {
          if (language === langCode && isFinal) {
            setTranscripts((prev) => ({
              ...prev,
              [langCode]: prev[langCode] ? `${prev[langCode]} ${text}` : text,
            }));
          }
        });
      }
    });

    // Remove sockets for deselected languages
    Object.keys(languageSocketsRef.current).forEach((langCode) => {
      if (!selectedLanguages.find((lang) => lang.code === langCode)) {
        console.log(`Removing socket for language: ${langCode}`);
        const socket = languageSocketsRef.current[langCode];
        socket.disconnect();
        delete languageSocketsRef.current[langCode];
        
        // Remove transcript
        setTranscripts((prev) => {
          const updated = { ...prev };
          delete updated[langCode];
          return updated;
        });
      }
    });

    // Update connection status
    const anyConnected = Object.values(languageSocketsRef.current).some(
      (s) => s.connected
    );
    setIsConnected(anyConnected);
  }, [selectedLanguages]);

  const handleLanguageChange = (selectedOptions) => {
    setSelectedLanguages(selectedOptions || []);
  };

  const clearTranscripts = () => {
    setTranscripts({});
  };

  return (
    <div className="min-vh-100 bg-dark text-white">
      <div className="container-fluid p-4">
        {/* Header with controls */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center bg-secondary p-3 rounded">
              <h1 className="h4 mb-0">
                <i className="bi bi-projector me-2"></i>
                Presentation Display
                {isConnected ? (
                  <span className="badge bg-success ms-2">Connected</span>
                ) : (
                  <span className="badge bg-danger ms-2">Disconnected</span>
                )}
              </h1>
              <button className="btn btn-outline-light btn-sm" onClick={clearTranscripts}>
                <i className="bi bi-trash me-1"></i>
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* Language selector */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="bg-secondary p-3 rounded">
              <label className="form-label fw-bold mb-2">
                <i className="bi bi-translate me-2"></i>
                Select Languages to Display
              </label>
              <Select
                isMulti
                value={selectedLanguages}
                onChange={handleLanguageChange}
                options={availableLanguages}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.code}
                placeholder="Choose languages..."
                className="react-select-container"
                classNamePrefix="react-select"
                styles={{
                  control: (base) => ({
                    ...base,
                    backgroundColor: "#495057",
                    borderColor: "#6c757d",
                    color: "#fff",
                  }),
                  menu: (base) => ({
                    ...base,
                    backgroundColor: "#343a40",
                  }),
                  option: (base, state) => ({
                    ...base,
                    backgroundColor: state.isFocused ? "#495057" : "#343a40",
                    color: "#fff",
                  }),
                  multiValue: (base) => ({
                    ...base,
                    backgroundColor: "#0d6efd",
                  }),
                  multiValueLabel: (base) => ({
                    ...base,
                    color: "#fff",
                  }),
                  singleValue: (base) => ({
                    ...base,
                    color: "#fff",
                  }),
                }}
              />
            </div>
          </div>
        </div>

        {/* Transcripts display */}
        {selectedLanguages.length === 0 ? (
          <div className="row">
            <div className="col-12 text-center py-5">
              <i className="bi bi-info-circle" style={{ fontSize: "3rem", opacity: 0.5 }}></i>
              <p className="mt-3 text-muted">Select languages above to start displaying transcripts</p>
            </div>
          </div>
        ) : (
          <div className="row g-3">
            {selectedLanguages.map((lang) => (
              <div key={lang.code} className="col-12 col-md-6 col-lg-4">
                <div className="card bg-secondary border-0 h-100">
                  <div className="card-header bg-primary text-white">
                    <h5 className="mb-0">
                      <i className="bi bi-chat-dots me-2"></i>
                      {lang.name}
                    </h5>
                  </div>
                  <div
                    className="card-body"
                    style={{
                      minHeight: "300px",
                      maxHeight: "500px",
                      overflowY: "auto",
                      fontSize: "1.1rem",
                      lineHeight: "1.6",
                    }}
                  >
                    {transcripts[lang.code] ? (
                      <p className="mb-0 text-white">{transcripts[lang.code]}</p>
                    ) : (
                      <p className="text-muted fst-italic">Waiting for transcription...</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PresentationDisplay;
