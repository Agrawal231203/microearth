from typing import Optional, Any, Dict
from pydantic import BaseModel


class PackageSummary(BaseModel):
    id: str
    filename: str
    size_bytes: int
    status: str  # "uploaded" | "extracting" | "ready" | "error"
    error: Optional[str] = None


class PackageDetail(PackageSummary):
    layer_url: Optional[str] = None  # URL to feed into Cesium I3SDataProvider
    scene_layer_info: Optional[Dict[str, Any]] = None


class UploadResponse(BaseModel):
    id: str
    filename: str
    status: str
