import React, { useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import "@arcgis/core/assets/esri/themes/dark/main.css";
import esriConfig from "@arcgis/core/config";
import Map from "@arcgis/core/Map";
import SceneView from "@arcgis/core/views/SceneView";
import SceneLayer from "@arcgis/core/layers/SceneLayer";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import KMLLayer from "@arcgis/core/layers/KMLLayer";
import Daylight from "@arcgis/core/widgets/Daylight";
import LineOfSight from "@arcgis/core/widgets/LineOfSight";
import Slice from "@arcgis/core/widgets/Slice";
import ElevationProfile from "@arcgis/core/widgets/ElevationProfile";
import DirectLineMeasurement3D from "@arcgis/core/widgets/DirectLineMeasurement3D";
import AreaMeasurement3D from "@arcgis/core/widgets/AreaMeasurement3D";
import Weather from "@arcgis/core/widgets/Weather";

import Basemap from "@arcgis/core/Basemap";
import TileLayer from "@arcgis/core/layers/TileLayer";

const ArcGISViewer = forwardRef(function ArcGISViewer({ onPick }, ref) {
  const mapDivRef = useRef(null);
  const viewRef = useRef(null);
  const layersRef = useRef({});
  const activeWidgetRef = useRef(null);
  const orbitFrameRef = useRef(null);

  useEffect(() => {
    if (!mapDivRef.current) return;

    if (import.meta.env.VITE_ARCGIS_API_KEY) {
      esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY;
    }

    // High-resolution real satellite imagery basemap (Blue Planet Earth)
    const satelliteBasemap = new Basemap({
      baseLayers: [
        new TileLayer({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
          title: "Esri World Satellite Imagery",
        }),
      ],
      title: "Satellite",
      id: "satellite-globe",
    });

    const map = new Map({
      basemap: satelliteBasemap,
      ground: "world-elevation",
    });

    const view = new SceneView({
      container: mapDivRef.current,
      map: map,
      viewingMode: "global", // Explicit 3D spherical planet Earth globe
      qualityProfile: "high",
      alphaCompositingEnabled: true,
      environment: {
        starsEnabled: true, // Starry cosmic outer space
        atmosphereEnabled: true,
        atmosphere: { quality: "high" }, // Blue atmospheric halo
        background: {
          type: "color",
          color: [0, 0, 0, 1], // Deep black space
        },
        lighting: {
          type: "sun",
          directShadowsEnabled: true,
          ambientOcclusionEnabled: true,
          date: new Date(), // Real-time sun angle
        },
        weather: { type: "sunny", cloudCover: 0.15 },
      },
      camera: {
        position: {
          x: 73.8567,
          y: 18.5204,
          z: 18000000, // Planetary orbit altitude
          spatialReference: { wkid: 4326 },
        },
        heading: 0,
        tilt: 0,
      },
    });

    // Pick feature attributes on click
    view.on("click", async (event) => {
      try {
        const response = await view.hitTest(event);
        if (response.results.length > 0) {
          const graphic = response.results[0].graphic;
          if (graphic && graphic.attributes) {
            onPick && onPick(graphic.attributes, event.screenPoint);
            return;
          }
        }
        onPick && onPick(null, null);
      } catch (err) {
        console.warn("Hit test error:", err);
      }
    });

    // Mouse Middle Button (Scroll Wheel Click) Drag to Tilt & Rotate
    let isMiddleDragging = false;
    let lastMiddleX = 0;
    let lastMiddleY = 0;

    const handlePointerDown = (event) => {
      if (event.button === 1) {
        isMiddleDragging = true;
        lastMiddleX = event.clientX;
        lastMiddleY = event.clientY;
        event.preventDefault();
      }
    };

    const handlePointerMove = (event) => {
      if (!isMiddleDragging || !viewRef.current) return;
      const dx = event.clientX - lastMiddleX;
      const dy = event.clientY - lastMiddleY;
      lastMiddleX = event.clientX;
      lastMiddleY = event.clientY;

      const camera = viewRef.current.camera.clone();
      // Vertical drag adjusts camera tilt (pitch between 0° and 88°)
      camera.tilt = Math.max(0, Math.min(88, camera.tilt - dy * 0.35));
      // Horizontal drag adjusts camera heading (rotation)
      camera.heading = (camera.heading + dx * 0.35) % 360;

      viewRef.current.camera = camera;
      event.preventDefault();
    };

    const handlePointerUp = (event) => {
      if (event.button === 1 || event.buttons === 0) {
        isMiddleDragging = false;
      }
    };

    const containerEl = mapDivRef.current;
    containerEl.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    viewRef.current = view;

    return () => {
      containerEl.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (orbitFrameRef.current) {
        cancelAnimationFrame(orbitFrameRef.current);
        orbitFrameRef.current = null;
      }
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [onPick]);

  function clearActiveWidget() {
    if (activeWidgetRef.current && viewRef.current) {
      try {
        viewRef.current.ui.remove(activeWidgetRef.current);
        activeWidgetRef.current.destroy();
      } catch (e) {
        console.warn("Error removing widget:", e);
      }
      activeWidgetRef.current = null;
    }
  }

  useImperativeHandle(ref, () => ({
    async loadI3SLayer(packageId, layerUrl) {
      const view = viewRef.current;
      if (!view) return;
      if (layersRef.current[packageId]) return;

      const sceneLayer = new SceneLayer({
        url: layerUrl,
        title: `Layer ${packageId}`,
      });

      view.map.add(sceneLayer);
      layersRef.current[packageId] = sceneLayer;

      try {
        await sceneLayer.load();
        if (sceneLayer.fullExtent) {
          await view.goTo(sceneLayer.fullExtent, { duration: 2500 });
        }
      } catch (e) {
        console.error("Failed to load ArcGIS SceneLayer:", e);
      }
      return sceneLayer;
    },

    unloadI3SLayer(packageId) {
      const view = viewRef.current;
      const layer = layersRef.current[packageId];
      if (view && layer) {
        view.map.remove(layer);
        try {
          layer.destroy();
        } catch (e) {}
        delete layersRef.current[packageId];
      }
    },

    setLayerVisible(packageId, visible) {
      const layer = layersRef.current[packageId];
      if (layer) layer.visible = visible;
    },

    setLayerOpacity(packageId, opacity) {
      const layer = layersRef.current[packageId];
      if (layer) layer.opacity = opacity;
    },

    async flyToLayer(packageId) {
      const view = viewRef.current;
      const layer = layersRef.current[packageId];
      if (!view || !layer) return;

      if (layer.fullExtent) {
        await view.goTo(layer.fullExtent, { duration: 2000 });
      }
    },

    // 3D Analysis Widgets (ArcGIS Earth native features)
    setWidget(widgetType) {
      const view = viewRef.current;
      if (!view) return;
      clearActiveWidget();

      let widget = null;
      try {
        if (widgetType === "daylight") {
          widget = new Daylight({ view: view, playSliderSpeed: 5 });
        } else if (widgetType === "lineOfSight") {
          widget = new LineOfSight({ view: view });
        } else if (widgetType === "slice") {
          widget = new Slice({ view: view });
        } else if (widgetType === "elevationProfile") {
          widget = new ElevationProfile({ view: view });
        } else if (widgetType === "distance") {
          widget = new DirectLineMeasurement3D({ view: view });
        } else if (widgetType === "area") {
          widget = new AreaMeasurement3D({ view: view });
        } else if (widgetType === "weather") {
          widget = new Weather({ view: view });
        }

        if (widget) {
          view.ui.add(widget, "top-right");
          activeWidgetRef.current = widget;
        }
      } catch (e) {
        console.warn("Failed to initialize widget:", widgetType, e);
      }
    },

    toggleOrbit(enable) {
      const view = viewRef.current;
      if (!view) return;
      if (orbitFrameRef.current) {
        cancelAnimationFrame(orbitFrameRef.current);
        orbitFrameRef.current = null;
      }
      if (enable) {
        let lastTime = performance.now();
        const spinSpeed = 0.08; // Silky smooth degrees per 60fps tick

        const step = (currentTime) => {
          if (!viewRef.current) return;
          const dt = Math.min((currentTime - lastTime) / 16.67, 2.0);
          lastTime = currentTime;

          const camera = viewRef.current.camera.clone();
          let newLon = camera.position.longitude - (spinSpeed * dt);
          if (newLon < -180) newLon += 360;
          if (newLon > 180) newLon -= 360;

          camera.position.longitude = newLon;
          viewRef.current.camera = camera;

          orbitFrameRef.current = requestAnimationFrame(step);
        };
        orbitFrameRef.current = requestAnimationFrame(step);
      }
    },

    panVertical(direction) {
      const view = viewRef.current;
      if (!view) return;
      const camera = view.camera.clone();
      const currentZ = camera.position.z;
      const step = Math.max(25, currentZ * 0.2);
      const delta = direction === "up" ? step : -step;
      camera.position.z = Math.max(15, currentZ + delta);
      view.goTo(camera, { duration: 300, easing: "out-expo" });
    },

    adjustTilt(deltaAngle) {
      const view = viewRef.current;
      if (!view) return;
      const camera = view.camera.clone();
      camera.tilt = Math.max(0, Math.min(88, camera.tilt + deltaAngle));
      view.goTo(camera, { duration: 250 });
    },

    async importGISData(file) {
      const view = viewRef.current;
      if (!view) return;

      const name = file.name.toLowerCase();
      try {
        const url = URL.createObjectURL(file);
        if (name.endsWith(".geojson") || name.endsWith(".json")) {
          const layer = new GeoJSONLayer({ url: url });
          view.map.add(layer);
          await layer.load();
          if (layer.fullExtent) view.goTo(layer.fullExtent);
        } else if (name.endsWith(".kml") || name.endsWith(".kmz")) {
          const layer = new KMLLayer({ url: url });
          view.map.add(layer);
          await layer.load();
          if (layer.fullExtent) view.goTo(layer.fullExtent);
        }
      } catch (err) {
        console.error("Failed to import GIS file:", err);
        alert(`Failed to load ${file.name}: ${err.message}`);
      }
    },
  }));

  function handlePanUp() {
    if (!viewRef.current) return;
    const camera = viewRef.current.camera.clone();
    const step = Math.max(25, camera.position.z * 0.2);
    camera.position.z += step;
    viewRef.current.goTo(camera, { duration: 300 });
  }

  function handlePanDown() {
    if (!viewRef.current) return;
    const camera = viewRef.current.camera.clone();
    const step = Math.max(25, camera.position.z * 0.2);
    camera.position.z = Math.max(15, camera.position.z - step);
    viewRef.current.goTo(camera, { duration: 300 });
  }

  function handleTiltUp() {
    if (!viewRef.current) return;
    const camera = viewRef.current.camera.clone();
    camera.tilt = Math.min(88, camera.tilt + 10);
    viewRef.current.goTo(camera, { duration: 250 });
  }

  function handleTiltDown() {
    if (!viewRef.current) return;
    const camera = viewRef.current.camera.clone();
    camera.tilt = Math.max(0, camera.tilt - 10);
    viewRef.current.goTo(camera, { duration: 250 });
  }

  function handleResetNorth() {
    if (!viewRef.current) return;
    const camera = viewRef.current.camera.clone();
    camera.heading = 0;
    viewRef.current.goTo(camera, { duration: 400 });
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />

      {/* Floating Vertical Pan & Navigation Controls (ArcGIS / Cesium style) */}
      <div style={navControlBox}>
        <div style={navControlTitle}>↕️ Vertical Pan &amp; Tilt</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button style={navBtn} onClick={handlePanUp} title="Pan Camera Up (Elevate Altitude)">
            ⬆️ Pan Up
          </button>
          <button style={navBtn} onClick={handlePanDown} title="Pan Camera Down (Lower Altitude)">
            ⬇️ Pan Down
          </button>
          <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
            <button style={{ ...navBtn, flex: 1 }} onClick={handleTiltUp} title="Tilt Camera Up (Pitch)">
              📐 Tilt Up
            </button>
            <button style={{ ...navBtn, flex: 1 }} onClick={handleTiltDown} title="Tilt Camera Down (Pitch)">
              📐 Tilt Down
            </button>
          </div>
          <button style={{ ...navBtn, background: "rgba(49, 130, 206, 0.4)" }} onClick={handleResetNorth} title="Reset North Heading">
            🧭 Reset North
          </button>
        </div>
      </div>
    </div>
  );
});

const navControlBox = {
  position: "absolute",
  bottom: 24,
  right: 14,
  zIndex: 90,
  background: "linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.9))",
  backdropFilter: "blur(12px)",
  padding: "10px",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
  width: 150,
};

const navControlTitle = {
  fontSize: 11,
  fontWeight: 700,
  color: "#90cdf4",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  textAlign: "center",
};

const navBtn = {
  background: "rgba(255, 255, 255, 0.08)",
  color: "#edf2f7",
  border: "none",
  padding: "5px 8px",
  borderRadius: 4,
  fontSize: 11,
  cursor: "pointer",
  transition: "all 0.2s",
  fontWeight: 600,
};

export default ArcGISViewer;
