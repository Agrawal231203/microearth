import React, { useRef, useState } from "react";
import { uploadSlpk } from "../services/api.js";

export default function LayerManager({
  packages,
  onUploaded,
  onToggleVisible,
  onOpacityChange,
  onFlyTo,
  onDelete,
}) {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".slpk")) {
      setError("Please select an .slpk file");
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const result = await uploadSlpk(file, setProgress);
      onUploaded && onUploaded(result.id);
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div style={panelStyle}>
      {/* Header & Upload Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#90cdf4", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          📦 SLPK Layers ({packages.length})
        </div>

        <button style={uploadBtnStyle} onClick={() => inputRef.current.click()}>
          + Add SLPK
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".slpk"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {progress !== null && (
        <div style={{ background: "rgba(49, 130, 206, 0.2)", padding: 6, borderRadius: 4, marginBottom: 8, fontSize: 11 }}>
          ⏳ Uploading SLPK… {progress}%
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(229, 62, 62, 0.2)", color: "#fc8181", padding: 6, borderRadius: 4, marginBottom: 8, fontSize: 11 }}>
          ❌ {error}
        </div>
      )}

      {/* Layer List */}
      {packages.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.7, padding: "8px 0" }}>
          No 3D layers loaded yet. Click <b>+ Add SLPK</b> to upload a scene layer.
        </div>
      ) : (
        packages.map((pkg) => (
          <div key={pkg.id} style={rowStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span
                title={pkg.filename}
                style={{
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {pkg.filename}
              </span>
              <StatusBadge status={pkg.status} />
            </div>

            {pkg.status === "ready" && (
              <>
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      defaultChecked
                      onChange={(e) => onToggleVisible(pkg.id, e.target.checked)}
                    />
                    Visible
                  </label>
                  <button style={smallButton} onClick={() => onFlyTo(pkg.id)}>
                    ✈️ Fly to
                  </button>
                  <button
                    style={{ ...smallButton, background: "rgba(229, 62, 62, 0.8)" }}
                    onClick={() => onDelete(pkg.id)}
                  >
                    🗑️
                  </button>
                </div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>Opacity:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    defaultValue="1"
                    style={{ flex: 1 }}
                    onChange={(e) => onOpacityChange(pkg.id, parseFloat(e.target.value))}
                  />
                </div>
              </>
            )}
            {pkg.status === "error" && (
              <div style={{ color: "#ff6b6b", fontSize: 11, marginTop: 4 }}>{pkg.error}</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    uploaded: "#d69e2e",
    extracting: "#d69e2e",
    ready: "#38a169",
    error: "#e53e3e",
  };
  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 6px",
        borderRadius: 10,
        background: colors[status] || "#666",
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

const panelStyle = {
  background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92))",
  backdropFilter: "blur(14px)",
  color: "#fff",
  padding: 14,
  borderRadius: 10,
  fontSize: 12,
  width: 260,
  maxHeight: "60vh",
  overflowY: "auto",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
};

const rowStyle = {
  borderTop: "1px solid rgba(255,255,255,0.1)",
  paddingTop: 8,
  marginTop: 8,
};

const uploadBtnStyle = {
  background: "#3182ce",
  color: "#fff",
  border: "none",
  padding: "4px 8px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  boxShadow: "0 2px 8px rgba(49, 130, 206, 0.4)",
};

const smallButton = {
  background: "rgba(255, 255, 255, 0.12)",
  color: "#fff",
  border: "none",
  padding: "3px 8px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
  transition: "all 0.2s",
};
