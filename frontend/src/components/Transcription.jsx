import { useEffect, useRef } from "react";

// lines: array of final sentences, newest last. interim: optional live text shown in grey.
function Transcription({ lines, interim = "", placeholder, height = "calc(100vh - 250px)" }) {
  const transcriptRef = useRef(null);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [lines, interim]);

  const empty = (!lines || lines.length === 0) && !interim;

  return (
    <div
      ref={transcriptRef}
      className="transcript-container p-4 bg-light"
      style={{ height, overflowY: "auto", lineHeight: "1.6" }}
    >
      {empty ? (
        <div className="text-center text-muted" style={{ paddingTop: "5.5rem", paddingBottom: "5.5rem" }}>
          <p>{placeholder || "No transcriptions yet. They will appear here when the speaker starts talking."}</p>
        </div>
      ) : (
        <div className="transcript-text">
          {lines.map((sentence, index) => (
            <p key={index} className="mb-2">
              {sentence}
            </p>
          ))}
          {interim && (
            <p className="mb-2 text-muted fst-italic" aria-live="polite">
              {interim}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default Transcription;
