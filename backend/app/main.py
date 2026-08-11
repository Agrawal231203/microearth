from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.routers import upload, packages

app = FastAPI(
    title="SLPK 3D GIS Viewer - Backend",
    description=(
        "Upload service + SLPK/I3S extraction + REST serving for the "
        "SLPK 3D GIS viewer (Phases 2-3, backing Phases 4-8 via CesiumJS's "
        "native I3S support on the frontend)."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(packages.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
