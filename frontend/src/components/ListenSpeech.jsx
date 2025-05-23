import { useEffect, useRef, useState, useCallback } from "react";
import { FaVolumeMute, FaVolumeUp, FaExclamationTriangle } from "react-icons/fa";
import WaveAnimation from "./WaveAnimation";

const SOCKET_EVENT_NAME = "tts_audio_chunk";
const sampleRate = 48000;
const channels = 1;
const bufferingSec = 0.1;
const playbackRate = 1; // 90% speed (slower)

const ListenSpeech = ({ socketRef }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isUserGestureNeeded, setIsUserGestureNeeded] = useState(false);
  const [isConnected, setIsConnected] = useState(socketRef.connected);

  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const nextPlayTimeRef = useRef(0);

  // decode linear16 LE → Float32
  const decodePCM = useCallback((arrayBuffer) => {
    const view = new DataView(arrayBuffer);
    const len = view.byteLength / 2;
    const floats = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      floats[i] = view.getInt16(i * 2, true) / 32768;
    }
    return floats;
  }, []);

  useEffect(() => {
    // 1) Create AudioContext at the exact TTS rate to avoid automatic resampling
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext({ sampleRate, latencyHint: "interactive" });
    audioCtxRef.current = audioCtx;

    const gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
    gainNodeRef.current = gainNode;

    nextPlayTimeRef.current = audioCtx.currentTime + bufferingSec;

    if (audioCtx.state === "suspended") {
      setIsUserGestureNeeded(true);
    }

    const handleChunk = (arrayBuffer) => {
      const floatData = decodePCM(arrayBuffer);
      const frameCount = floatData.length / channels;
      const buffer = audioCtx.createBuffer(channels, frameCount, sampleRate);

      if (channels === 1) {
        buffer.getChannelData(0).set(floatData);
      } else {
        for (let ch = 0; ch < channels; ch++) {
          const channelData = buffer.getChannelData(ch);
          for (let i = 0; i < frameCount; i++) {
            channelData[i] = floatData[i * channels + ch];
          }
        }
      }

      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = playbackRate;
      src.connect(gainNodeRef.current);

      const now = audioCtx.currentTime;
      let playTime = nextPlayTimeRef.current;
      if (playTime < now) playTime = now + bufferingSec;
      src.start(playTime);
      nextPlayTimeRef.current = playTime + buffer.duration / playbackRate;
    };

    const socket = socketRef;
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on(SOCKET_EVENT_NAME, handleChunk);

    return () => {
      socket.off(SOCKET_EVENT_NAME, handleChunk);
      audioCtx.close();
    };
  }, [socketRef, decodePCM, sampleRate, channels, bufferingSec, playbackRate]);

  // Resume on user gesture if needed
  const handleStart = () => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => setIsUserGestureNeeded(false));
    }
  };

  const toggleMute = () => {
    if (!gainNodeRef.current) return;
    const muted = !isMuted;
    setIsMuted(muted);
    gainNodeRef.current.gain.setValueAtTime(muted ? 0 : 1, audioCtxRef.current.currentTime);
  };

  return (
    <div style={{ textAlign: "center", padding: 12 }}>
      {isUserGestureNeeded && (
        <div
          onClick={handleStart}
          style={{
            background: "#fffbe6",
            border: "1px solid #ffe58f",
            padding: 10,
            borderRadius: 4,
            cursor: "pointer",
            display: "inline-block",
            marginBottom: 12,
          }}
        >
          <FaExclamationTriangle style={{ marginRight: 6 }} />
          Click or tap to enable audio
        </div>
      )}

      {!isUserGestureNeeded && isConnected && <WaveAnimation />}

      <div style={{ marginTop: 12 }}>
        <button
          onClick={toggleMute}
          disabled={!isConnected || isUserGestureNeeded}
          style={{
            cursor: isConnected ? "pointer" : "not-allowed",
            opacity: isConnected ? 1 : 0.5,
          }}
          className="btn btn-light"
        >
          {isMuted ? <FaVolumeMute /> : <FaVolumeUp />} {isMuted ? "Unmute" : "Mute"}
        </button>
      </div>
    </div>
  );
};

export default ListenSpeech;
