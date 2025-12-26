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
            setTranscripts((prev) => {
              const newText = text.trim();
              const currentText = prev[langCode] || '';
              
              // Combine with existing text, add space between sentences
              const combinedText = currentText 
                ? `${currentText} ${newText}` 
                : newText;
              
              // Split by sentence boundaries (. ! ?) for better grouping
              const sentences = combinedText.match(/[^.!?]*[.!?]+/g) || [combinedText];
              const trimmedSentences = sentences.map(s => s.trim()).filter(s => s);
              
              // Get max sentences based on language count
              const count = selectedLanguages.length;
              let maxSentences = 15;
              if (count === 1) maxSentences = 20;
              else if (count === 2) maxSentences = 15;
              else if (count === 3) maxSentences = 10;
              else if (count === 4) maxSentences = 8;
              else if (count === 5) maxSentences = 6;
              else maxSentences = 4;
              
              // Keep only the most recent sentences
              const finalSentences = trimmedSentences.length > maxSentences
                ? trimmedSentences.slice(-maxSentences)
                : trimmedSentences;
              
              const finalText = finalSentences.join(' ');
              
              return {
                ...prev,
                [langCode]: finalText,
              };
            });
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

  // Calculate dynamic height and max lines based on number of languages
  const getLanguageHeight = () => {
    const count = selectedLanguages.length;
    return `${100 / count}%`;
  };

  const getMaxLines = () => {
    const count = selectedLanguages.length;
    // More aggressive line limits to ensure text fits
    if (count === 1) return 20;
    if (count === 2) return 12;
    if (count === 3) return 8;
    if (count === 4) return 6;
    if (count === 5) return 5;
    return 4;
  };

  const getFontSize = () => {
    const count = selectedLanguages.length;
    if (count === 1) return '1.4rem';
    if (count === 2) return '1.2rem';
    if (count === 3) return '1rem';
    if (count === 4) return '0.95rem';
    if (count === 5) return '0.9rem';
    return '0.85rem';
  };

  const getHeaderFontSize = () => {
    const count = selectedLanguages.length;
    if (count === 1) return '1.3rem';
    if (count === 2) return '1.1rem';
    if (count === 3) return '1rem';
    if (count === 4) return '0.9rem';
    if (count === 5) return '0.85rem';
    return '0.8rem';
  };

  const getPadding = () => {
    const count = selectedLanguages.length;
    if (count === 1) return '1.5rem 1.5rem';
    if (count === 2) return '1rem 1.2rem';
    if (count === 3) return '0.8rem 1rem';
    if (count === 4) return '0.6rem 0.8rem';
    if (count === 5) return '0.5rem 0.75rem';
    return '0.4rem 0.6rem';
  };

  const getHeaderPadding = () => {
    const count = selectedLanguages.length;
    if (count === 1) return '0.8rem 1.2rem';
    if (count === 2) return '0.6rem 1rem';
    if (count === 3) return '0.5rem 0.8rem';
    if (count === 4) return '0.4rem 0.6rem';
    if (count === 5) return '0.35rem 0.5rem';
    return '0.3rem 0.4rem';
  };

  const getLineHeight = () => {
    const count = selectedLanguages.length;
    if (count === 1) return '1.8';
    if (count === 2) return '1.6';
    if (count === 3) return '1.5';
    if (count === 4) return '1.4';
    if (count === 5) return '1.3';
    return '1.2';
  };

  const getGap = () => {
    const count = selectedLanguages.length;
    if (count === 1) return '1rem';
    if (count <= 3) return '0.75rem';
    return '0.5rem';
  };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#000000' }}>
      <div className="container-fluid" style={{ padding: '1.5rem' }}>
        {/* Header with controls */}
        <div style={{ marginBottom: '2rem' }}>
          <div className="d-flex justify-content-between align-items-center" style={{ 
            background: '#f8f9fa',
            padding: '1.2rem 1.5rem',
            borderRadius: '12px',
            border: '2px solid #e9ecef',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
          }}>
            <h1 style={{ fontSize: '1.8rem', marginBottom: 0, fontWeight: '700', letterSpacing: '0.5px', color: '#000000' }}>
              <i className="bi bi-projector me-3" style={{ color: '#0d6efd' }}></i>
              Live Transcription
              {isConnected ? (
                <span style={{
                  marginLeft: '1rem',
                  padding: '0.4rem 0.8rem',
                  backgroundColor: '#d1f4e0',
                  border: '2px solid #19ba8b',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  display: 'inline-block',
                  fontWeight: '500',
                  color: '#0d7a4f'
                }}>● Connected</span>
              ) : (
                <span style={{
                  marginLeft: '1rem',
                  padding: '0.4rem 0.8rem',
                  backgroundColor: '#ffe0e0',
                  border: '2px solid #dc3545',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  display: 'inline-block',
                  fontWeight: '500',
                  color: '#c92a2a'
                }}>● Disconnected</span>
              )}
            </h1>
            <button style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: '#ffffff',
              color: '#dc3545',
              border: '2px solid #dc3545',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#dc3545';
              e.target.style.color = '#ffffff';
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#ffffff';
              e.target.style.color = '#dc3545';
              e.target.style.transform = 'scale(1)';
            }}
            onClick={clearTranscripts}>
              <i className="bi bi-trash"></i>
              Clear
            </button>
          </div>
        </div>

        {/* Language selector */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            background: '#f8f9fa',
            padding: '1.2rem 1.5rem',
            borderRadius: '12px',
            border: '2px solid #e9ecef',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
          }}>
            <label style={{ 
              fontSize: '1rem', 
              fontWeight: '600', 
              marginBottom: '1rem', 
              display: 'inline-block',
              color: '#2c3e50',
              backgroundColor: '#e8ecef',
              padding: '0.5rem 1rem',
              borderRadius: '20px'
            }}>
              <i className="bi bi-translate me-2" style={{ color: '#0d6efd' }}></i>
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
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={{
                  control: (base) => ({
                    ...base,
                    backgroundColor: "#ffffff",
                    borderColor: "#ced4da",
                    color: "#000000",
                    borderRadius: "8px",
                    border: "2px solid #ced4da",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.08)",
                    transition: "all 0.3s ease",
                  }),
                  menu: (base) => ({
                    ...base,
                    backgroundColor: "#ffffff",
                    borderRadius: "8px",
                    border: "2px solid #e9ecef",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                    zIndex: 9999,
                  }),
                  menuPortal: (base) => ({
                    ...base,
                    zIndex: 9999,
                  }),
                  option: (base, state) => ({
                    ...base,
                    backgroundColor: state.isFocused ? "#e7f3ff" : "#ffffff",
                    color: "#000000",
                    borderRadius: "4px",
                    margin: "0.2rem",
                    transition: "all 0.2s ease",
                  }),
                  multiValue: (base) => ({
                    ...base,
                    backgroundColor: "#e8ecef",
                    borderRadius: "6px",
                  }),
                  multiValueLabel: (base) => ({
                    ...base,
                    color: "#2c3e50",
                    fontWeight: "500",
                  }),
                  singleValue: (base) => ({
                    ...base,
                    color: "#000000",
                  }),
                }}
              />
          </div>
        </div>

        {/* Transcripts display */}
        {selectedLanguages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <i className="bi bi-info-circle" style={{ fontSize: "4rem", opacity: 0.3, display: 'block', marginBottom: '1rem', color: '#6c757d' }}></i>
            <p style={{ fontSize: '1.1rem', color: '#6c757d' }}>Select languages above to start displaying transcripts</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: getGap(), height: 'calc(100vh - 280px)' }}>
            {selectedLanguages.map((lang) => (
              <div 
                key={lang.code} 
                style={{ 
                  height: getLanguageHeight(),
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0
                }}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 0,
                  margin: 0,
                  height: '100%',
                  backgroundColor: '#ffffff',
                  border: '2px solid #e9ecef',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease'
                }}>
                  <div style={{
                    padding: getHeaderPadding(),
                    marginBottom: 0,
                    background: '#e8ecef',
                    borderBottom: 'none',
                    borderRadius: '8px 8px 0 0'
                  }}>
                    <h5 style={{ marginBottom: 0, fontSize: getHeaderFontSize(), fontWeight: '600', letterSpacing: '0.3px', color: '#2c3e50' }}>
                      <i className="bi bi-chat-dots me-2" style={{ color: '#0d6efd' }}></i>
                      {lang.name}
                    </h5>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      fontSize: getFontSize(),
                      lineHeight: getLineHeight(),
                      padding: getPadding(),
                      color: '#000000',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    {transcripts[lang.code] ? (
                      <p 
                        className="mb-0" 
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: getMaxLines(),
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          margin: 0,
                          whiteSpace: 'normal',
                          wordWrap: 'break-word',
                          color: '#000000'
                        }}
                      >
                        {transcripts[lang.code]}
                      </p>
                    ) : (
                      <p className="fst-italic" style={{ margin: 0, color: '#6c757d' }}>Waiting for transcription...</p>
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
