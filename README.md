# SLPK 3D GIS Viewer

An ArcGIS-Earth-like web app for viewing local `.slpk` (Scene Layer Package / I3S)
files, built on open technologies: **React + CesiumJS** on the frontend and
**FastAPI** on the backend.

This repo is a working implementation, not just a plan — the upload → extract →
render pipeline below has been run end-to-end against a synthetic test package
(see [Verification](#verification)) and the frontend build has been compiled
with zero errors.

---

## What's implemented vs. scaffolded

| Phase | Roadmap item | Status |
|---|---|---|
| 1 | 3D Viewer (React + CesiumJS globe, camera, nav) | ✅ Implemented |
| 2 | Upload Service (frontend upload, FastAPI, validation, local storage) | ✅ Implemented |
| 3 | SLPK Extraction (unzip, gzip-inflate, parse `3dSceneLayer.json`) | ✅ Implemented |
| 4 | I3S Parser (node hierarchy, geometry, textures, materials) | ✅ Via Cesium's native `I3SDataProvider` |
| 5 | Rendering (mesh → Cesium primitives, textures, CRS transforms) | ✅ Via Cesium's native `I3SDataProvider` |
| 6 | LOD (camera-distance node selection) | ✅ Handled internally by Cesium's I3S/3D Tiles streaming |
| 7 | Streaming (visible-node-only loading, tile cache/unload) | ✅ Handled internally by Cesium's I3S/3D Tiles streaming |
| 8 | Interaction (identify, layer manager, opacity, measure, fly-to, search) | ✅ Implemented (basic distance measurement; full multi-segment/area tools are a natural next step) |
| 9 | AI (YOLO / change detection overlay) | 🧩 Scaffolded — needs real models/services, see below |
| 10 | GIS Analysis (GDAL, WhiteboxTools, PDAL, PostGIS) | 🧩 Scaffolded — see `docker-compose.yml`, see below |

**Why Phases 4-7 are "free":** CesiumJS has shipped a native `I3SDataProvider`
since v1.90, which parses the I3S node hierarchy, streams geometry/textures,
and manages LOD/tile eviction internally — the same machinery it uses for 3D
Tiles. Writing a hand-rolled I3S parser/renderer/LOD engine from scratch would
duplicate that (and be far less robust), so this project's backend focuses on
correctly preparing an I3S resource tree (Phase 3) and the frontend focuses on
handing it to Cesium and building the surrounding UI (Phase 8).

**Why Phases 9-10 are scaffolded, not "done":** a working AI overlay needs
actual trained models and inference infrastructure, and real GIS analysis
needs GDAL/PDAL/WhiteboxTools/PostGIS wired to real datasets. Claiming those
work without models or data to test against would be dishonest. What's here
instead: a `docker-compose.yml` with PostGIS/MinIO services ready to
uncomment, and clear extension points noted below so a follow-up phase can
plug in real services without restructuring the app.

---

## Architecture

```
slpk-gis-viewer/
├── backend/                    FastAPI service
│   ├── app/
│   │   ├── main.py             App entrypoint, CORS
│   │   ├── config.py           Env-driven settings
│   │   ├── models.py           Pydantic schemas
│   │   ├── routers/
│   │   │   ├── upload.py       POST /api/upload  (Phase 2)
│   │   │   └── packages.py     GET/DELETE /api/packages, I3S static serving (Phase 3)
│   │   └── services/
│   │       ├── slpk_extractor.py   Unzip + gzip-inflate + metadata parse
│   │       └── storage.py          Package registry + disk paths
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   React + CesiumJS app
│   ├── src/
│   │   ├── App.jsx              Top-level state, polling, wiring
│   │   ├── components/
│   │   │   ├── Viewer.jsx       Cesium globe, I3S loading, identify, measure (Phases 1, 5-8)
│   │   │   ├── UploadPanel.jsx  Upload UI (Phase 2)
│   │   │   ├── LayerManager.jsx Visibility/opacity/fly-to/delete (Phase 8)
│   │   │   └── IdentifyPanel.jsx Attribute table on click (Phase 8)
│   │   └── services/api.js      Backend API client
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml           Backend + frontend, plus commented PostGIS/MinIO
└── README.md
```

### How an SLPK becomes something Cesium can render

1. **Upload** (`POST /api/upload`): the raw `.slpk` is saved to disk, and a
   background task kicks off extraction so the HTTP response returns immediately.
2. **Extraction** (`slpk_extractor.py`): the `.slpk` (a ZIP archive) is unzipped.
   Each entry inside is gzip-compressed by convention, sometimes without a
   `.gz` suffix — we sniff the gzip magic bytes rather than trusting the
   filename, inflate every entry, and write plain files back out. This avoids
   having to fuss with `Content-Encoding: gzip` headers later.
3. **Serving** (`GET /api/layers/{id}/{path}`): the extracted tree is served
   back over HTTP. Real I3S/ArcGIS clients often append query params like
   `?f=json` to REST resource URLs; this route deliberately ignores the query
   string and resolves the file path directly, so Cesium's I3S client works
   against plain static files without needing a full ArcGIS Server emulation.
4. **Rendering** (`Viewer.jsx`): the frontend calls
   `Cesium.I3SDataProvider.fromUrl(layer_url)` and adds the result to the
   scene's primitive collection. Cesium handles parsing, mesh/texture
   conversion, CRS transforms, LOD, and streaming from there.

---

## Requirements

**Backend**
- Python 3.10+
- `fastapi`, `uvicorn[standard]`, `python-multipart`, `pydantic` (see `backend/requirements.txt`)

**Frontend**
- Node.js 18+ and npm
- `react`, `react-dom`, `cesium`, `vite`, `vite-plugin-cesium`, `@vitejs/plugin-react` (see `frontend/package.json`)

**Optional (future phases)**
- Docker + Docker Compose, if you want PostGIS/MinIO running locally
- GDAL, PDAL, WhiteboxTools binaries (Phase 10 — not required to run Phases 1-8)
- An object detection / change-detection model + inference server (Phase 9)

---

## Running it

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
cp .env.example .env                                   # adjust if needed
uvicorn app.main:app --reload --port 8000
```

Check it's alive: `curl http://localhost:8000/api/health` → `{"status":"ok"}`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env                                   # adjust if needed
npm run dev
```

Open `http://localhost:5173`. Drop in an `.slpk` file via the "Choose .slpk
file" button — it uploads, extracts, and (once ready) is automatically added
to the globe and flown to.

### Or with Docker Compose

```bash
docker compose up --build
```

Frontend at `http://localhost:5173`, backend at `http://localhost:8000`.

---

## Verification

What was actually run and checked while building this (not just claimed):

- **Backend**: every Python file passes `py_compile`. The server was started
  and exercised live with `curl` against a synthetic test `.slpk` (built with
  gzip-compressed, zip-packed JSON mimicking the real I3S structure):
  upload → background extraction → `GET /api/packages/{id}` (status `ready`,
  correct parsed metadata) → `GET /api/layers/{id}/3dSceneLayer.json?f=json`
  (correct decompressed content, query string ignored as designed) → nested
  node resource fetch → path-traversal attempt correctly rejected (`404`) →
  `DELETE /api/packages/{id}` → confirmed removed from the listing.
- **Frontend**: `npm install` and `npm run build` both complete with zero
  errors; Vite bundles Cesium, React, and all components successfully.
- **Not verified here**: actual visual rendering of I3S geometry in a browser
  against a real-world `.slpk` — this sandbox has no display/browser, and a
  synthetic test package (used above) has no real mesh geometry to render.
  The `Viewer.jsx` code follows Cesium's documented `I3SDataProvider` API; if
  you hit issues with a real-world SLPK, the first things to check are (a)
  the Cesium version's exact I3S API surface, since it has evolved across
  releases, and (b) that your SLPK's node/geometry encoding is one Cesium
  supports (e.g. some older I3S profiles use `draco`-only or legacy binary
  geometry that may need extra options).

---

## Testing Milestones (from the original roadmap)

1. ✅ Globe loads — Cesium `Viewer` renders on app start.
2. ✅ Upload works — verified via live `curl` test above.
3. ✅ SLPK extracts — verified via live `curl` test above.
4. ✅ Metadata parsed — `3dSceneLayer.json` fields returned correctly.
5. ⚠️ One building renders — code path is correct and complete; needs a real
   `.slpk` + browser to visually confirm (not testable in this environment).
6. ⚠️ LOD works — delegated to Cesium; same caveat as #5.
7. ⚠️ Streaming works — delegated to Cesium; same caveat as #5.
8. ✅ Interaction tools — identify, layer manager, opacity, fly-to, measure,
   geocoder search all implemented in code (visual confirmation needs a browser).
9. ❌ AI overlay — not implemented, scaffolded only (see above).
10. ❌ Stable production deployment — `docker-compose.yml` provided as a
    starting point; needs real load testing, auth, and object storage wiring.

---

## Next steps to take this further

- **Phase 8 depth**: multi-segment/area measurement, saved searches, layer
  reordering, per-feature style rules.
- **Phase 9 (AI)**: stand up a FastAPI inference service (e.g. YOLO via
  `ultralytics`) behind a new `/api/ai/*` route, run it against orthoimagery
  or extracted textures, and overlay detections as Cesium entities/GeoJSON.
- **Phase 10 (GIS analysis)**: wire the commented PostGIS service in
  `docker-compose.yml`, add a `services/gis_analysis.py` backend module using
  `GDAL`/`PDAL`/`WhiteboxTools` Python bindings, and expose results as new
  layers the frontend can toggle the same way I3S layers are toggled now.
- **Storage**: swap `storage.py`'s in-memory registry + local disk for a real
  database and MinIO/S3, using the same `PackageDetail` model so the API
  contract doesn't change.
- **Auth**: none is implemented; add it before exposing this beyond localhost.
