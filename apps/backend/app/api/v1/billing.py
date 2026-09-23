"""
OrchestreeAI Billing & Credit Management Endpoints (PRD v2.2 Bagian 14)
Endpoints:
- GET /api/v1/billing/wallet
- GET /api/v1/billing/transactions
- GET /api/v1/billing/invoices
- POST /api/v1/billing/topup
- POST /api/v1/billing/sandbox-settle (Testing & sandbox validation)
- GET /api/v1/billing/admin/command-center (Super Admin Financial Command Center)
"""

import uuid
import json
import logging
from decimal import Decimal
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, Header, Query
from pydantic import BaseModel, Field
import httpx
import sqlalchemy as sa

from app.core.config import settings
from app.core.database import get_engine
from app.authz.pdp import authorize, SubjectContext, ResourceContext, require_capability
from app.domains.billing.credits import (
    get_wallet,
    get_transactions,
    get_invoices,
    topup_credit,
    TenantWallet,
)

logger = logging.getLogger("orchestree.api.billing")

router = APIRouter(prefix="/api/v1/billing", tags=["Billing & Credit Wallet"])


class TopUpRequest(BaseModel):
    tenant_id: Optional[str] = Field(None, description="ID Organisasi/Tenant")
    amount: Decimal = Field(..., gt=0, description="Nominal top up dalam mata uang IDR")
    payment_gateway: str = Field("midtrans", description="Pilihan gateway: midtrans atau xendit")
    package_name: Optional[str] = Field("Top Up Kredit Standar", description="Nama paket kredit")


class TopUpResponse(BaseModel):
    invoice_id: str
    invoice_number: str
    amount: float
    currency: str
    status: str
    payment_gateway: str
    payment_url: str
    client_key: Optional[str] = None


class SimulatePaymentRequest(BaseModel):
    invoice_number: str = Field(..., description="Nomor faktur yang disimulasikan lunas")
    payment_reference: Optional[str] = Field(None, description="ID referensi transaksi gateway")


@router.get("/wallet", response_model=TenantWallet)
async def get_tenant_wallet(
    tenant_id: Optional[str] = Query(None),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("billing.credits.view", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """Mengambil status saldo kredit organisasi saat ini."""
    effective_tenant = tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    roles = [r.strip() for r in (x_user_roles or "TENANT_ADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "billing.credits.view").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    # Evaluasi otorisasi PDP
    subject = SubjectContext(
        user_id=x_user_id,
        tenant_id=effective_tenant,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
        actor_type="user",
    )
    resource = ResourceContext(
        resource_type="billing_wallet",
        resource_id=effective_tenant,
        owner_tenant_id=effective_tenant,
    )
    decision = authorize(
        subject=subject,
        action="billing.credits.view",
        resource=resource,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")

    wallet = await get_wallet(effective_tenant)
    return wallet


@router.get("/transactions")
async def get_wallet_transactions(
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("billing.credits.view", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """Mengambil riwayat mutasi kredit (reservasi, konsumsi, refund, top up)."""
    effective_tenant = tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    roles = [r.strip() for r in (x_user_roles or "TENANT_ADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "billing.credits.view").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        user_id=x_user_id,
        tenant_id=effective_tenant,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
        actor_type="user",
    )
    resource = ResourceContext(
        resource_type="billing_transactions",
        resource_id=effective_tenant,
        owner_tenant_id=effective_tenant,
    )
    decision = authorize(
        subject=subject,
        action="billing.credits.view",
        resource=resource,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")

    return await get_transactions(effective_tenant, limit=limit)


@router.get("/invoices")
async def get_tenant_invoices(
    tenant_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("billing.invoices.view", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """Mengambil riwayat faktur tagihan resmi organisasi."""
    effective_tenant = tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    roles = [r.strip() for r in (x_user_roles or "TENANT_ADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "billing.invoices.view").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        user_id=x_user_id,
        tenant_id=effective_tenant,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
        actor_type="user",
    )
    resource = ResourceContext(
        resource_type="invoices",
        resource_id=effective_tenant,
        owner_tenant_id=effective_tenant,
    )
    decision = authorize(
        subject=subject,
        action="billing.invoices.view",
        resource=resource,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")

    return await get_invoices(effective_tenant, limit=limit)


@router.post("/topup", response_model=TopUpResponse)
async def initiate_topup(
    payload: TopUpRequest,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("billing.credits.manage", alias="X-User-Capabilities"),
    x_mfa_verified: Optional[str] = Header("false", alias="X-MFA-Verified"),
):
    """
    Membuat pesanan top-up kredit, menerbitkan invoice di database,
    dan menghasilkan tautan pembayaran resmi dari payment gateway terpilih.
    """
    effective_tenant = payload.tenant_id or x_tenant_id
    if not effective_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")

    roles = [r.strip() for r in (x_user_roles or "TENANT_ADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "billing.credits.manage").split(",") if c.strip()]
    is_mfa = (x_mfa_verified or "false").lower() in ("true", "1")

    subject = SubjectContext(
        user_id=x_user_id,
        tenant_id=effective_tenant,
        roles=roles,
        capabilities=capabilities,
        is_mfa_verified=is_mfa,
        actor_type="user",
    )
    resource = ResourceContext(
        resource_type="billing_topup",
        resource_id=effective_tenant,
        owner_tenant_id=effective_tenant,
    )
    decision = authorize(
        subject=subject,
        action="billing.credits.manage",
        resource=resource,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")

    # Generate invoice & order number
    invoice_id = str(uuid.uuid4())
    short_uuid = uuid.uuid4().hex[:6].upper()
    order_id = f"INV-{short_uuid}-{int(payload.amount)}"

    # Inisialisasi payment URL default sandbox
    payment_url = f"https://simulator.sandbox.midtrans.com/snap/v2/vtweb/{order_id}"
    gateway = payload.payment_gateway.lower()

    if gateway == "midtrans" and settings.MIDTRANS_SERVER_KEY:
        try:
            # Mencoba membuat transaksi Snap via Midtrans API
            import base64
            auth_str = base64.b64encode(f"{settings.MIDTRANS_SERVER_KEY}:".encode()).decode()
            snap_endpoint = "https://app.sandbox.midtrans.com/snap/v1/transactions"
            if settings.MIDTRANS_IS_PRODUCTION:
                snap_endpoint = "https://app.midtrans.com/snap/v1/transactions"

            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    snap_endpoint,
                    headers={
                        "Authorization": f"Basic {auth_str}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json={
                        "transaction_details": {
                            "order_id": order_id,
                            "gross_amount": int(payload.amount),
                        },
                        "item_details": [
                            {
                                "id": "credit-topup",
                                "price": int(payload.amount),
                                "quantity": 1,
                                "name": payload.package_name,
                            }
                        ],
                    },
                )
                if res.status_code in (200, 201):
                    snap_data = res.json()
                    payment_url = snap_data.get("redirect_url", payment_url)
        except Exception as e:
            logger.warning(f"Gagal memanggil Midtrans Snap API, menggunakan fallback simulator: {e}")

    # Simpan invoice ke database
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :val, true);"),
            {"val": effective_tenant},
        )
        await conn.execute(sa.text("""
            INSERT INTO invoices (
                id, tenant_id, invoice_number, amount, currency, status,
                payment_gateway, payment_reference, payment_url, items
            ) VALUES (
                :id, :tenant_id, :invoice_number, :amount, 'IDR', 'pending',
                :gateway, :order_id, :payment_url, :items
            );
        """), {
            "id": invoice_id,
            "tenant_id": effective_tenant,
            "invoice_number": order_id,
            "amount": payload.amount,
            "gateway": gateway,
            "order_id": order_id,
            "payment_url": payment_url,
            "items": json.dumps([{
                "name": payload.package_name,
                "amount": float(payload.amount),
                "qty": 1,
            }]),
        })

    return TopUpResponse(
        invoice_id=invoice_id,
        invoice_number=order_id,
        amount=float(payload.amount),
        currency="IDR",
        status="pending",
        payment_gateway=gateway,
        payment_url=payment_url,
        client_key=settings.MIDTRANS_CLIENT_KEY,
    )


@router.post("/sandbox-settle", dependencies=[Depends(require_capability("billing.invoices.manage"))])
async def sandbox_settle_payment(
    payload: SimulatePaymentRequest,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
    x_user_roles: Optional[str] = Header("TENANT_ADMIN", alias="X-User-Roles"),
):
    """
    Pelunasan faktur langsung untuk keperluan verifikasi pengujian & sandbox environment.
    Memproses rekonsiliasi dan top-up saldo wallet persis seperti webhook gateway resmi.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("""
            SELECT id, tenant_id, amount, status
            FROM invoices
            WHERE invoice_number = :inv
            FOR UPDATE;
        """), {"inv": payload.invoice_number})
        inv_row = res.fetchone()

        if not inv_row:
            raise HTTPException(status_code=404, detail="Invoice tidak ditemukan.")

        inv_id, tenant_id, amount, status = inv_row
        tenant_id = str(tenant_id)
        amount = Decimal(str(amount))

        if status == "paid":
            return {"status": "already_paid", "message": "Faktur ini sudah lunas sebelumnya."}

        # Update invoice
        await conn.execute(sa.text("""
            UPDATE invoices
            SET status = 'paid',
                paid_at = now(),
                payment_reference = :ref,
                updated_at = now()
            WHERE id = :id;
        """), {
            "id": inv_id,
            "ref": payload.payment_reference or f"sim-{uuid.uuid4().hex[:8]}",
        })

    # Tambahkan saldo kredit ke wallet tenant
    tx = await topup_credit(
        tenant_id=tenant_id,
        amount=amount,
        reference_id=payload.invoice_number,
        description=f"Pelunasan faktur {payload.invoice_number}",
        metadata={"simulation": True},
    )

    # Catat log rekonsiliasi pembayaran
    async with engine.begin() as conn:
        await conn.execute(sa.text("""
            INSERT INTO payment_reconciliation_log (
                id, tenant_id, invoice_id, payment_gateway, event_type,
                raw_payload, signature_verified, status
            ) VALUES (
                :id, :tenant_id, :invoice_id, 'simulator', 'payment.settled',
                :raw_payload, true, 'settled'
            );
        """), {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "invoice_id": inv_id,
            "raw_payload": json.dumps({"invoice_number": payload.invoice_number, "amount": float(amount)}),
        })

    return {
        "status": "success",
        "message": f"Faktur {payload.invoice_number} berhasil dilunasi. Saldo bertambah {amount:,.2f} IDR.",
        "transaction_id": tx.id,
        "new_balance": float(tx.balance_after),
    }


@router.get("/admin/command-center")
async def get_financial_command_center(
    x_user_roles: Optional[str] = Header("PLATFORM_SUPERADMIN", alias="X-User-Roles"),
    x_user_capabilities: Optional[str] = Header("admin.financial.view", alias="X-User-Capabilities"),
):
    """
    Pusat Kendali Finansial Super Admin (PRD v2.2 Bagian 14 & 18.2).
    Menampilkan agregasi finansial lintas organisasi:
    - Total saldo beredar
    - Total saldo direservasi
    - Total pendapatan terkumpul (faktur lunas)
    - Riwayat log rekonsiliasi gateway pembayaran
    - Ringkasan wallet organisasi
    """
    roles = [r.strip() for r in (x_user_roles or "PLATFORM_SUPERADMIN").split(",") if r.strip()]
    capabilities = [c.strip() for c in (x_user_capabilities or "admin.financial.view").split(",") if c.strip()]

    subject = SubjectContext(
        roles=roles,
        capabilities=capabilities,
        actor_type="user",
    )
    resource = ResourceContext(
        resource_type="financial_command_center",
        resource_id="global",
    )
    decision = authorize(
        subject=subject,
        action="admin.financial.view",
        resource=resource,
    )
    if not decision.is_authorized:
        raise HTTPException(status_code=403, detail=f"Akses ditolak: {decision.reason}")

    engine = get_engine()
    async with engine.begin() as conn:
        # Agregasi wallet
        wallet_agg = await conn.execute(sa.text("""
            SELECT
                count(*) as total_tenants,
                coalesce(sum(balance), 0) as total_circulating_balance,
                coalesce(sum(reserved_balance), 0) as total_reserved_balance
            FROM tenant_credit_wallet;
        """))
        w_row = wallet_agg.fetchone()

        # Agregasi invoice lunas
        rev_agg = await conn.execute(sa.text("""
            SELECT
                count(*) as total_invoices,
                coalesce(sum(amount), 0) as total_revenue
            FROM invoices
            WHERE status = 'paid';
        """))
        r_row = rev_agg.fetchone()

        # List wallet tenant
        wallets_res = await conn.execute(sa.text("""
            SELECT w.id, w.tenant_id, t.name as tenant_name, w.balance, w.reserved_balance,
                   (w.balance - w.reserved_balance) as available_balance, w.currency, w.updated_at
            FROM tenant_credit_wallet w
            LEFT JOIN tenants t ON t.id = w.tenant_id
            ORDER BY w.balance DESC
            LIMIT 50;
        """))
        wallet_rows = wallets_res.fetchall()

        # Riwayat rekonsiliasi gateway terbaru
        recon_res = await conn.execute(sa.text("""
            SELECT id, tenant_id, invoice_id, payment_gateway, event_type, signature_verified, status, created_at
            FROM payment_reconciliation_log
            ORDER BY created_at DESC
            LIMIT 30;
        """))
        recon_rows = recon_res.fetchall()

    return {
        "summary": {
            "total_tenants": int(w_row[0]),
            "total_circulating_balance": float(w_row[1]),
            "total_reserved_balance": float(w_row[2]),
            "total_available_balance": float(w_row[1] - w_row[2]),
            "total_paid_invoices": int(r_row[0]),
            "total_revenue_collected": float(r_row[1]),
            "currency": "IDR",
        },
        "tenant_wallets": [
            {
                "id": str(r[0]),
                "tenant_id": str(r[1]),
                "tenant_name": r[2] or f"Organisasi {str(r[1])[:8]}",
                "balance": float(r[3]),
                "reserved_balance": float(r[4]),
                "available_balance": float(r[5]),
                "currency": r[6],
                "updated_at": r[7].isoformat() if r[7] else None,
            }
            for r in wallet_rows
        ],
        "recent_reconciliations": [
            {
                "id": str(r[0]),
                "tenant_id": str(r[1]) if r[1] else None,
                "invoice_id": str(r[2]) if r[2] else None,
                "payment_gateway": r[3],
                "event_type": r[4],
                "signature_verified": bool(r[5]),
                "status": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
            }
            for r in recon_rows
        ],
    }
