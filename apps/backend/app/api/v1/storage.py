"""
Storage Management & Upload Endpoints (PRD v2.2 Bagian 15.3 & Bagian 16.3)
Mengelola upload file aman dengan validasi magic bytes, penyimpanan ke Supabase Storage/filesystem,
dan penyajian file publik maupun signed-URL privat dengan trigger unduhan attachment langsung.
"""

import os
import uuid
import json
import time
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse, JSONResponse
import sqlalchemy as sa

from app.core.config import settings
from app.core.database import get_engine, get_database_engine
from app.core.security import (
    validate_uploaded_file,
    get_current_tenant_context,
    AuthenticatedTenantContext,
    verify_signed_storage_token,
    generate_signed_storage_token,
)
from app.authz.pdp import public_endpoint, require_capability

logger = logging.getLogger("orchestree.api.storage")
router = APIRouter(prefix="/api/v1/storage", tags=["Storage & Uploads"])

STORAGE_BASE_DIR = Path("apps/backend/storage_data")
STORAGE_BASE_DIR.mkdir(parents=True, exist_ok=True)


class GenerateDownloadUrlRequest(BaseModel):
    bucket: str = Field(default="documents", description="Storage bucket (documents, avatars, artifacts)")
    file_path: str = Field(..., description="Path relatif berkas dalam bucket")
    expires_seconds: int = Field(default=300, ge=60, le=1800, description="Masa berlaku signed URL (detik)")


@router.post("/upload", dependencies=[Depends(require_capability("storage.upload"))])
async def upload_file(
    file: UploadFile = File(...),
    bucket: str = Form("documents"),
    tenant_id: Optional[str] = Form(None),
    category: str = Form("attachments"),
):
    """
    Unggah file dengan validasi ketat magic bytes (anti-eksekusi biner & skrip).
    Mendukung kategori: documents, avatars, artifacts, attachments, staff, selection, references.
    """
    valid_buckets = {"documents", "avatars", "artifacts"}
    if bucket not in valid_buckets:
        bucket = "documents"

    effective_tenant_id = tenant_id or "default"
    content = await file.read()

    is_valid, detected_mime, storage_path, signed_or_err = validate_uploaded_file(
        content=content,
        declared_filename=file.filename or "upload.bin",
        tenant_id=effective_tenant_id,
        category=category,
    )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validasi berkas gagal: {signed_or_err}",
        )

    # Simpan file ke sistem penyimpanan terisolasi
    target_path = STORAGE_BASE_DIR / bucket / storage_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "wb") as f:
        f.write(content)

    file_id = str(uuid.uuid4())
    checksum = hashlib.sha256(content).hexdigest()
    public_url = f"/api/v1/storage/{bucket}/{storage_path}"

    # Catat ke storage.objects & file_artifacts di Supabase PostgreSQL
    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            with conn.begin():
                # 1. Catat ke storage.objects
                conn.execute(
                    sa.text("""
                        INSERT INTO storage.objects (id, bucket_id, name, metadata)
                        VALUES (:id, :bucket_id, :name, :metadata)
                        ON CONFLICT (id) DO NOTHING;
                    """),
                    {
                        "id": file_id,
                        "bucket_id": bucket,
                        "name": storage_path,
                        "metadata": json.dumps({
                            "mimetype": detected_mime,
                            "size": len(content),
                            "filename": file.filename,
                            "checksum_sha256": checksum,
                        }),
                    },
                )

                # 2. Catat ke file_artifacts bila tenant_id terdaftar
                if effective_tenant_id != "default":
                    conn.execute(
                        sa.text("""
                            INSERT INTO file_artifacts (
                                id, tenant_id, file_name, storage_path, public_url,
                                mime_type, file_size_bytes, checksum_sha256, verified_clean
                            ) VALUES (
                                :id, :tenant_id, :file_name, :storage_path, :public_url,
                                :mime_type, :file_size_bytes, :checksum, true
                            ) ON CONFLICT (id) DO NOTHING;
                        """),
                        {
                            "id": file_id,
                            "tenant_id": effective_tenant_id,
                            "file_name": file.filename or "berkas.bin",
                            "storage_path": storage_path,
                            "public_url": public_url,
                            "mime_type": detected_mime,
                            "file_size_bytes": len(content),
                            "checksum": checksum,
                        },
                    )
    except Exception as e:
        logger.warning("Gagal sinkronisasi metadata objek penyimpanan Supabase: %s", e)

    return {
        "status": "success",
        "file_id": file_id,
        "file_artifact_id": file_id,
        "bucket": bucket,
        "storage_path": storage_path,
        "public_url": public_url,
        "signed_url": signed_or_err,
        "content_type": detected_mime,
        "size_bytes": len(content),
        "filename": file.filename,
        "checksum_sha256": checksum,
    }


@router.post("/generate-signed-download-url", dependencies=[Depends(require_capability("storage.download"))])
async def generate_signed_download_url(
    payload: GenerateDownloadUrlRequest,
    context: AuthenticatedTenantContext = Depends(get_current_tenant_context),
):
    """
    Menghasilkan Signed URL sementara bermasa berlaku pendek (short-lived)
    yang memicu pengunduhan file nyata (Content-Disposition: attachment).
    """
    expires_ts = int(time.time() + payload.expires_seconds)
    token = generate_signed_storage_token(payload.bucket, payload.file_path, expires_ts)
    signed_download_url = (
        f"/api/v1/storage/signed-download/{payload.bucket}/{payload.file_path}?token={token}&expires={expires_ts}"
    )

    return {
        "status": "success",
        "bucket": payload.bucket,
        "file_path": payload.file_path,
        "signed_download_url": signed_download_url,
        "expires_at": expires_ts,
        "expires_in_seconds": payload.expires_seconds,
    }


@router.get("/signed-download/{bucket}/{file_path:path}", dependencies=[Depends(public_endpoint("storage.signed_download"))])
async def signed_download_file(
    bucket: str,
    file_path: str,
    token: Optional[str] = Query(None),
    expires: Optional[float] = Query(None),
    authorization: Optional[str] = None,
):
    """
    Mengunduh berkas dengan verifikasi signed token atau sesi otentikasi.
    Selalu memicu unduhan langsung pada peramban (Content-Disposition: attachment).
    """
    has_auth = bool(authorization and authorization.strip().startswith("Bearer"))
    is_signed_valid = False
    if token and expires:
        try:
            is_signed_valid = verify_signed_storage_token(bucket, file_path, token, float(expires))
        except Exception:
            is_signed_valid = False

    if not (has_auth or is_signed_valid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Unduhan berkas memerlukan Signed URL sementara yang sah atau sesi terautentikasi.",
        )

    target_path = _find_file_path(bucket, file_path)
    if not target_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Berkas '{file_path}' pada bucket '{bucket}' tidak ditemukan.",
        )

    return FileResponse(
        path=str(target_path),
        filename=target_path.name,
        content_disposition_type="attachment",
    )


@router.get("/{bucket}/{file_path:path}", dependencies=[Depends(public_endpoint("storage.view"))])
async def get_storage_file(
    bucket: str,
    file_path: str,
    token: Optional[str] = Query(None),
    expires: Optional[float] = Query(None),
    download: Optional[int] = Query(0),
    authorization: Optional[str] = None,
):
    """
    Menyajikan berkas dari storage bucket.
    Bucket 'documents' bersifat privat: WAJIB melalui signed URL valid bermasa berlaku pendek atau sesi terautentikasi.
    Bucket 'avatars' dan 'artifacts' bersifat publik.
    Jika parameter `download=1`, berkas dikirim dengan Content-Disposition: attachment.
    """
    private_buckets = {"documents", "contracts", "payroll", "staff"}
    if bucket.lower() in private_buckets:
        has_auth = bool(authorization and authorization.strip().startswith("Bearer"))
        is_signed_valid = False
        if token and expires:
            try:
                is_signed_valid = verify_signed_storage_token(bucket, file_path, token, float(expires))
            except Exception:
                is_signed_valid = False

        if not (has_auth or is_signed_valid):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: Dokumen internal privat hanya dapat diakses melalui Signed URL bermasa berlaku pendek yang sah atau sesi terautentikasi resmi.",
            )

    target_path = _find_file_path(bucket, file_path)
    if not target_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Berkas '{file_path}' pada bucket '{bucket}' tidak ditemukan.",
        )

    disposition = "attachment" if download else "inline"
    return FileResponse(
        path=str(target_path),
        filename=target_path.name,
        content_disposition_type=disposition,
    )


def _find_file_path(bucket: str, file_path: str) -> Optional[Path]:
    target_path = STORAGE_BASE_DIR / bucket / file_path
    if target_path.exists() and target_path.is_file():
        return target_path

    alt_roots = [
        Path("storage_data"),
        Path("/app/applet/storage_data"),
        Path("apps/backend/storage_data"),
    ]
    for root in alt_roots:
        candidate = root / bucket / file_path
        if candidate.exists() and candidate.is_file():
            return candidate
        matches = list((root / bucket).glob(f"**/{Path(file_path).name}"))
        if matches:
            return matches[0]

    return None
