"""
Admin API Endpoints untuk Prospect & Trial Slot Management (PRD v2.2 Bagian 13.5).
Mendukung AdminSuperHubScreen di apps/admin.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, status, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field, EmailStr
import sqlalchemy as sa
from app.core.database import get_database_engine
from app.core.security import get_current_tenant_context, AuthenticatedTenantContext
from app.domains.prospect.trial_allocation import (
    TrialSlotAllocationService,
    SlotCapacityExhaustedError,
    ProspectNotFoundError,
    TrialAllocationError
)

router = APIRouter(prefix="/admin", tags=["Admin Prospects & Trial"])


class ScheduleMeetingRequest(BaseModel):
    meeting_date: str = Field(..., description="ISO 8601 string tanggal pertemuan")
    meeting_link: Optional[str] = None
    notes: Optional[str] = None


class ActivateTrialRequest(BaseModel):
    tenant_id: str = Field(..., description="ID Tenant yang ditautkan ke uji coba")
    notes: Optional[str] = None


@router.get("/prospects", summary="Daftar Semua Prospek & Status Uji Coba")
async def list_prospects(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengembalikan daftar prospek organisasi untuk Admin Super Hub."""
    engine = get_database_engine()
    with engine.connect() as conn:
        query_str = """
            SELECT 
                p.id, p.full_name, p.work_email, p.phone_number, p.company_name,
                p.company_scale, p.interest_type, p.notes, p.trial_status, p.meeting_status,
                p.scheduled_meeting_date, p.scheduled_meeting_link, p.scheduled_meeting_notes,
                p.trial_credits_allocated, p.trial_notes, p.assigned_slot_number,
                p.web_integrity_verified, p.created_at, p.updated_at,
                s.status as slot_status, s.expires_at as slot_expires_at
            FROM prospects p
            LEFT JOIN trial_slots s ON p.id = s.prospect_id
            WHERE 1=1
        """
        params: Dict[str, Any] = {"limit": limit, "offset": offset}

        if status_filter:
            query_str += " AND p.trial_status = :status_filter"
            params["status_filter"] = status_filter
        if search:
            query_str += " AND (p.full_name ILIKE :search OR p.company_name ILIKE :search OR p.work_email ILIKE :search)"
            params["search"] = f"%{search}%"

        query_str += " ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset;"

        rows = conn.execute(sa.text(query_str), params).mappings().all()

        total_count = conn.execute(
            sa.text("SELECT COUNT(*) FROM prospects;")
        ).scalar() or 0

        prospects_list = []
        for r in rows:
            prospects_list.append({
                "id": str(r["id"]),
                "full_name": r["full_name"],
                "work_email": r["work_email"],
                "phone_number": r["phone_number"],
                "company_name": r["company_name"],
                "company_scale": r["company_scale"],
                "interest_type": r["interest_type"],
                "notes": r["notes"],
                "trial_status": r["trial_status"],
                "meeting_status": r["meeting_status"],
                "scheduled_meeting_date": r["scheduled_meeting_date"].isoformat() if r["scheduled_meeting_date"] else None,
                "scheduled_meeting_link": r["scheduled_meeting_link"],
                "scheduled_meeting_notes": r["scheduled_meeting_notes"],
                "trial_credits_allocated": r["trial_credits_allocated"],
                "trial_notes": r["trial_notes"],
                "assigned_slot_number": r["assigned_slot_number"],
                "slot_status": r["slot_status"],
                "slot_expires_at": r["slot_expires_at"].isoformat() if r["slot_expires_at"] else None,
                "web_integrity_verified": r["web_integrity_verified"],
                "created_at": r["created_at"].isoformat(),
                "updated_at": r["updated_at"].isoformat(),
            })

        return {
            "total": total_count,
            "count": len(prospects_list),
            "prospects": prospects_list
        }


@router.get("/trial-slots", summary="Ringkasan Status 36 Slot Trial Real-Time")
async def get_trial_slots_overview(
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Membaca status real-time 36 slot trial dan statistik alokasi dari platform_settings."""
    engine = get_database_engine()
    return TrialSlotAllocationService.get_slots_status(engine=engine)


@router.patch("/prospects/{prospect_id}/select-trial", summary="Alokasi Atomik Slot Trial untuk Prospek")
async def allocate_prospect_slot(
    prospect_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengamankan slot trial secara atomik (SELECT FOR UPDATE SKIP LOCKED) untuk prospek tertentu."""
    engine = get_database_engine()
    try:
        res = TrialSlotAllocationService.allocate_slot_atomically(prospect_id=prospect_id, engine=engine)
        return {
            "status": "success",
            "message": f"Slot #{res['slot_number']} berhasil dialokasikan.",
            "allocation": res
        }
    except SlotCapacityExhaustedError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ProspectNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Gagal mengalokasikan slot: {str(exc)}")


@router.patch("/prospects/{prospect_id}/schedule-meeting", summary="Jadwalkan Pertemuan Solusi Enterprise")
async def schedule_prospect_meeting(
    req: ScheduleMeetingRequest,
    prospect_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Menyimpan jadwal meeting eksekutif untuk prospek."""
    engine = get_database_engine()
    now_dt = datetime.now(timezone.utc)
    try:
        meeting_dt = datetime.fromisoformat(req.meeting_date.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Format ISO 8601 meeting_date tidak valid.")

    with engine.connect() as conn:
        with conn.begin():
            row = conn.execute(
                sa.text("SELECT id FROM prospects WHERE id = :id FOR UPDATE"),
                {"id": prospect_id}
            ).first()
            if not row:
                raise HTTPException(status_code=404, detail="Prospek tidak ditemukan.")

            conn.execute(
                sa.text("""
                    UPDATE prospects
                    SET meeting_status = 'SCHEDULED',
                        scheduled_meeting_date = :mdate,
                        scheduled_meeting_link = :mlink,
                        scheduled_meeting_notes = :mnotes,
                        updated_at = :now
                    WHERE id = :id;
                """),
                {
                    "id": prospect_id,
                    "mdate": meeting_dt,
                    "mlink": req.meeting_link,
                    "mnotes": req.notes,
                    "now": now_dt
                }
            )

    return {
        "status": "success",
        "message": "Jadwal meeting berhasil diperbarui.",
        "meeting_date": meeting_dt.isoformat(),
        "meeting_link": req.meeting_link
    }


@router.post("/prospects/{prospect_id}/activate-trial", summary="Aktivasi Tenant Uji Coba Resmi")
async def activate_prospect_trial(
    req: ActivateTrialRequest,
    prospect_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Mengaktifkan masa trial resmi dan mendepositkan 1,000 credit kerja awal ke tenant."""
    engine = get_database_engine()
    try:
        res = TrialSlotAllocationService.activate_trial(
            prospect_id=prospect_id,
            tenant_id=req.tenant_id,
            activated_by=ctx.user_id,
            notes=req.notes,
            engine=engine
        )
        return {
            "status": "success",
            "message": "Tenant uji coba berhasil diaktifkan dengan 1,000 credit kerja.",
            "activation": res
        }
    except TrialAllocationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengaktifkan uji coba: {str(e)}")


@router.delete("/prospects/{prospect_id}", summary="Hapus atau Tolak Prospek")
async def delete_prospect(
    prospect_id: str = Path(...),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Menghapus data prospek dan membebaskan slot trial jika sebelumnya terisi."""
    engine = get_database_engine()
    now_dt = datetime.now(timezone.utc)
    with engine.connect() as conn:
        with conn.begin():
            # Bebaskan slot trial
            conn.execute(
                sa.text("""
                    UPDATE trial_slots
                    SET status = 'AVAILABLE',
                        prospect_id = NULL,
                        reserved_at = NULL,
                        allocated_at = NULL,
                        expires_at = NULL,
                        updated_at = :now
                    WHERE prospect_id = :prospect_id;
                """),
                {"prospect_id": prospect_id, "now": now_dt}
            )

            res = conn.execute(
                sa.text("DELETE FROM prospects WHERE id = :id;"),
                {"id": prospect_id}
            )
            if res.rowcount == 0:
                raise HTTPException(status_code=404, detail="Prospek tidak ditemukan.")

    return {"status": "success", "message": "Prospek berhasil dihapus dan slot telah dibebaskan."}


@router.get("/web-integrity-logs", summary="Log Audit Web Integrity Cloudflare Turnstile")
async def list_web_integrity_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None, alias="status"),
    ctx: AuthenticatedTenantContext = Depends(get_current_tenant_context)
):
    """Menampilkan log verifikasi bot integritas untuk audit keamanan."""
    engine = get_database_engine()
    with engine.connect() as conn:
        q = "SELECT id, endpoint, ip_address, turnstile_token, status, error_code, hostname, metadata, created_at FROM web_integrity_logs WHERE 1=1"
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if status_filter:
            q += " AND status = :status_filter"
            params["status_filter"] = status_filter
        q += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset;"

        rows = conn.execute(sa.text(q), params).mappings().all()

        return [
            {
                "id": str(r["id"]),
                "endpoint": r["endpoint"],
                "ip_address": r["ip_address"],
                "status": r["status"],
                "error_code": r["error_code"],
                "hostname": r["hostname"],
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ]
