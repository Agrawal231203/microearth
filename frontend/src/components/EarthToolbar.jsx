import React, { useRef, useState } from "react";
import { uploadSlpk } from "../services/api.js";

export default function EarthToolbar({
  activeTool,
  setActiveTool,
  engine,
  setEngine,
  isOrbiting,
  toggleOrbit,
  onImportGISFile,
  onUploaded,
}) {
  const slpkInputRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  function handleToolClick(toolName) {
    if (activeTool === toolName) {
      setActiveTool(null);
    } else {
      setActiveTool(toolName);
    }
  }

  async function handleDirectSLPKUpload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".slpk")) {
      alert("Please select a valid .slpk file");
      return;
    }
    setUploadError(null);
    setUploadProgress(0);
    try {
      const res = await uploadSlpk(file, (p) => setUploadProgress(p));
      onUploaded && onUploaded(res.id);
      setActiveTool("layers");
    } catch (err) {
      setUploadError(err.message || "Upload failed");
      alert("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploadProgress(null);
    }
  }

  return (
    <div style={toolbarContainer}>
      {/* Brand Header */}
      <div style={brandHeader}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🌍</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.5px" }}>ArcGIS Earth Studio</div>
              <div style={{ fontSize: 10, color: "#90cdf4" }}>
                {engine === "arcgis" ? "⚡ Native Esri 3D Engine" : "🌐 CesiumJS Engine"}
              </div>
            </div>
          </div>

          <button
            style={engineSwitchBtn}
            onClick={() => setEngine(engine === "arcgis" ? "cesium" : "arcgis")}
            title="Switch between ArcGIS Engine and Cesium Engine"
          >
            Switch to {engine === "arcgis" ? "Cesium" : "ArcGIS"}
          </button>
        </div>
      </div>

      {/* Main Action Bar */}
      <div style={buttonGroup}>
        {/* Direct Upload SLPK Button */}
        <input
          ref={slpkInputRef}
          type="file"
          accept=".slpk"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleDirectSLPKUpload(e.target.files[0]);
              e.target.value = "";
            }
          }}
        />

        <button
          style={primaryUploadBtn}
          onClick={() => slpkInputRef.current.click()}
          title="Upload 3D SLPK scene package file"
        >
          📤 Upload SLPK
        </button>

        <button
          style={activeTool === "layers" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("layers")}
          title="Open Layers Drawer"
        >
          📂 Layers
        </button>

        <button
          style={activeTool === "daylight" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("daylight")}
          title="Daylight, Sun & Shadow Analysis"
        >
          ☀️ Daylight
        </button>

        <button
          style={activeTool === "slice" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("slice")}
          title="3D Slicing / Cross-Section Tool"
        >
          🔪 Slice
        </button>

        <button
          style={activeTool === "lineOfSight" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("lineOfSight")}
          title="3D Line of Sight Analysis"
        >
          👁️ Line of Sight
        </button>

        <button
          style={activeTool === "elevationProfile" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("elevationProfile")}
          title="Terrain & 3D Elevation Profile"
        >
          ⛰️ Elevation
        </button>

        <button
          style={activeTool === "distance" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("distance")}
          title="3D Distance Measurement"
        >
          📏 Distance
        </button>

        <button
          style={activeTool === "area" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("area")}
          title="3D Area Measurement"
        >
          📐 Area
        </button>

        <button
          style={activeTool === "weather" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("weather")}
          title="Atmospheric Weather (Rain, Snow, Fog, Clouds)"
        >
          ⛅ Weather
        </button>

        <button
          style={isOrbiting ? activeBtn : toolBtn}
          onClick={toggleOrbit}
          title="Planetary Earth Rotation on its Polar Axis (West to East)"
        >
          🌍 {isOrbiting ? "Stop Earth Spin" : "Spin Earth"}
        </button>

        <button
          style={activeTool === "import" ? activeBtn : toolBtn}
          onClick={() => handleToolClick("import")}
          title="Import KML, KMZ, GeoJSON"
        >
          📥 Import GIS
        </button>
      </div>

      {/* Upload progress banner */}
      {uploadProgress !== null && (
        <div style={uploadProgressBanner}>
          ⏳ Uploading SLPK file… {uploadProgress}%
        </div>
      )}

      {/* Import File Subpanel */}
      {activeTool === "import" && (
        <div style={toolPanel}>
          <div style={panelTitle}>📥 Import External GIS Data</div>
          <p style={{ fontSize: 11, color: "#cbd5e0", margin: "0 0 8px 0" }}>
            Add GeoJSON, KML, or KMZ files directly to the 3D globe.
          </p>
          <input
            type="file"
            accept=".geojson,.json,.kml,.kmz"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onImportGISFile(e.target.files[0]);
                e.target.value = "";
              }
            }}
            style={{ fontSize: 11, color: "#fff", width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

const toolbarContainer = {
  position: "absolute",
  top: 14,
  left: 14,
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  maxWidth: 420,
};

const brandHeader = {
  background: "linear-gradient(135deg, rgba(20, 26, 38, 0.95), rgba(30, 41, 59, 0.92))",
  backdropFilter: "blur(12px)",
  padding: "10px 14px",
  borderRadius: 10,
  color: "#fff",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  border: "1px solid rgba(255,255,255,0.12)",
};

const engineSwitchBtn = {
  background: "rgba(99, 179, 237, 0.15)",
  color: "#63b3ed",
  border: "1px solid rgba(99, 179, 237, 0.3)",
  padding: "3px 8px",
  borderRadius: 6,
  fontSize: 10,
  cursor: "pointer",
  fontWeight: 600,
};

const buttonGroup = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  background: "rgba(15, 23, 42, 0.92)",
  backdropFilter: "blur(10px)",
  padding: "8px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
};

const toolBtn = {
  background: "rgba(255, 255, 255, 0.08)",
  color: "#edf2f7",
  border: "none",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const primaryUploadBtn = {
  ...toolBtn,
  background: "linear-gradient(135deg, #3182ce, #2b6cb0)",
  color: "#ffffff",
  fontWeight: 700,
  boxShadow: "0 2px 10px rgba(49, 130, 206, 0.5)",
};

const activeBtn = {
  ...toolBtn,
  background: "#3182ce",
  color: "#fff",
  fontWeight: 600,
  boxShadow: "0 0 10px rgba(49, 130, 206, 0.6)",
};

const uploadProgressBanner = {
  background: "rgba(49, 130, 206, 0.9)",
  color: "#fff",
  padding: "8px 12px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  backdropFilter: "blur(8px)",
  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
};

const toolPanel = {
  background: "rgba(15, 23, 42, 0.96)",
  backdropFilter: "blur(12px)",
  padding: "12px",
  borderRadius: 8,
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

const panelTitle = {
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
  color: "#90cdf4",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};
