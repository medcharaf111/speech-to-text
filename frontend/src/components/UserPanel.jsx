import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { BsInfoCircleFill, BsChatTextFill } from "react-icons/bs";
import Transcription from "./Transcription";
import ListenSpeech from "./ListenSpeech";
import LanguageSelector from "./LanguageSelector";
import VoiceModelSelector from "./VoiceModelSelector";

const wsUrl = import.meta.env.VITE_APP_API_URL;

function UserPanel() {
  const socketRef = useRef(null);
  const [lines, setLines] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [selectedVoiceModel, setSelectedVoiceModel] = useState("en-US-Neural2-C");
  const languageRef = useRef(selectedLanguage);
  const voiceModelRef = useRef(selectedVoiceModel);

  useEffect(() => {
    languageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  useEffect(() => {
    voiceModelRef.current = selectedVoiceModel;
  }, [selectedVoiceModel]);

  useEffect(() => {
    socketRef.current = io(wsUrl);

    socketRef.current.on("connect", () => {
      socketRef.current.emit("init:client", { language: selectedLanguage });
    });

    socketRef.current.on("transcript", ({ text, isFinal }) => {
      if (isFinal) {
        if (voiceModelRef.current)
          socketRef.current.emit("tts_send_text", text, voiceModelRef.current, languageRef.current);

        setLines((prev) => {
          const cleanedPrev = prev.trim().replace(/,\s*$/, "");
          return cleanedPrev ? `${cleanedPrev}, ${text}` : text;
        });
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const changeLang = (lang) => {
    setSelectedLanguage(lang);
    if (socketRef.current) {
      socketRef.current.emit("setLanguage", lang);
      setLines(""); // clear old transcript
    }
  };

  const changeVoiceModel = (val) => {
    setSelectedVoiceModel(val);
    // if (socketRef.current) {
    //   socketRef.current.emit("stop_tts_stream");
    //   socketRef.current.emit("setVoiceModel", val);
    // }
  };

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
            <LanguageSelector selectedLanguage={selectedLanguage} onLanguageChange={changeLang} />
            <VoiceModelSelector
              selectedVoiceModel={selectedVoiceModel}
              onChange={changeVoiceModel}
              selectedLanguage={selectedLanguage}
            />
            {socketRef.current && <ListenSpeech socketRef={socketRef.current} />}
          </div>
          <div className="alert alert-info m-3">
            You will see real-time transcriptions and speech of the admin's speech in your selected language.
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
            <Transcription lines={lines} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserPanel;
