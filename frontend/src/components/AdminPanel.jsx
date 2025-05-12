import React, { useEffect, useRef, useState } from "react";
import { LiveAudioVisualizer } from "react-audio-visualize";
import { AiFillAudio } from "react-icons/ai";
import { io } from "socket.io-client";

const wsUrl = import.meta.env.VITE_APP_API_URL;

function AdminPanel({ isRecording, setIsRecording }) {
  const [mics, setMics] = useState([]);
  const [selectedMic, setSelectedMic] = useState(null);

  const mediaRef = useRef(null);
  const recorderRef = useRef(null);
  const socketRef = useRef(null);

  // enumerate mics
  useEffect(() => {
    async function fetchMics() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); //prompt for mic access so labels populate
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === "audioinput");
        setMics(audioInputs);
        if (audioInputs[0]) setSelectedMic(audioInputs[0].deviceId);
      } catch (err) {
        console.error("Error fetching mics:", err);
      }
    }

    fetchMics();
  }, []);

  // connect socket.io
  useEffect(() => {
    socketRef.current = io(wsUrl);
    socketRef.current.on("connect", () => {
      socketRef.current.emit("init:admin", { adminLanguage: "en-US" });
    });
    return () => socketRef.current.disconnect();
  }, [wsUrl]);

  function start() {
    navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMic } }).then((stream) => {
      mediaRef.current = stream;
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      recorder.ondataavailable = (e) => {
        if (socketRef.current.connected) {
          socketRef.current.emit("audio", e.data);
        }
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setIsRecording(true);
    });
  }

  function stop() {
    recorderRef.current.stop();
    mediaRef.current.getTracks().forEach((t) => t.stop());
    socketRef.current.emit("stop:admin");
    setIsRecording(false);
  }

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-white py-3">
        <h3 className="h5 mb-0 text-primary">
          <i className="bi bi-mic-fill me-2"></i>
          Speaker Controls
        </h3>
      </div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-md-6">
            <div className="form-group">
              <label className="form-label">
                <i className="bi bi-mic me-2"></i>
                Select Microphone
              </label>
              <select
                className="form-select"
                value={selectedMic || ""}
                onChange={(e) => setSelectedMic(e.target.value)}
                disabled={isRecording}
              >
                {mics.map((m) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || m.deviceId}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="col-md-6 d-flex align-items-end">
            {!isRecording ? (
              <button className="btn btn-primary w-100 py-2 shadow-sm" onClick={start}>
                <i className="bi bi-play-fill me-2"></i>
                Start Speaking
              </button>
            ) : (
              <button className="btn btn-danger w-100 py-2 shadow-sm" onClick={stop}>
                <i className="bi bi-stop-fill me-2"></i>
                Stop Speaking
              </button>
            )}
          </div>
        </div>

        {isRecording && recorderRef.current && (
          <div className="mt-4 p-3 bg-light rounded">
            <h5 className="text-muted mb-3">
              <AiFillAudio className="bi bi-graph-up me-2" />
              Audio Visualization
            </h5>
            <div className="w-100 d-flex align-items-center justify-content-center">
              <LiveAudioVisualizer
                mediaRecorder={recorderRef.current}
                width={600}
                height={100}
                barWidth={2}
                gap={1}
                backgroundColor="transparent"
                barColor="#4caf50"
                fftSize={1024}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
