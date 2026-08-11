"""
Lightweight package registry.

For a production deployment this would be a real database (e.g. Postgres,
see Phase 10 notes in the README) plus object storage (MinIO/S3) instead of
local disk. For a self-contained, easy-to-run project we keep an in-memory
index (rebuilt from disk on startup) backed by local files, which is enough
to develop and test every phase end-to-end.
"""
from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Dict, Optional

from app.config import UPLOAD_DIR, EXTRACT_DIR
from app.models import PackageDetail

_lock = threading.Lock()
_packages: Dict[str, PackageDetail] = {}


def new_package_id() -> str:
    return uuid.uuid4().hex[:12]


def upload_path_for(package_id: str, filename: str) -> Path:
    safe_name = Path(filename).name  # strip any path components
    return UPLOAD_DIR / f"{package_id}_{safe_name}"


def extract_path_for(package_id: str) -> Path:
    return EXTRACT_DIR / package_id


def save_package(pkg: PackageDetail) -> None:
    with _lock:
        _packages[pkg.id] = pkg


def get_package(package_id: str) -> Optional[PackageDetail]:
    with _lock:
        return _packages.get(package_id)


def list_packages() -> list[PackageDetail]:
    with _lock:
        return list(_packages.values())


def delete_package(package_id: str) -> bool:
    with _lock:
        pkg = _packages.pop(package_id, None)
    if pkg is None:
        return False
    upload_path_for(package_id, pkg.filename).unlink(missing_ok=True)
    ex = extract_path_for(package_id)
    if ex.exists():
        import shutil

        shutil.rmtree(ex, ignore_errors=True)
    return True


def rebuild_index_from_disk() -> None:
    """Rebuild the in-memory index from files on disk."""
    if not UPLOAD_DIR.exists():
        return

    from app.config import PUBLIC_BASE_URL
    from app.services.slpk_extractor import read_scene_layer_info, _find_layer_root

    for upload_file in UPLOAD_DIR.iterdir():
        if upload_file.is_dir() or not upload_file.name.endswith(".slpk"):
            continue

        parts = upload_file.name.split("_", 1)
        if len(parts) != 2:
            continue
        package_id, filename = parts

        # Check if extracted dir exists
        dest_dir = extract_path_for(package_id)
        layer_root = _find_layer_root(dest_dir)

        if layer_root is not None:
            # Reconstruct ready package
            try:
                info = read_scene_layer_info(layer_root)
                rel = layer_root.relative_to(dest_dir)
                rel_str = "" if str(rel) == "." else f"/{rel.as_posix()}"
                layer_url = f"{PUBLIC_BASE_URL}/api/layers/{package_id}{rel_str}"
                pkg = PackageDetail(
                    id=package_id,
                    filename=filename,
                    size_bytes=upload_file.stat().st_size,
                    status="ready",
                    layer_url=layer_url,
                    scene_layer_info=info,
                )
                _packages[package_id] = pkg
            except Exception:
                # Fallback if parsing failed
                pkg = PackageDetail(
                    id=package_id,
                    filename=filename,
                    size_bytes=upload_file.stat().st_size,
                    status="error",
                    error="Failed to reconstruct metadata on startup",
                )
                _packages[package_id] = pkg
        else:
            # Just uploaded
            pkg = PackageDetail(
                id=package_id,
                filename=filename,
                size_bytes=upload_file.stat().st_size,
                status="uploaded",
            )
            _packages[package_id] = pkg


# Rebuild index from disk on startup/import
rebuild_index_from_disk()
