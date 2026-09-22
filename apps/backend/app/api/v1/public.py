"""
Public API Endpoints (Read-Only & Registration)
"""

from typing import List, Optional
from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, status, HTTPException
from pydantic import BaseModel, Field, EmailStr
import sqlalchemy as sa
from app.core.database import get_database_engine

router = APIRouter(prefix="/public", tags=["Public"])


class SubscriptionPlanResponse(BaseModel):
    id: str
    plan_code: str
    tier_level: int
    display_name: str
    price_monthly: float
    currency: str


class ProspectRegistrationRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    work_email: EmailStr
    phone_number: Optional[str] = None
    company_name: str = Field(..., min_length=2, max_length=150)
    company_scale: Optional[str] = None
    interest_type: str = Field(..., description="direct_trial_or_subscription / demo_request / enterprise_discussion")
    notes: Optional[str] = None


class ProspectRegistrationResponse(BaseModel):
    id: str
    status: str
    message: str
    created_at: str


@router.get(
    "/subscription-plans",
    response_model=List[SubscriptionPlanResponse],
    summary="Daftar Paket Langganan Publik"
)
async def list_public_subscription_plans():
    """
    Mengembalikan daftar paket langganan aktif langsung dari tabel subscription_plans.
    Read-only tanpa memerlukan otentikasi.
    """
    engine = get_database_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.text("""
                SELECT id, plan_code, tier_level, display_name, price_monthly, currency
                FROM subscription_plans
                ORDER BY tier_level ASC, price_monthly ASC;
            """)
        ).mappings().all()

        return [
            SubscriptionPlanResponse(
                id=str(r["id"]),
                plan_code=r["plan_code"],
                tier_level=int(r["tier_level"]),
                display_name=r["display_name"],
                price_monthly=float(r["price_monthly"]),
                currency=r["currency"],
            )
            for r in rows
        ]


@router.post(
    "/prospects",
    response_model=ProspectRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Pendaftaran Prospek & Permintaan Demo"
)
async def register_prospect(req: ProspectRegistrationRequest):
    """
    Mencatat pengajuan prospek atau permintaan demonstrasi organisasi ke basis data.
    """
    engine = get_database_engine()
    now_dt = datetime.now(timezone.utc)
    new_id = str(uuid.uuid4())

    with engine.connect() as conn:
        with conn.begin():
            conn.execute(
                sa.text("""
                    INSERT INTO prospects (
                        id, full_name, work_email, phone_number,
                        company_name, company_scale, interest_type, notes, created_at
                    ) VALUES (
                        :id, :full_name, :work_email, :phone_number,
                        :company_name, :company_scale, :interest_type, :notes, :created_at
                    );
                """),
                {
                    "id": new_id,
                    "full_name": req.full_name.strip(),
                    "work_email": req.work_email.strip(),
                    "phone_number": req.phone_number.strip() if req.phone_number else None,
                    "company_name": req.company_name.strip(),
                    "company_scale": req.company_scale.strip() if req.company_scale else None,
                    "interest_type": req.interest_type.strip(),
                    "notes": req.notes.strip() if req.notes else None,
                    "created_at": now_dt,
                }
            )

    return ProspectRegistrationResponse(
        id=new_id,
        status="received",
        message="Permintaan berhasil tercatat. Tim solusi enterprise akan menghubungi Anda melalui email.",
        created_at=now_dt.isoformat()
    )
