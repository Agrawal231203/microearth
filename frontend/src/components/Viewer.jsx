import React, { useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import * as Cesium from "cesium";

const Viewer = forwardRef(function Viewer({ onPick }, ref) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const i3sLayersRef = useRef(new Map());
  const measureStateRef = useRef({
    active: false,
    mode: "distance", // "distance", "area", "height"
    points: [],
    entities: [],
  });
  const orbitIntervalRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: true,
      geocoder: true,
      timeline: false,
      animation: false,
      sceneModePicker: true,
      navigationHelpButton: false,
      homeButton: true,
      infoBox: false,
      selectionIndicator: false,
      shadows: true,
      imageryProvider: new Cesium.OpenStreetMapImageryProvider({
        url: "https://a.tile.openstreetmap.org/",
      }),
    });

    // High quality visuals, outer space atmosphere & lighting
    viewer.scene.highDynamicRange = true;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.atmosphereLightIntensity = 12.0;
    viewer.scene.skyAtmosphere = new Cesium.SkyAtmosphere();
    viewer.shadows = true;

    // Position camera at planetary orbital height
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(73.85, 18.52, 20000000),
    });

    if (Cesium.PostProcessStageLibrary.isAmbientOcclusionSupported(viewer.scene)) {
      const ao = viewer.scene.postProcessStages.ambientOcclusion;
      ao.enabled = true;
      ao.uniforms.intensity = 3.0;
      ao.uniforms.bias = 0.1;
      ao.uniforms.lengthCap = 0.03;
      ao.uniforms.stepSize = 1.0;
    }

    // Set initial daytime
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601("2023-06-21T14:00:00Z");

    viewerRef.current = viewer;

    // Feature picking & measurement handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
      const state = measureStateRef.current;
      if (state.active) {
        handleMeasureClick(viewer, movement.position, state);
        return;
      }
      const picked = viewer.scene.pick(movement.position);
      if (Cesium.defined(picked)) {
        const attrs = extractAttributes(picked);
        onPick && onPick(attrs, movement.position);
      } else {
        onPick && onPick(null, null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (orbitIntervalRef.current) clearInterval(orbitIntervalRef.current);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [onPick]);

  function extractAttributes(picked) {
    try {
      if (picked.getPropertyIds) {
        const ids = picked.getPropertyIds();
        const out = {};
        ids.forEach((id) => (out[id] = picked.getProperty(id)));
        return out;
      }
      if (picked.id && picked.id.properties) {
        return picked.id.properties.getValue(Cesium.JulianDate.now());
      }
    } catch (e) {
      console.warn("Could not extract attributes from picked feature", e);
    }
    return null;
  }

  function handleMeasureClick(viewer, screenPos, state) {
    const cartesian = viewer.scene.pickPosition(screenPos);
    if (!Cesium.defined(cartesian)) return;
    state.points.push(cartesian);

    const point = viewer.entities.add({
      position: cartesian,
      point: { pixelSize: 9, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
    });
    state.entities.push(point);

    if (state.mode === "distance" && state.points.length > 1) {
      const a = state.points[state.points.length - 2];
      const b = state.points[state.points.length - 1];
      const dist = Cesium.Cartesian3.distance(a, b);
      const line = viewer.entities.add({
        polyline: {
          positions: [a, b],
          width: 3,
          material: Cesium.Color.YELLOW,
        },
      });
      state.entities.push(line);

      const mid = Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3());
      const label = viewer.entities.add({
        position: mid,
        label: {
          text: `${dist.toFixed(1)} m`,
          font: "13px sans-serif",
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: new Cesium.Color(0, 0, 0, 0.75),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
        },
      });
      state.entities.push(label);
    } else if (state.mode === "area" && state.points.length >= 3) {
      const polygon = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(state.points), false),
          material: Cesium.Color.YELLOW.withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.YELLOW,
        },
      });
      state.entities.push(polygon);
    }
  }

  useImperativeHandle(ref, () => ({
    async loadI3SLayer(packageId, layerUrl) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (i3sLayersRef.current.has(packageId)) return;

      let geoidProvider;
      try {
        geoidProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
          "https://tiles.arcgis.com/tiles/GVgbJbqm8hXASVYi/arcgis/rest/services/EGM2008/ImageServer"
        );
      } catch (e) {
        console.warn("Failed to load geoid terrain provider:", e);
      }

      const provider = await Cesium.I3SDataProvider.fromUrl(layerUrl, {
        geoidTiledTerrainProvider: geoidProvider,
      });
      viewer.scene.primitives.add(provider);
      i3sLayersRef.current.set(packageId, provider);

      // Force ultra high level-of-detail by lowering Maximum Screen Space Error (default is 16 -> set to 2)
      // and boosting memory limit so all high-res 4K textures and detailed meshes are loaded.
      const lodInterval = setInterval(() => {
        let applied = false;
        if (provider.layers) {
          provider.layers.forEach((layer) => {
            if (layer.tileset) {
              layer.tileset.maximumScreenSpaceError = 2; // Ultra-sharp detail
              layer.tileset.maximumMemoryUsage = 4096; // 4GB cache for textures
              layer.tileset.preferLeaves = true; // Load highest detail first
              layer.tileset.skipLevelOfDetail = true;
              layer.tileset.baseScreenSpaceError = 512;
              layer.tileset.skipScreenSpaceErrorFactor = 16;
              layer.tileset.skipLevels = 1;
              layer.tileset.immediatelyLoadDesiredLevelOfDetail = true;
              layer.tileset.loadSiblings = true;
              applied = true;
            }
          });
        }
        if (applied) clearInterval(lodInterval);
      }, 300);

      provider._lodInterval = lodInterval;
      return provider;
    },

    unloadI3SLayer(packageId) {
      const viewer = viewerRef.current;
      const provider = i3sLayersRef.current.get(packageId);
      if (viewer && provider) {
        if (provider._lodInterval) clearInterval(provider._lodInterval);
        viewer.scene.primitives.remove(provider);
        i3sLayersRef.current.delete(packageId);
      }
    },

    setLayerVisible(packageId, visible) {
      const provider = i3sLayersRef.current.get(packageId);
      if (provider) provider.show = visible;
    },

    setLayerOpacity(packageId, opacity) {
      const provider = i3sLayersRef.current.get(packageId);
      if (provider && provider.layers) {
        provider.layers.forEach((layer) => {
          if (layer.tileset) {
            layer.tileset.style = new Cesium.Cesium3DTileStyle({
              color: `color('white', ${opacity})`,
            });
          }
        });
      }
    },

    async flyToLayer(packageId) {
      const viewer = viewerRef.current;
      const provider = i3sLayersRef.current.get(packageId);
      if (!viewer || !provider) return;

      let tilesets = [];
      for (let attempt = 0; attempt < 10; attempt++) {
        tilesets = (provider.layers || []).map((layer) => layer.tileset).filter(Boolean);
        if (tilesets.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (tilesets.length > 0) {
        await viewer.zoomTo(tilesets[0]);
      }
    },

    setTimeOfDay(hour) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const dateStr = `2023-06-21T${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}:00Z`;
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(dateStr);
    },

    setShadows(enabled) {
      const viewer = viewerRef.current;
      if (viewer) viewer.shadows = enabled;
    },

    setWireframe(enabled) {
      const viewer = viewerRef.current;
      if (viewer) viewer.scene.globe._surface.wireframe = enabled;
    },

    toggleOrbit(enable) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (orbitIntervalRef.current) {
        clearInterval(orbitIntervalRef.current);
        orbitIntervalRef.current = null;
      }
      if (enable) {
        orbitIntervalRef.current = setInterval(() => {
          // Rotate the Earth around its polar axis (West to East)
          viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.003);
        }, 30);
      }
    },

    async importGISData(file) {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const name = file.name.toLowerCase();
      try {
        if (name.endsWith(".geojson") || name.endsWith(".json")) {
          const text = await file.text();
          const geojson = JSON.parse(text);
          const ds = await Cesium.GeoJsonDataSource.load(geojson, {
            clampToGround: true,
            stroke: Cesium.Color.CYAN,
            fill: Cesium.Color.CYAN.withAlpha(0.4),
            strokeWidth: 3,
          });
          viewer.dataSources.add(ds);
          viewer.zoomTo(ds);
        } else if (name.endsWith(".kml") || name.endsWith(".kmz")) {
          const ds = await Cesium.KmlDataSource.load(file, {
            camera: viewer.scene.camera,
            canvas: viewer.scene.canvas,
            clampToGround: true,
          });
          viewer.dataSources.add(ds);
          viewer.zoomTo(ds);
        }
      } catch (err) {
        console.error("Failed to load GIS file:", err);
        alert(`Failed to load file ${file.name}: ${err.message}`);
      }
    },

    setMeasureActive(active, mode = "distance") {
      const state = measureStateRef.current;
      state.active = active;
      state.mode = mode;
      if (!active) {
        const viewer = viewerRef.current;
        state.entities.forEach((e) => viewer && viewer.entities.remove(e));
        state.entities = [];
        state.points = [];
      }
    },

    panVertical(direction) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const height = viewer.camera.positionCartographic.height;
      const step = Math.max(25, height * 0.2);
      if (direction === "up") {
        viewer.camera.moveUp(step);
      } else {
        viewer.camera.moveDown(step);
      }
    },
  }));

  function handlePanUp() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const height = viewer.camera.positionCartographic.height;
    viewer.camera.moveUp(Math.max(25, height * 0.2));
  }

  function handlePanDown() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const height = viewer.camera.positionCartographic.height;
    viewer.camera.moveDown(Math.max(25, height * 0.2));
  }

  function handleTiltUp() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.lookUp(Cesium.Math.toRadians(10));
  }

  function handleTiltDown() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.lookDown(Cesium.Math.toRadians(10));
  }

  function handleResetNorth() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.setView({
      orientation: {
        heading: 0,
        pitch: viewer.camera.pitch,
        roll: 0,
      },
    });
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Floating Vertical Pan & Navigation Controls */}
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

export default Viewer;

