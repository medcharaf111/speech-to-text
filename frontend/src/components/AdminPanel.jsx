import { useEffect, useRef, useState, useCallback } from "react";
import { LiveAudioVisualizer } from "react-audio-visualize";
import { AiFillAudio } from "react-icons/ai";
import { io } from "socket.io-client";
import LanguageSelector from "./LanguageSelector";

const WS_URL = import.meta.env.VITE_APP_API_URL;
const AUDIO_MIME_TYPE = "audio/webm"; // Consider "audio/webm;codecs=opus" for better quality/compression if supported
const RECORDER_TIMESLICE_MS = 250; // Send audio data every 250ms
const START_RECORDING_DELAY_MS = 1000; // Delay before starting media stream to allow server setup

const delay = (delayInms) => new Promise((resolve) => setTimeout(resolve, delayInms));

function AdminPanel({ isRecording, setIsRecording }) {
  const [mics, setMics] = useState([]);
  const [selectedMic, setSelectedMic] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAdminLanguage, setSelectedAdminLanguage] = useState("en-US");

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    async function fetchMics() {
      setError(null);
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === "audioinput");
        setMics(audioInputs);
        if (audioInputs.length > 0 && !selectedMic) {
          setSelectedMic(audioInputs[0].deviceId);
        } else if (audioInputs.length === 0) {
          setError("No microphones found. Please connect a microphone and grant permission.");
        }
      } catch (err) {
        console.error("Error fetching microphones:", err);
        setError("Could not access microphones. Please ensure permission is granted.");
      }
    }
    fetchMics();
  }, []);

  const stopRecording = useCallback(
    (emitStopToServer = true) => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      if (emitStopToServer && socketRef.current?.connected) {
        socketRef.current.emit("stop:admin");
      }
      mediaRecorderRef.current = null;
      setIsRecording(false);
      console.log("Recording stopped");
    },
    [setIsRecording]
  );

  useEffect(() => {
    if (!WS_URL) {
      console.error("WebSocket URL (VITE_APP_API_URL) is not defined.");
      setError("Configuration error: WebSocket URL is missing.");
      return;
    }

    let currentSocket = io(WS_URL);
    socketRef.current = currentSocket;

    const handleConnect = () => {
      console.log("Socket connected");
      setIsConnected(true);
      setError(null);
      currentSocket?.emit("init:admin");
    };

    const handleDisconnect = (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
      if (reason !== "io client disconnect") {
        setError("Connection lost. Attempting to reconnect...");
      }
      if (isRecording) {
        stopRecording(false);
      }
    };

    const handleConnectError = (err) => {
      console.error("Socket connection error:", err);
      setIsConnected(false);
      setError(`Failed to connect to the server: ${err.message}`);
    };

    currentSocket.on("connect", handleConnect);
    currentSocket.on("disconnect", handleDisconnect);
    currentSocket.on("connect_error", handleConnectError);

    return () => {
      console.log("Disconnecting socket");
      currentSocket.off("connect", handleConnect);
      currentSocket.off("disconnect", handleDisconnect);
      currentSocket.off("connect_error", handleConnectError);
      currentSocket.disconnect();
      socketRef.current = null;
    };
  }, [WS_URL, stopRecording]);

  const startRecording = useCallback(async () => {
    if (!selectedMic || !socketRef.current?.connected) {
      setError("Cannot start recording. Check microphone selection and connection status.");
      return;
    }

    setError(null);
    console.log("Attempting to start recording...");

    try {
      socketRef.current.emit("start:admin", { adminLanguage: selectedAdminLanguage });
      await delay(START_RECORDING_DELAY_MS);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMic } });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME_TYPE });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.connected) {
          socketRef.current.emit("audio", event.data);
        } else if (!socketRef.current?.connected) {
          console.warn("Socket disconnected during recording.");
          stopRecording(false);
        }
      };

      recorder.onstart = () => {
        console.log("MediaRecorder started");
        setIsRecording(true);
      };

      recorder.onstop = () => {
        console.log("MediaRecorder stopped.");
        // Ensure stream tracks are stopped even if stop called unexpectedly
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };

      recorder.onerror = (event) => {
        const recorderError = event.error || new Error("Unknown MediaRecorder error");
        console.error("MediaRecorder error:", recorderError);
        setError(`Recording error: ${recorderError.message || recorderError.name}`);
        stopRecording();
      };

      recorder.start(RECORDER_TIMESLICE_MS);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError(`Failed to start recording: ${err.message}. Check microphone permissions.`);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setIsRecording(false);
    }
  }, [selectedMic, setIsRecording, stopRecording, selectedAdminLanguage]);

  useEffect(() => {
    return () => {
      if (isRecording) {
        console.log("Component unmounting while recording, stopping recording.");
        stopRecording(!socketRef.current?.connected);
      }
    };
  }, [isRecording, stopRecording]);

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
        <h3 className="h5 mb-0 text-primary d-inline-flex align-items-center">
          <i className="bi bi-mic-fill me-2"></i>
          Speaker Controls
        </h3>
        <span className={`badge ${isConnected ? "bg-success" : "bg-danger"}`}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="card-body">
        {error && (
          <div className="alert alert-danger" role="alert">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            {error}
          </div>
        )}
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <div className="form-group">
              <label htmlFor="micSelect" className="form-label fw-bold">
                <i className="bi bi-mic me-2"></i>
                Select Microphone
              </label>
              <select
                id="micSelect"
                className="form-select form-select-lg shadow-sm"
                value={selectedMic || ""}
                onChange={(e) => setSelectedMic(e.target.value)}
                disabled={isRecording || mics.length === 0}
                aria-label="Select Microphone"
              >
                {mics.length === 0 && <option value="">No microphones found</option>}
                {mics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microphone ${mic.deviceId?.substring(0, 6)}...`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="col-md-4">
            <LanguageSelector
              selectedLanguage={selectedAdminLanguage}
              onLanguageChange={(lang) => setSelectedAdminLanguage(lang)}
              isAdmin
            />
          </div>
          <div className="col-md-4 d-flex align-items-end">
            {!isRecording ? (
              <button
                className="btn btn-primary w-100 py-2 shadow-sm"
                onClick={startRecording}
                disabled={!selectedMic || !isConnected}
              >
                <i className="bi bi-play-fill me-2"></i>
                Start Speaking
              </button>
            ) : (
              <button className="btn btn-danger w-100 py-2 shadow-sm" onClick={() => stopRecording()}>
                <i className="bi bi-stop-fill me-2"></i>
                Stop Speaking
              </button>
            )}
          </div>
        </div>

        {isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive" && (
          <div className="mt-4 p-3 bg-light rounded border">
            <h5 className="text-muted mb-3 d-inline-flex align-items-center">
              <AiFillAudio className="me-2 text-success" />
              Live Audio Feed
            </h5>
            <div className="w-100 d-flex align-items-center justify-content-center">
              {mediaRecorderRef.current && (
                <LiveAudioVisualizer
                  mediaRecorder={mediaRecorderRef.current}
                  width="100%"
                  height={75}
                  barWidth={3}
                  gap={2}
                  backgroundColor="transparent"
                  barColor="#28a745"
                  fftSize={512}
                  maxDecibels={-10}
                  minDecibels={-80}
                  smoothingTimeConstant={0.4}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
