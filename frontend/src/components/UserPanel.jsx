import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import LanguageSelector from "./LanguageSelector";
import { BsInfoCircleFill } from "react-icons/bs";
import { BsChatTextFill } from "react-icons/bs";
import Transcription from "./Transcription";

const wsUrl = import.meta.env.VITE_APP_API_URL;

function UserPanel() {
  const [socket, setSocket] = useState(null);
  const [lines, setLines] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");

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

    return () => sock.disconnect();
  }, []);

  const changeLang = (lang) => {
    setSelectedLanguage(lang);
    if (socket) {
      socket.emit("setLanguage", lang);
      setLines(""); // clear old transcript
    }
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
            <Transcription lines={lines} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserPanel;
