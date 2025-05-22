// WaveAnimation.jsx
import React, { useRef, useEffect } from "react";

const WaveAnimation = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // size the canvas
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = 100); // adjust height as you like

    // three wave layers with different amplitudes, wavelengths, speeds
    const waves = [
      { amplitude: 30, wavelength: 0.015, speed: 0.015, phase: 0 },
      { amplitude: 20, wavelength: 0.02, speed: 0.02, phase: 0 },
      { amplitude: 15, wavelength: 0.03, speed: 0.025, phase: 0 },
    ];

    let animId;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      waves.forEach((wave, i) => {
        wave.phase += wave.speed;
        drawSingleWave(wave, i);
      });

      animId = requestAnimationFrame(draw);
    };

    const drawSingleWave = ({ amplitude, wavelength, phase }, index) => {
      ctx.beginPath();
      ctx.moveTo(0, height / 2);

      // build the sine path
      for (let x = 0; x <= width; x++) {
        const y = height / 2 + Math.sin(x * wavelength + phase) * amplitude * (1 - index * 0.3); // reduce amplitude on top layers
        ctx.lineTo(x, y);
      }

      // close the shape down to the bottom of the canvas
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      // gradient from purple to blue
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, "#A500BB");
      grad.addColorStop(1, "#0039FF");

      ctx.fillStyle = grad;
      ctx.globalAlpha = 1 - index * 0.3; // more transparent on back layers
      ctx.fill();
    };

    draw();

    // handle resizing
    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = 200;
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100px",
      }}
    />
  );
};

export default WaveAnimation;
