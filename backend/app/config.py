"""
Central configuration for the SLPK 3D GIS backend.
All paths/settings can be overridden via environment variables (see .env.example).
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

# Where raw uploaded .slpk files are stored
UPLOAD_DIR = Path(os.getenv("SLPK_UPLOAD_DIR", BASE_DIR / "storage" / "uploads"))

# Where extracted (decompressed) I3S REST-structure folders are written.
# Each package gets its own subfolder: EXTRACT_DIR/<package_id>/
EXTRACT_DIR = Path(os.getenv("SLPK_EXTRACT_DIR", BASE_DIR / "storage" / "extracted"))

# Max upload size in bytes (default 2GB)
MAX_UPLOAD_SIZE = int(os.getenv("SLPK_MAX_UPLOAD_SIZE", 2 * 1024 * 1024 * 1024))

# Allowed origins for CORS (comma separated). "*" allows everything (dev only).
CORS_ORIGINS = os.getenv("SLPK_CORS_ORIGINS", "*").split(",")

# Public base URL the frontend uses to reach this backend (used to build I3S layer URLs)
PUBLIC_BASE_URL = os.getenv("SLPK_PUBLIC_BASE_URL", "http://localhost:8000")

for d in (UPLOAD_DIR, EXTRACT_DIR):
    d.mkdir(parents=True, exist_ok=True)
