from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks

from app.config import MAX_UPLOAD_SIZE, PUBLIC_BASE_URL
from app.models import UploadResponse, PackageDetail
from app.services import storage
from app.services.slpk_extractor import (
    extract_slpk,
    read_scene_layer_info,
    SlpkExtractionError,
)

router = APIRouter(prefix="/api", tags=["upload"])


def _run_extraction(package_id: str) -> None:
    pkg = storage.get_package(package_id)
    if pkg is None:
        return
    pkg.status = "extracting"
    storage.save_package(pkg)

    slpk_path = storage.upload_path_for(package_id, pkg.filename)
    dest_dir = storage.extract_path_for(package_id)

    try:
        layer_root = extract_slpk(slpk_path, dest_dir)
        info = read_scene_layer_info(layer_root)
        rel = layer_root.relative_to(dest_dir)
        rel_str = "" if str(rel) == "." else f"/{rel.as_posix()}"
        pkg.layer_url = f"{PUBLIC_BASE_URL}/api/layers/{package_id}{rel_str}"
        pkg.scene_layer_info = info
        pkg.status = "ready"
    except SlpkExtractionError as e:
        pkg.status = "error"
        pkg.error = str(e)
    except Exception as e:  # keep the background task from dying silently
        pkg.status = "error"
        pkg.error = f"Unexpected extraction failure: {e}"
    finally:
        storage.save_package(pkg)


@router.post("/upload", response_model=UploadResponse)
async def upload_slpk(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".slpk"):
        raise HTTPException(400, "Only .slpk files are accepted")

    package_id = storage.new_package_id()
    dest = storage.upload_path_for(package_id, file.filename)

    size = 0
    with open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_SIZE:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, "File exceeds maximum upload size")
            out.write(chunk)

    pkg = PackageDetail(
        id=package_id,
        filename=file.filename,
        size_bytes=size,
        status="uploaded",
    )
    storage.save_package(pkg)

    # Extraction (Phase 3) runs in the background so the upload request
    # returns immediately; the frontend polls /api/packages/{id}.
    background_tasks.add_task(_run_extraction, package_id)

    return UploadResponse(id=package_id, filename=file.filename, status="uploaded")
