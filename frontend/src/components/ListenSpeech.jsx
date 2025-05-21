import { useState, useEffect, useRef, useCallback } from "react";

function ListenSpeech({ socketRef }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const gainNodeRef = useRef(null); // For mute functionality

  // --- Waveform Drawing Logic ---
  // Memoize drawWaveform with useCallback as it doesn't depend on component state directly
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;

    const canvasCtx = canvas.getContext("2d");
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    analyserRef.current.fftSize = 2048; // Fast Fourier Transform size
    const bufferLength = analyserRef.current.frequencyBinCount; // Number of data points
    const dataArray = new Uint8Array(bufferLength); // Array to hold audio data

    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      analyserRef.current.getByteTimeDomainData(dataArray); // Get waveform data

      canvasCtx.fillStyle = "rgb(40, 44, 52)"; // Background color
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = "rgb(97, 218, 251)"; // Waveform color

      canvasCtx.beginPath();

      const sliceWidth = (WIDTH * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0; // Normalize data to 0-2
        const y = (v * HEIGHT) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(WIDTH, HEIGHT / 2); // Connect to the end for a closed shape
      canvasCtx.stroke();
    };

    animate(); // Start the animation loop
  }, []); // Empty dependency array means it's created once

  // Function to initialize/resume AudioContext
  const initializeAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    }

    // Only resume if it's in a suspended state
    if (audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
        console.log("AudioContext resumed successfully.");
      } catch (error) {
        console.error("Failed to resume AudioContext:", error);
      }
    }

    // Ensure analyser and gain nodes are connected if context is new or re-initialized
    if (!analyserRef.current) {
      analyserRef.current = audioContextRef.current.createAnalyser();
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
      drawWaveform(); // Start drawing waveform
    }
  }, [drawWaveform]);

  // --- Audio Context and Socket.io setup ---
  useEffect(() => {
    if (!socketRef) return;

    socketRef.on("tts_audio_chunk", async (audioChunk) => {
      // Ensure AudioContext is initialized/resumed BEFORE processing audio
      // This call will attempt to resume if needed.
      await initializeAudioContext();

      if (!audioChunk || audioChunk.byteLength === 0) {
        console.warn("Received empty audio chunk, skipping.");
        return;
      }

      const int16 = new Int16Array(audioChunk);
      if (int16.length === 0) return;

      const float32Data = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32Data[i] = int16[i] / 32768.0;
      }

      // Check if audioContextRef.current is available after resume attempt
      if (!audioContextRef.current || audioContextRef.current.state !== "running") {
        console.warn("AudioContext not running, cannot process audio chunk.");
        return;
      }

      const newAudioBuffer = audioContextRef.current.createBuffer(
        1,
        float32Data.length,
        48000 // Sample rate must match server's Deepgram output (and now AudioContext's)
      );
      newAudioBuffer.getChannelData(0).set(float32Data);

      audioQueueRef.current.push(newAudioBuffer);
      processAudioQueue();
    });

    socketRef.on("tts_error", (message) => {
      console.error("TTS Error:", message);
      alert(`TTS Error: ${message}`); // Consider using a toast/notification instead of alert
      setIsPlaying(false);
      audioQueueRef.current = [];
      isProcessingQueueRef.current = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    });

    socketRef.on("disconnect", () => {
      console.log("Disconnected from Socket.io server");
      setIsPlaying(false);
      audioQueueRef.current = [];
      isProcessingQueueRef.current = false;
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== "closed") {
          audioContextRef.current.close();
        }
        audioContextRef.current = null;
        analyserRef.current = null;
        gainNodeRef.current = null;
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    });

    return () => {
      // Cleanup for socket listeners
      // socketRef.off("tts_audio_chunk");
      // socketRef.off("tts_error");
      // socketRef.off("disconnect");

      if (audioContextRef.current) {
        if (audioContextRef.current.state !== "closed") {
          audioContextRef.current.close();
        }
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [socketRef, initializeAudioContext]); // Add initializeAudioContext to dependencies

  // --- Audio Playback Queue Processing ---
  const processAudioQueue = async () => {
    if (isProcessingQueueRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;
    const audioContext = audioContextRef.current;
    const gainNode = gainNodeRef.current;

    if (!audioContext || !gainNode || audioContext.state !== "running") {
      console.warn("AudioContext not running or nodes not ready, suspending playback processing.");
      isProcessingQueueRef.current = false;
      return;
    }

    while (audioQueueRef.current.length > 0) {
      const buffer = audioQueueRef.current.shift();
      if (!buffer || buffer.length === 0) {
        console.warn("Skipping empty buffer in queue.");
        continue;
      }

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);

      try {
        await new Promise((resolve) => {
          source.onended = () => resolve();
          source.start(0);
          setIsPlaying(true);
        });
      } catch (error) {
        console.error("Audio playback error:", error);
        break;
      }
    }
    isProcessingQueueRef.current = false;
    if (audioQueueRef.current.length === 0) {
      setIsPlaying(false);
    }
  };

  // --- UI Handlers ---
  const handleStop = () => {
    setIsPlaying(false);
    audioQueueRef.current = [];
    isProcessingQueueRef.current = false;
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      gainNodeRef.current = null;
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    if (socketRef && socketRef.connected) {
      socketRef.emit("stop_tts_stream"); // Notify backend to stop
    }
  };

  const toggleMute = async () => {
    // Attempt to initialize/resume AudioContext on mute/unmute click
    // This handles the case where mute is the first interaction
    await initializeAudioContext();

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 1 : 0;
      setIsMuted(!isMuted);
    } else {
      console.warn("GainNode not available, cannot toggle mute.");
    }
  };

  return (
    <div className="mt-4">
      <p>Audio will play here</p>
      <div className="d-flex justify-content-around">
        <button
          className="btn btn-primary shadow-sm"
          onClick={initializeAudioContext}
          disabled={audioContextRef.current && audioContextRef.current.state === "running"}
        >
          {audioContextRef.current && audioContextRef.current.state === "running" ? "Audio Started" : "Start Audio"}
        </button>

        <button
          className="btn btn-primary shadow-sm"
          onClick={handleStop}
          disabled={!isPlaying && audioQueueRef.current.length === 0}
        >
          Stop
        </button>
        <button className="btn btn-primary shadow-sm" onClick={toggleMute}>
          {isMuted ? "Unmute" : "Mute"}
        </button>
      </div>
      <div className="waveform-container mt-2">
        <canvas ref={canvasRef} width="500" height="100" className="speaking_canvas"></canvas>
        {!isPlaying && audioQueueRef.current.length === 0 && (
          <div className="waveform-placeholder">No audio playing</div>
        )}
      </div>
    </div>
  );
}

export default ListenSpeech;
