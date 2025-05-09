import React, { useEffect, useRef, useState } from "react";
import { LiveAudioVisualizer } from "react-audio-visualize";
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
    navigator.mediaDevices.enumerateDevices().then((devs) => {
      const inputs = devs.filter((d) => d.kind === "audioinput");
      setMics(inputs);
      if (inputs[0]) setSelectedMic(inputs[0].deviceId);
    });
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
    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: selectedMic } })
      .then((stream) => {
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
    <div>
      <select
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

      {!isRecording ? (
        <button onClick={start}>Start Speaking</button>
      ) : (
        <button onClick={stop}>Stop</button>
      )}

      {isRecording && recorderRef.current && (
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
      )}
    </div>
  );
}

export default AdminPanel;
