import mimetypes

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from app.models import PackageDetail, PackageSummary
from app.services import storage

router = APIRouter(prefix="/api", tags=["packages"])


@router.get("/packages", response_model=list[PackageSummary])
def list_packages():
    return storage.list_packages()


@router.get("/packages/{package_id}", response_model=PackageDetail)
def get_package(package_id: str):
    pkg = storage.get_package(package_id)
    if pkg is None:
        raise HTTPException(404, "Package not found")
    return pkg


@router.delete("/packages/{package_id}")
def delete_package(package_id: str):
    ok = storage.delete_package(package_id)
    if not ok:
        raise HTTPException(404, "Package not found")
    return {"deleted": package_id}


def _safe_join(base_dir, resource_path: str):
    """Resolve resource_path under base_dir, rejecting path traversal.
    Returns the resolved Path, or None if it would escape base_dir."""
    target = (base_dir / resource_path).resolve() if resource_path else base_dir.resolve()
    base_resolved = base_dir.resolve()
    if base_resolved != target and base_resolved not in target.parents:
        return None
    return target


def _resolve_layer_directory(target):
    """Given a directory path, find the resource that represents it
    (I3S layer root -> 3dSceneLayer.json, otherwise index.json or 3dNodeIndexDocument.json)."""
    for candidate_name in ("3dSceneLayer.json", "index.json", "3dNodeIndexDocument.json"):
        candidate = target / candidate_name
        if candidate.exists():
            return candidate
    return None


@router.get("/layers/{package_id}/{resource_path:path}")
def serve_layer_resource(package_id: str, resource_path: str, request: Request):
    """
    Serve extracted I3S resources as static files.

    Two client quirks this route works around:

    1. Real ArcGIS I3S/SceneServer clients (including CesiumJS's
       I3SDataProvider) commonly append query params like `?f=json` to
       REST resource URLs. Since we're serving from plain decompressed
       files on disk, we deliberately ignore the query string and just
       resolve the path.

    2. I3SDataProvider treats the URL you hand it as a *SceneServer*
       root, and once it reads the layer's own "id" field from our
       3dSceneLayer.json, it re-requests the "real" layer at
       `{url}/{id}/...`. Our extracted tree doesn't have that extra
       `{id}/` nesting (we serve the layer directly at its root), so if
       the literal path 404s and its first segment is numeric, we retry
       with that segment stripped — transparently aliasing
       `.../0/nodes/...` to `.../nodes/...`.
    """
    pkg = storage.get_package(package_id)
    if pkg is None or pkg.status != "ready":
        raise HTTPException(404, "Package not found or not ready")

    base_dir = storage.extract_path_for(package_id)

    clean_path = resource_path.strip("/")
    candidates = [clean_path]

    # Strip client-specific layer prefixes:
    # 1. "layers/{id}/..." (e.g. "layers/0/nodepages/0")
    # 2. "{id}/..." (e.g. "0/nodepages/0")
    # where {id} is numeric.
    parts = clean_path.split("/", 1)
    if parts[0] == "layers" and len(parts) > 1:
        subparts = parts[1].split("/", 1)
        if subparts[0].isdigit():
            clean_path = subparts[1] if len(subparts) > 1 else ""
            candidates.append(clean_path)

    parts = clean_path.split("/", 1)
    if parts[0].isdigit():
        candidates.append(parts[1] if len(parts) > 1 else "")

    target = None
    for cand in candidates:
        cand_clean = cand.strip("/")
        resolved = _safe_join(base_dir, cand_clean)
        if resolved is None:
            raise HTTPException(400, "Invalid resource path")
        if resolved.exists():
            target = resolved
            break
        # Probe common single and compound extensions (e.g. 0_0_1.bin.dds, 0.bin, etc.)
        found = False
        for ext in (
            ".json",
            ".bin.dds",
            ".bin.ktx",
            ".bin.ktx2",
            ".bin",
            ".dds",
            ".ktx",
            ".ktx2",
            ".jpg",
            ".jpeg",
            ".png",
            ".draco",
        ):
            alt = resolved.with_name(f"{resolved.name}{ext}")
            if alt.exists():
                target = alt
                found = True
                break
        if found:
            break

        # Fallback: check prefix matches in parent directory
        if resolved.parent.exists() and resolved.parent.is_dir():
            prefix_matches = [
                f for f in resolved.parent.iterdir()
                if f.name.startswith(resolved.name) and f.is_file()
            ]
            if prefix_matches:
                target = prefix_matches[0]
                break

    if target is None:
        raise HTTPException(404, f"Resource not found: {resource_path}")

    if target.is_dir():
        layer_resource = _resolve_layer_directory(target)
        if layer_resource is None:
            raise HTTPException(404, "Resource not found")
        target = layer_resource

    media_type, _ = mimetypes.guess_type(str(target))
    name_lower = target.name.lower()
    if name_lower.endswith((".dds", ".bin.dds")):
        media_type = "image/vnd.ms-dds"
    elif name_lower.endswith((".ktx", ".ktx2", ".bin.ktx", ".bin.ktx2")):
        media_type = "image/ktx2"
    elif name_lower.endswith((".jpg", ".jpeg")):
        media_type = "image/jpeg"
    elif name_lower.endswith(".png"):
        media_type = "image/png"
    elif target.suffix in ("", ".json") and media_type is None:
        media_type = "application/json"
    media_type = media_type or "application/octet-stream"

    return FileResponse(target, media_type=media_type)

