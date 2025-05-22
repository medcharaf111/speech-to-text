import React, { useEffect, useRef } from "react";

function Transcription({ lines }) {
  const transcriptRef = useRef(null);

  // Auto scroll to bottom when new content arrives
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={transcriptRef}
      className="transcript-container p-4 bg-light"
      style={{
        height: "calc(100vh - 250px)",
        overflowY: "auto",
        lineHeight: "1.6",
      }}
    >
      {!lines ? (
        <div className="text-center text-muted" style={{ paddingTop: "5.5rem", paddingBottom: "5.5rem" }}>
          <p>No transcriptions yet. They will appear here when the admin starts speaking.</p>
        </div>
      ) : (
        <div className="transcript-text">
          {lines.split(". ").map((sentence, index) => (
            <p key={index}>{sentence.trim()}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default Transcription;
