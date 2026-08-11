import React, { useEffect, useRef, useState, useCallback } from "react";
import ArcGISViewer from "./components/ArcGISViewer.jsx";
import Viewer from "./components/Viewer.jsx";
import UploadPanel from "./components/UploadPanel.jsx";
import LayerManager from "./components/LayerManager.jsx";
import IdentifyPanel from "./components/IdentifyPanel.jsx";
import EarthToolbar from "./components/EarthToolbar.jsx";
import { listPackages, getPackage, deletePackage, resolveLayerUrl } from "./services/api.js";

export default function App() {
  const viewerRef = useRef(null);
  const [engine, setEngine] = useState("arcgis"); // "arcgis" (Native Esri) or "cesium"
  const [packages, setPackages] = useState([]);
  const [pickedAttrs, setPickedAttrs] = useState(null);
  const [activeTool, setActiveTool] = useState("layers");
  const [isOrbiting, setIsOrbiting] = useState(false);
  const loadedRef = useRef(new Set());

  const refreshPackages = useCallback(async () => {
    try {
      const list = await listPackages();
      setPackages(list);
    } catch (e) {
      console.error("Failed to list packages", e);
    }
  }, []);

  useEffect(() => {
    refreshPackages();
  }, [refreshPackages]);

  // Poll packages while extracting
  useEffect(() => {
    const hasPending = packages.some((p) => p.status === "uploaded" || p.status === "extracting");
    if (!hasPending) return;
    const t = setTimeout(refreshPackages, 1500);
    return () => clearTimeout(t);
  }, [packages, refreshPackages]);

  // Auto load ready packages
  useEffect(() => {
    packages.forEach(async (p) => {
      if (p.status === "ready" && !loadedRef.current.has(p.id)) {
        try {
          const detail = await getPackage(p.id);
          if (detail.layer_url && viewerRef.current) {
            loadedRef.current.add(p.id);
            const finalLayerUrl = resolveLayerUrl(detail.layer_url);
            await viewerRef.current.loadI3SLayer(p.id, finalLayerUrl);
            await viewerRef.current.flyToLayer(p.id);
          }
        } catch (e) {
          loadedRef.current.delete(p.id);
          console.error("Failed to load I3S layer", e);
        }
      }
    });
  }, [packages, engine]);

  // Handle widget changes on ArcGIS Viewer
  useEffect(() => {
    if (viewerRef.current?.setWidget) {
      viewerRef.current.setWidget(activeTool);
    }
  }, [activeTool, engine]);

  function handleUploaded() {
    refreshPackages();
  }

  function handleToggleVisible(id, visible) {
    viewerRef.current?.setLayerVisible(id, visible);
  }

  function handleOpacityChange(id, opacity) {
    viewerRef.current?.setLayerOpacity(id, opacity);
  }

  function handleFlyTo(id) {
    viewerRef.current?.flyToLayer(id);
  }

  async function handleDelete(id) {
    viewerRef.current?.unloadI3SLayer(id);
    loadedRef.current.delete(id);
    try {
      await deletePackage(id);
    } finally {
      refreshPackages();
    }
  }

  function handleToggleOrbit() {
    const next = !isOrbiting;
    setIsOrbiting(next);
    viewerRef.current?.toggleOrbit(next);
  }

  function handleImportGISFile(file) {
    viewerRef.current?.importGISData(file);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0b0f19" }}>
      {/* 3D Viewport: Native ArcGIS SceneView or Cesium */}
      {engine === "arcgis" ? (
        <ArcGISViewer ref={viewerRef} onPick={setPickedAttrs} />
      ) : (
        <Viewer ref={viewerRef} onPick={setPickedAttrs} />
      )}

      {/* ArcGIS Earth Toolbar */}
      <EarthToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        engine={engine}
        setEngine={(eng) => {
          setIsOrbiting(false);
          loadedRef.current.clear();
          setEngine(eng);
        }}
        isOrbiting={isOrbiting}
        toggleOrbit={handleToggleOrbit}
        onImportGISFile={handleImportGISFile}
        onUploaded={handleUploaded}
      />

      {/* Layers & SLPK Upload Drawer */}
      {activeTool === "layers" && (
        <div style={{ position: "absolute", top: 175, left: 14, zIndex: 90 }}>
          <LayerManager
            packages={packages}
            onUploaded={handleUploaded}
            onToggleVisible={handleToggleVisible}
            onOpacityChange={handleOpacityChange}
            onFlyTo={handleFlyTo}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* Attributes Inspector Popup */}
      <div style={{ position: "absolute", top: 14, right: 14, zIndex: 100 }}>
        <IdentifyPanel attributes={pickedAttrs} onClose={() => setPickedAttrs(null)} />
      </div>
    </div>
  );
}
