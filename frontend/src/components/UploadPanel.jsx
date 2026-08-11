import React, { useRef, useState } from "react";
import { uploadSlpk } from "../services/api.js";

export default function UploadPanel({ onUploaded }) {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".slpk")) {
      setError("Please select a .slpk file");
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const result = await uploadSlpk(file, setProgress);
      onUploaded(result.id);
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Upload SLPK</div>
      <input
        ref={inputRef}
        type="file"
        accept=".slpk"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <button style={buttonStyle} onClick={() => inputRef.current.click()}>
        Choose .slpk file
      </button>
      {progress !== null && <div style={{ marginTop: 8 }}>Uploading… {progress}%</div>}
      {error && <div style={{ marginTop: 8, color: "#ff6b6b" }}>{error}</div>}
    </div>
  );
}

const panelStyle = {
  background: "rgba(20,20,20,0.85)",
  color: "#fff",
  padding: 12,
  borderRadius: 8,
  fontFamily: "sans-serif",
  fontSize: 13,
};

const buttonStyle = {
  background: "#2b6cb0",
  color: "#fff",
  border: "none",
  padding: "6px 12px",
  borderRadius: 4,
  cursor: "pointer",
};
