import React from "react";

export default function IdentifyPanel({ attributes, onClose }) {
  if (!attributes) return null;

  const entries = Object.entries(attributes);

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <strong>Feature Attributes</strong>
        <button style={closeButton} onClick={onClose}>
          ×
        </button>
      </div>
      {entries.length === 0 ? (
        <div>No attributes on this feature.</div>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td style={cellStyle}>{k}</td>
                <td style={cellStyle}>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const panelStyle = {
  background: "rgba(20,20,20,0.9)",
  color: "#fff",
  padding: 12,
  borderRadius: 8,
  fontFamily: "sans-serif",
  fontSize: 12,
  width: 260,
  maxHeight: "40vh",
  overflowY: "auto",
};

const cellStyle = {
  borderBottom: "1px solid rgba(255,255,255,0.1)",
  padding: "2px 4px",
  verticalAlign: "top",
};

const closeButton = {
  background: "transparent",
  border: "none",
  color: "#fff",
  fontSize: 16,
  cursor: "pointer",
};
