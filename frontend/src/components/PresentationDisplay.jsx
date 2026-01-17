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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentSpeakingLanguage, setCurrentSpeakingLanguage] = useState(null);
  const [fontSize, setFontSize] = useState(1.5); // Base font size in rem (1.5rem default)
  const fontSizeRef = useRef(fontSize); // Ref to access current fontSize in socket handlers
  const languageSocketsRef = useRef({}); // { languageCode: socketInstance }
  const speechSynthesisRef = useRef(null);

  // Keep fontSizeRef in sync with fontSize state
  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  // CJK language detection helper
  const isCJKLanguage = (langCode) => {
    const cjkCodes = ['zh', 'ja', 'ko', 'zh-CN', 'zh-TW', 'zh-HK', 'ja-JP', 'ko-KR'];
    return cjkCodes.some(code => langCode.startsWith(code) || langCode === code);
  };

  // Get max units (words or characters) based on font size and language
  const getMaxUnits = (currentFontSize, isCJK) => {
    if (isCJK) {
      // Character-based limit for CJK
      if (currentFontSize >= 3.5) return 15;
      else if (currentFontSize >= 3) return 20;
      else if (currentFontSize >= 2.5) return 25;
      else if (currentFontSize >= 2) return 35;
      else if (currentFontSize >= 1.5) return 45;
      else return 60;
    } else {
      // Word-based limit for other languages
      if (currentFontSize >= 3.5) return 6;
      else if (currentFontSize >= 3) return 8;
      else if (currentFontSize >= 2.5) return 10;
      else if (currentFontSize >= 2) return 12;
      else if (currentFontSize >= 1.5) return 15;
      else return 20;
    }
  };

  // Truncate text based on font size and language type
  const truncateText = (text, langCode, currentFontSize) => {
    if (!text) return '';
    
    const isCJK = isCJKLanguage(langCode);
    const maxUnits = getMaxUnits(currentFontSize, isCJK);
    
    if (isCJK) {
      // Character-based truncation for CJK
      return text.length > maxUnits ? text.slice(-maxUnits) : text;
    } else {
      // Word-based truncation for other languages
      const words = text.split(/\s+/);
      return words.length > maxUnits ? words.slice(-maxUnits).join(' ') : text;
    }
  };

  // Re-truncate existing transcripts when font size changes
  useEffect(() => {
    setTranscripts((prev) => {
      const updated = {};
      Object.keys(prev).forEach((langCode) => {
        updated[langCode] = truncateText(prev[langCode], langCode, fontSize);
      });
      return updated;
    });
  }, [fontSize]);

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
              
              // Combine with existing text (handle CJK without space)
              const isCJK = isCJKLanguage(langCode);
              const combinedText = currentText 
                ? (isCJK ? `${currentText}${newText}` : `${currentText} ${newText}`)
                : newText;
              
              // Truncate based on current font size and language type
              const currentFontSize = fontSizeRef.current;
              const truncatedText = truncateText(combinedText, langCode, currentFontSize);
              
              return {
                ...prev,
                [langCode]: truncatedText,
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

  // Text-to-Speech functionality
  const getLanguageVoice = (languageCode) => {
    const voices = window.speechSynthesis.getVoices();
    
    // Map language codes to voice language codes
    const voiceMap = {
      'en': 'en-US',
      'ar': 'ar-SA',
      'fr': 'fr-FR',
      'es': 'es-ES',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'ru': 'ru-RU',
      'zh': 'zh-CN',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'hi': 'hi-IN',
      'tr': 'tr-TR',
      'nl': 'nl-NL',
      'pl': 'pl-PL',
      'sv': 'sv-SE',
      'da': 'da-DK',
      'no': 'nb-NO',
      'fi': 'fi-FI',
      'cs': 'cs-CZ',
      'hu': 'hu-HU',
      'ro': 'ro-RO',
      'th': 'th-TH',
      'vi': 'vi-VN',
      'id': 'id-ID',
      'ms': 'ms-MY',
      'uk': 'uk-UA',
      'el': 'el-GR',
      'he': 'he-IL',
      'bn': 'bn-IN',
      'ta': 'ta-IN',
      'te': 'te-IN',
      'mr': 'mr-IN',
      'gu': 'gu-IN',
      'kn': 'kn-IN',
      'ml': 'ml-IN',
      'pa': 'pa-IN',
      'ur': 'ur-PK',
      'fa': 'fa-IR',
      'af': 'af-ZA',
      'sq': 'sq-AL',
      'am': 'am-ET',
      'hy': 'hy-AM',
      'az': 'az-AZ',
      'eu': 'eu-ES',
      'be': 'be-BY',
      'bs': 'bs-BA',
      'bg': 'bg-BG',
      'ca': 'ca-ES',
      'hr': 'hr-HR',
      'et': 'et-EE',
      'fil': 'fil-PH',
      'gl': 'gl-ES',
      'ka': 'ka-GE',
      'is': 'is-IS',
      'jv': 'jv-ID',
      'kk': 'kk-KZ',
      'km': 'km-KH',
      'lo': 'lo-LA',
      'lv': 'lv-LV',
      'lt': 'lt-LT',
      'mk': 'mk-MK',
      'mn': 'mn-MN',
      'my': 'my-MM',
      'ne': 'ne-NP',
      'si': 'si-LK',
      'sk': 'sk-SK',
      'sl': 'sl-SI',
      'su': 'su-ID',
      'sw': 'sw-KE',
      'uz': 'uz-UZ',
      'cy': 'cy-GB',
      'zu': 'zu-ZA',
    };

    const voiceLang = voiceMap[languageCode] || languageCode;
    
    // Try to find a voice that matches the language
    const matchingVoice = voices.find(voice => voice.lang.startsWith(voiceLang)) ||
                          voices.find(voice => voice.lang.startsWith(languageCode));
    
    return matchingVoice || voices[0]; // fallback to first voice if no match
  };

  const speakText = (text, languageCode) => {
    if (!text || isSpeaking) {
      console.log('Cannot speak:', { hasText: !!text, isSpeaking });
      return;
    }

    console.log('Starting speech for language:', languageCode, 'Text:', text);

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Notify all sockets to pause listening (only if sockets exist)
    const sockets = Object.values(languageSocketsRef.current);
    if (sockets.length > 0) {
      sockets.forEach((socket) => {
        if (socket && socket.connected) {
          socket.emit("pause_listening");
        }
      });
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getLanguageVoice(languageCode);
    
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
      console.log('Using voice:', voice.name, voice.lang);
    } else {
      // Fallback to language code
      utterance.lang = languageCode;
      console.log('No specific voice found, using language code:', languageCode);
    }

    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    setIsSpeaking(true);
    setCurrentSpeakingLanguage(languageCode);

    utterance.onstart = () => {
      console.log('Speech started for:', languageCode);
    };

    utterance.onend = () => {
      console.log('Speech ended for:', languageCode);
      setIsSpeaking(false);
      setCurrentSpeakingLanguage(null);
      
      // Notify all sockets to resume listening
      console.log('Emitting resume_listening to all sockets');
      Object.values(languageSocketsRef.current).forEach((socket) => {
        if (socket && socket.connected) {
          console.log('Sending resume_listening to socket');
          socket.emit("resume_listening");
        }
      });
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      setIsSpeaking(false);
      setCurrentSpeakingLanguage(null);
      
      // Resume listening on error
      console.log('Error occurred, emitting resume_listening to all sockets');
      Object.values(languageSocketsRef.current).forEach((socket) => {
        if (socket && socket.connected) {
          socket.emit("resume_listening");
        }
      });
    };

    // Fallback: if onend doesn't fire within 30 seconds, resume anyway
    const fallbackTimeout = setTimeout(() => {
      if (isSpeaking) {
        console.log('Fallback: resuming listening after timeout');
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setCurrentSpeakingLanguage(null);
        Object.values(languageSocketsRef.current).forEach((socket) => {
          if (socket && socket.connected) {
            socket.emit("resume_listening");
          }
        });
      }
    }, 30000);

    // Clear fallback when speech ends normally
    utterance.onend = () => {
      clearTimeout(fallbackTimeout);
      console.log('Speech ended for:', languageCode);
      setIsSpeaking(false);
      setCurrentSpeakingLanguage(null);
      
      // Notify all sockets to resume listening
      console.log('Emitting resume_listening to all sockets');
      Object.values(languageSocketsRef.current).forEach((socket) => {
        if (socket && socket.connected) {
          console.log('Sending resume_listening to socket');
          socket.emit("resume_listening");
        }
      });
    };

    window.speechSynthesis.speak(utterance);
  };

  const speakAll = async () => {
    if (isSpeaking || selectedLanguages.length === 0) return;

    // Function to speak one language and wait for completion
    const speakLanguage = (lang) => {
      return new Promise((resolve) => {
        const text = transcripts[lang.code];
        if (!text) {
          resolve();
          return;
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = getLanguageVoice(lang.code);
        
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }

        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        setCurrentSpeakingLanguage(lang.code);

        utterance.onend = () => {
          console.log('speakAll: finished speaking', lang.name);
          setCurrentSpeakingLanguage(null);
          resolve();
        };

        utterance.onerror = (event) => {
          console.error("speakAll: Speech synthesis error:", event);
          setCurrentSpeakingLanguage(null);
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      });
    };

    console.log('speakAll: Starting, pausing listening');
    
    // Pause listening
    Object.values(languageSocketsRef.current).forEach((socket) => {
      if (socket && socket.connected) {
        socket.emit("pause_listening");
      }
    });

    setIsSpeaking(true);

    // Speak each language sequentially
    for (const lang of selectedLanguages) {
      await speakLanguage(lang);
    }

    console.log('speakAll: Finished all, resuming listening');
    setIsSpeaking(false);
    
    // Resume listening after all languages are spoken
    Object.values(languageSocketsRef.current).forEach((socket) => {
      if (socket && socket.connected) {
        socket.emit("resume_listening");
      }
    });
  };

  const stopSpeaking = () => {
    console.log('Stopping speech');
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setCurrentSpeakingLanguage(null);
    
    // Resume listening
    const sockets = Object.values(languageSocketsRef.current);
    if (sockets.length > 0) {
      sockets.forEach((socket) => {
        if (socket && socket.connected) {
          socket.emit("resume_listening");
        }
      });
    }
  };

  // Load voices when component mounts
  useEffect(() => {
    // Load voices
    const loadVoices = () => {
      window.speechSynthesis.getVoices();
    };
    
    loadVoices();
    
    // Chrome requires this event listener
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      // Cancel any ongoing speech on unmount
      window.speechSynthesis.cancel();
    };
  }, []);

  // Calculate dynamic height and max lines based on number of languages
  const getLanguageHeight = () => {
    const count = selectedLanguages.length;
    return `${100 / count}%`;
  };

  const getMaxLines = () => {
    // Subtitle style: always 2 lines max
    return 2;
  };

  // Font size controls
  const increaseFontSize = () => {
    setFontSize((prev) => Math.min(prev + 0.25, 4)); // Max 4rem
  };

  const decreaseFontSize = () => {
    setFontSize((prev) => Math.max(prev - 0.25, 0.75)); // Min 0.75rem
  };

  const getFontSize = () => {
    // Use base fontSize, slightly adjusted by language count
    const count = selectedLanguages.length;
    let multiplier = 1;
    if (count >= 5) multiplier = 0.85;
    else if (count >= 4) multiplier = 0.9;
    else if (count >= 3) multiplier = 0.95;
    return `${fontSize * multiplier}rem`;
  };

  const getHeaderFontSize = () => {
    // Header is slightly smaller than content
    return `${fontSize * 0.7}rem`;
  };

  const getPadding = () => {
    // Scale padding with font size
    const basePad = fontSize * 0.5;
    return `${basePad}rem ${basePad * 1.2}rem`;
  };

  const getHeaderPadding = () => {
    const basePad = fontSize * 0.35;
    return `${basePad}rem ${basePad * 1.5}rem`;
  };

  const getLineHeight = () => {
    // Slightly tighter line height for larger fonts
    if (fontSize >= 2.5) return '1.3';
    if (fontSize >= 2) return '1.4';
    return '1.5';
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
              {isSpeaking && (
                <span style={{
                  marginLeft: '1rem',
                  padding: '0.4rem 0.8rem',
                  backgroundColor: '#fff3cd',
                  border: '2px solid #ffc107',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  display: 'inline-block',
                  fontWeight: '500',
                  color: '#856404'
                }}>🔊 Speaking...</span>
              )}
            </h1>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {/* Font size controls */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.25rem',
                backgroundColor: '#e8ecef',
                padding: '0.3rem 0.5rem',
                borderRadius: '8px',
                border: '2px solid #ced4da'
              }}>
                <button
                  onClick={decreaseFontSize}
                  disabled={fontSize <= 0.75}
                  style={{
                    padding: '0.3rem 0.6rem',
                    backgroundColor: fontSize <= 0.75 ? '#e9ecef' : '#ffffff',
                    color: fontSize <= 0.75 ? '#adb5bd' : '#495057',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    cursor: fontSize <= 0.75 ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '700',
                    lineHeight: 1
                  }}
                  title="Decrease font size"
                >
                  A-
                </button>
                <span style={{ 
                  padding: '0 0.5rem', 
                  fontSize: '0.85rem', 
                  fontWeight: '500',
                  color: '#495057',
                  minWidth: '3rem',
                  textAlign: 'center'
                }}>
                  {fontSize.toFixed(2)}
                </span>
                <button
                  onClick={increaseFontSize}
                  disabled={fontSize >= 4}
                  style={{
                    padding: '0.3rem 0.6rem',
                    backgroundColor: fontSize >= 4 ? '#e9ecef' : '#ffffff',
                    color: fontSize >= 4 ? '#adb5bd' : '#495057',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    cursor: fontSize >= 4 ? 'not-allowed' : 'pointer',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    lineHeight: 1
                  }}
                  title="Increase font size"
                >
                  A+
                </button>
              </div>
              
              {selectedLanguages.length > 0 && (
                <>
                  <button style={{
                    padding: '0.6rem 1.2rem',
                    backgroundColor: isSpeaking ? '#ffc107' : '#ffffff',
                    color: isSpeaking ? '#ffffff' : '#0d6efd',
                    border: '2px solid #0d6efd',
                    borderRadius: '8px',
                    cursor: isSpeaking ? 'pointer' : 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSpeaking) {
                      e.target.style.backgroundColor = '#0d6efd';
                      e.target.style.color = '#ffffff';
                      e.target.style.transform = 'scale(1.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSpeaking) {
                      e.target.style.backgroundColor = '#ffffff';
                      e.target.style.color = '#0d6efd';
                      e.target.style.transform = 'scale(1)';
                    }
                  }}
                  onClick={isSpeaking ? stopSpeaking : speakAll}
                  disabled={selectedLanguages.every(lang => !transcripts[lang.code])}
                  >
                    {isSpeaking ? (
                      <>
                        <i className="bi bi-stop-circle"></i>
                        Stop
                      </>
                    ) : (
                      <>
                        <i className="bi bi-play-circle"></i>
                        Speak All
                      </>
                    )}
                  </button>
                </>
              )}
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
                    background: currentSpeakingLanguage === lang.code ? '#fff3cd' : '#e8ecef',
                    borderBottom: 'none',
                    borderRadius: '8px 8px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <h5 style={{ marginBottom: 0, fontSize: getHeaderFontSize(), fontWeight: '600', letterSpacing: '0.3px', color: '#2c3e50' }}>
                      <i className="bi bi-chat-dots me-2" style={{ color: '#0d6efd' }}></i>
                      {lang.name}
                    </h5>
                    <button
                      onClick={() => speakText(transcripts[lang.code], lang.code)}
                      disabled={!transcripts[lang.code] || isSpeaking}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: (!transcripts[lang.code] || isSpeaking) ? 'not-allowed' : 'pointer',
                        fontSize: getHeaderFontSize(),
                        color: currentSpeakingLanguage === lang.code ? '#ffc107' : '#0d6efd',
                        opacity: (!transcripts[lang.code] || isSpeaking) ? 0.4 : 1,
                        transition: 'all 0.2s ease',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px'
                      }}
                      onMouseEnter={(e) => {
                        if (transcripts[lang.code] && !isSpeaking) {
                          e.target.style.backgroundColor = '#e7f3ff';
                          e.target.style.transform = 'scale(1.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = 'transparent';
                        e.target.style.transform = 'scale(1)';
                      }}
                      title={isSpeaking ? 'Speaking...' : 'Click to speak this language'}
                    >
                      {currentSpeakingLanguage === lang.code ? (
                        <i className="bi bi-volume-up-fill"></i>
                      ) : (
                        <i className="bi bi-volume-up"></i>
                      )}
                    </button>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      fontSize: getFontSize(),
                      lineHeight: getLineHeight(),
                      padding: getPadding(),
                      color: '#000000',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {transcripts[lang.code] ? (
                      <p 
                        className="mb-0" 
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          margin: 0,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          textAlign: 'center',
                          color: '#000000',
                          maxWidth: '100%'
                        }}
                      >
                        {transcripts[lang.code]}
                      </p>
                    ) : (
                      <p className="fst-italic" style={{ margin: 0, color: '#6c757d', textAlign: 'center' }}>Waiting for transcription...</p>
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
