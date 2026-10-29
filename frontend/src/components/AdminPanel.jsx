import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LiveAudioVisualizer } from "react-audio-visualize";
import { AiFillAudio } from "react-icons/ai";
import { io } from "socket.io-client";
import Select from "react-select";
import LanguageSelector from "./LanguageSelector";
import AdminTranscription from "./AdminTranscription";
import { WS_URL, SOCKET_OPTS } from "../utils/socket";
import { getToken, clearToken } from "../utils/auth";

const RECORDER_TIMESLICE_MS = 250; // send audio every 250ms
const RECOGNITION_OPEN_TIMEOUT_MS = 4000; // start the recorder anyway if the server is slow to confirm

const MIME_TYPES = [
  "audio/webm;codecs=opus", // Chrome / Firefox
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2", // Safari
  "audio/mp4",
];
const supportedMimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));

function formatStats(stats) {
  const entries = Object.entries(stats.byLanguage || {}).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 6).map(([code, n]) => `${code} ${n}`);
  const rest = entries.length - top.length;
  return top.join(" · ") + (rest > 0 ? ` · +${rest} more` : "");
}

function AdminPanel({ isRecording, setIsRecording }) {
  const navigate = useNavigate();
  const [mics, setMics] = useState([]);
  const [selectedMic, setSelectedMic] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [stats, setStats] = useState({ total: 0, byLanguage: {} });
  const [selectedAdminLanguage, setSelectedAdminLanguage] = useState("en-US");

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const socketRef = useRef(null);
  const isPausedRef = useRef(false);
  const isRecordingRef = useRef(isRecording);
  const recognitionOpenResolver = useRef(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    async function fetchMics() {
      setError(null);
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === "audioinput");
        setMics(audioInputs);
        if (audioInputs.length > 0) {
          setSelectedMic((current) => current || audioInputs[0].deviceId);
        } else {
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
      mediaRecorderRef.current = null;
      if (emitStopToServer && socketRef.current?.connected) {
        socketRef.current.emit("stop:admin");
      }
      setIsRecording(false);
    },
    [setIsRecording]
  );

  useEffect(() => {
    if (!WS_URL) {
      setError("Configuration error: server URL (VITE_APP_API_URL) is missing.");
      return undefined;
    }

    const socket = io(WS_URL, SOCKET_OPTS);
    socketRef.current = socket;

    const handlers = {
      connect: () => {
        setIsConnected(true);
        setError(null);
        socket.emit("init:admin", { token: getToken() });
      },
      disconnect: (reason) => {
        setIsConnected(false);
        if (reason !== "io client disconnect") setError("Connection lost. Reconnecting...");
        if (isRecordingRef.current) stopRecording(false);
      },
      connect_error: (err) => {
        setIsConnected(false);
        setError(`Failed to connect to the server: ${err.message}`);
      },
      "admin:unauthorized": () => {
        clearToken();
        socket.disconnect();
        navigate("/admin-login", { replace: true });
      },
      "admin:replaced": () => {
        if (isRecordingRef.current) stopRecording(false);
        setNotice("Another speaker session took over this microphone. Reload this page to take it back.");
      },
      "admin:ready": (payload) => {
        if (payload?.stats) setStats(payload.stats);
      },
      "recognition:open": () => {
        if (recognitionOpenResolver.current) {
          recognitionOpenResolver.current();
          recognitionOpenResolver.current = null;
        }
      },
      "recognition:closed": () => {
        if (isRecordingRef.current) {
          stopRecording(false);
          setError("Speech recognition stopped. Press Start Speaking again.");
        }
      },
      "recognition:error": (payload) => {
        if (isRecordingRef.current) stopRecording(false);
        setError(payload?.message || "Speech recognition error.");
      },
      stats: (payload) => setStats(payload),
      pause_recording: () => {
        isPausedRef.current = true;
        mediaStreamRef.current?.getTracks().forEach((track) => (track.enabled = false));
      },
      resume_recording: () => {
        isPausedRef.current = false;
        mediaStreamRef.current?.getTracks().forEach((track) => (track.enabled = true));
      },
    };

    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    setSocketReady(true);

    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
      socket.disconnect();
      socketRef.current = null;
      setSocketReady(false);
    };
  }, [stopRecording, navigate]);

  const startRecording = useCallback(async () => {
    const socket = socketRef.current;
    if (!selectedMic || !socket?.connected) {
      setError("Cannot start recording. Check microphone selection and connection status.");
      return;
    }
    setError(null);
    setNotice(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedMic, noiseSuppression: true, echoCancellation: true },
      });
      mediaStreamRef.current = stream;

      // Ask the server to open recognition and wait until it confirms, so the first words are not lost.
      const opened = new Promise((resolve) => {
        recognitionOpenResolver.current = resolve;
        setTimeout(resolve, RECOGNITION_OPEN_TIMEOUT_MS);
      });
      socket.emit("start:admin", { adminLanguage: selectedAdminLanguage });
      await opened;

      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        if (!socketRef.current?.connected) {
          stopRecording(false);
          return;
        }
        if (!isPausedRef.current) socketRef.current.emit("audio", event.data);
      };
      recorder.onstart = () => setIsRecording(true);
      recorder.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };
      recorder.onerror = (event) => {
        const recorderError = event.error || new Error("Unknown MediaRecorder error");
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
      if (isRecordingRef.current) stopRecording(true);
    };
  }, [stopRecording]);

  return (
    <div>
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h3 className="h5 mb-0 text-primary d-inline-flex align-items-center">
            <i className="bi bi-mic-fill me-2"></i>
            Speaker Controls
          </h3>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <span className="badge bg-secondary" title={formatStats(stats) || "No listeners yet"}>
              <i className="bi bi-people-fill me-1"></i>
              {stats.total} listening
            </span>
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => window.open("/presentation-display", "_blank")}
              title="Open Presentation Display in new tab"
            >
              <i className="bi bi-projector me-1"></i>
              Presentation Display
            </button>
            <span className={`badge ${isConnected ? "bg-success" : "bg-danger"}`}>
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
        <div className="card-body">
          {error && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              {error}
            </div>
          )}
          {notice && (
            <div className="alert alert-warning" role="alert">
              <i className="bi bi-info-circle-fill me-2"></i>
              {notice}
            </div>
          )}
          {(stats.total > 0 || stats.displays > 0) && (
            <div className="text-muted small mb-3">
              {stats.total > 0 ? `Listeners by language: ${formatStats(stats)}` : "No listeners yet"}
              {stats.displays > 0 ? ` · ${stats.displays} presentation display${stats.displays > 1 ? "s" : ""} connected` : ""}
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <div className="form-group">
                <label className="form-label fw-bold">
                  <i className="bi bi-mic me-2"></i>
                  Select Microphone
                </label>
                <Select
                  className="form-select-lg"
                  value={
                    mics
                      .map((mic) => ({ label: mic.label || `Microphone ${mic.deviceId?.substring(0, 6)}...`, value: mic.deviceId }))
                      .find((item) => item.value === selectedMic) || null
                  }
                  onChange={(item) => setSelectedMic(item.value)}
                  isDisabled={isRecording || mics.length === 0}
                  isSearchable
                  options={
                    mics.length === 0
                      ? [{ label: "No microphones found", value: "" }]
                      : mics.map((mic) => ({
                          label: mic.label || `Microphone ${mic.deviceId?.substring(0, 6)}...`,
                          value: mic.deviceId,
                        }))
                  }
                />
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
                  className="btn btn-primary w-100 py-2 mb-2 shadow-sm"
                  onClick={startRecording}
                  disabled={!selectedMic || !isConnected}
                >
                  <i className="bi bi-play-fill me-2"></i>
                  Start Speaking
                </button>
              ) : (
                <button className="btn btn-danger w-100 py-2 mb-2 shadow-sm" onClick={() => stopRecording()}>
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
                <LiveAudioVisualizer
                  mediaRecorder={mediaRecorderRef.current}
                  width="100%"
                  height={75}
                  barWidth={3}
                  gap={2}
                  backgroundColor="transparent"
                  barColor="#467efc"
                  fftSize={512}
                  maxDecibels={-10}
                  minDecibels={-80}
                  smoothingTimeConstant={0.4}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {socketReady && <AdminTranscription socketRef={socketRef} />}
    </div>
  );
}

export default AdminPanel;
