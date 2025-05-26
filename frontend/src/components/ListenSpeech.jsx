import { useEffect, useRef, useState, useCallback } from "react";
import { FaVolumeMute, FaVolumeUp, FaExclamationTriangle } from "react-icons/fa";
// import WaveAnimation from "./WaveAnimation";
import { LiveAudioVisualizer } from "react-audio-visualize";

const SOCKET_EVENT_NAME = "tts_audio_chunk";

const ListenSpeech = ({ socketRef }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isConnected = socketRef.connected;
  const [isUserGestureNeeded, setIsUserGestureNeeded] = useState(false);

  // audio graph refs
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const msDestRef = useRef(null);

  const mediaRecorderRef = useRef(null);

  // playback queue
  const audioQueue = useRef([]);
  const isPlayingRef = useRef(false);

  // refs to break callback cycles
  const playNextRef = useRef(() => {});

  // 1️⃣ Build AudioContext & nodes
  useEffect(() => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;

    if (ctx.state === "suspended") {
      setIsUserGestureNeeded(true);
    }

    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    const msDest = ctx.createMediaStreamDestination();

    gain.connect(analyser);
    gain.connect(msDest);
    analyser.connect(ctx.destination);

    gainNodeRef.current = gain;
    analyserNodeRef.current = analyser;
    msDestRef.current = msDest;

    return () => {
      if (ctx.state !== "closed") ctx.close();
    };
  }, []);

  // 2️⃣ Start the MediaRecorder for the visualizer
  useEffect(() => {
    const msDest = msDestRef.current;
    if (!msDest) return;
    const recorder = new MediaRecorder(msDest.stream);
    recorder.start();
    mediaRecorderRef.current = recorder;
    return () => recorder.stop();
  }, [msDestRef.current]);

  // 3️⃣ playBuffer: decode & play one chunk, then chain via playNextRef
  const playBuffer = useCallback(async (audioBuffer) => {
    const ctx = audioCtxRef.current;
    const gain = gainNodeRef.current;
    if (!ctx) return;

    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    try {
      const ab = audioBuffer instanceof ArrayBuffer ? audioBuffer : new Uint8Array(audioBuffer).buffer;
      const decoded = await ctx.decodeAudioData(ab);

      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(gain);

      isPlayingRef.current = true;
      setIsPlaying(true);

      src.onended = () => {
        isPlayingRef.current = false;
        setIsPlaying(false);
        playNextRef.current();
      };

      src.start(0);
    } catch (err) {
      console.error("playBuffer error:", err);
      isPlayingRef.current = false;
      setIsPlaying(false);
      playNextRef.current();
    }
  }, []);

  // 4️⃣ playNext: dequeue & invoke playBuffer
  const playNext = useCallback(() => {
    if (isPlayingRef.current || audioQueue.current.length === 0) return;
    const next = audioQueue.current.shift();
    playBuffer(next);
  }, [playBuffer]);

  // wire up the ref so playBuffer/onended always see the latest playNext
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // 5️⃣ Socket.IO: enqueue incoming buffers and kick off playNext
  useEffect(() => {
    socketRef.on(SOCKET_EVENT_NAME, async (raw) => {
      const buf = raw instanceof ArrayBuffer ? raw : raw.buffer || (await raw.arrayBuffer());
      audioQueue.current.push(buf);
      playNext();
    });

    return () => {
      // socket.disconnect();
    };
  }, [playNext, socketRef]);

  // 6️⃣ Mute/unmute + iOS resume
  const toggleMute = () => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    setIsMuted((m) => !m);
  };

  useEffect(() => {
    const gain = gainNodeRef.current;
    if (gain) gain.gain.value = isMuted ? 0 : 1;
  }, [isMuted]);

  const handleStart = () => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => setIsUserGestureNeeded(false));
    }
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
      {isPlaying && (
        <>
          {mediaRecorderRef.current && analyserNodeRef.current && (
            <div className="p-3 bg-light rounded border w-100 d-flex align-items-center justify-content-center">
              <LiveAudioVisualizer
                mediaRecorder={mediaRecorderRef.current}
                fftSize={analyserNodeRef.current.fftSize}
                width="100%"
                height={75}
                barWidth={3}
                gap={2}
                backgroundColor="transparent"
                barColor="#467efc"
                maxDecibels={-10}
                minDecibels={-80}
                smoothingTimeConstant={0.4}
              />
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <button
          onClick={toggleMute}
          disabled={!isConnected}
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
