"""
OrchestreeAI AI Data Permissions API Router (PRD v2.2 Bagian 3.3, 3.5, 14.2 & 16.1)
Python 3.12 + FastAPI + Pydantic v2
Mengelola Matriks Izin Akses Data Agen AI & Persona terhadap Sistem Korporat.
Zero-Trust Default: DENIED_NO_POLICY bila tidak ada baris kebijakan eksplisit.
Setiap perubahan tercatat ke audit_logs (Audit Ledger).
"""

from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import uuid
import datetime

from app.core.database import get_db_connection
from app.authz.abac import (
    ABACDecision,
    ABACResource,
    ABACSubject,
    check_ai_data_permission,
)
from app.authz.pdp import require_capability

router = APIRouter(
    prefix="/api/v1/tenants/{tenant_id}/permissions",
    tags=["permissions"],
    dependencies=[Depends(require_capability("abac.policies.manage"))]
)


class MatrixCellUpdateInput(BaseModel):
    agent_persona_type: str
    connector_code: str
    access_level: str = Field(..., pattern="^(NONE|READ_ONLY|READ_WRITE|ADMIN)$")
    data_classification: Optional[str] = "internal"
    user_role: Optional[str] = "TENANT_ADMIN"
    user_id: Optional[str] = None


class EvaluateTestInput(BaseModel):
    agent_persona_type: str
    connector_code: str
    action: Optional[str] = "data.read"
    data_classification: Optional[str] = "internal"
    resource_type: Optional[str] = "enterprise_system"


STANDARD_PERSONAS = [
    {
        "persona_type": "hr_agent",
        "display_name": "AI HR Agent",
        "role_title": "Spesialis SDM & Kesejahteraan Karyawan",
        "description": "Menangani proses rekrutmen, absensi, survei kepuasan, dan manajemen talenta.",
        "icon": "users",
        "department": "Human Resources"
    },
    {
        "persona_type": "cfo_agent",
        "display_name": "AI CFO & Financial Analyst",
        "role_title": "Spesialis Keuangan & Anggaran",
        "description": "Analisis arus kas, rekonsiliasi faktur, peramalan beban, dan pemantauan burn rate.",
        "icon": "coins",
        "department": "Finance"
    },
    {
        "persona_type": "sales_agent",
        "display_name": "AI Sales Representative",
        "role_title": "Spesialis Penjualan & Pipeline",
        "description": "Kualifikasi prospek, negosiasi kuotasi, tindak lanjut CRM, dan guardrail diskon.",
        "icon": "briefcase",
        "department": "Commercial"
    },
    {
        "persona_type": "marketing_agent",
        "display_name": "AI Marketing Strategist",
        "role_title": "Spesialis Pemasaran & Konten",
        "description": "Eksperimen pesan, kalender konten media sosial, dan atribusi konversi multi-channel.",
        "icon": "sparkles",
        "department": "Marketing"
    },
    {
        "persona_type": "support_agent",
        "display_name": "AI Customer Support Specialist",
        "role_title": "Spesialis Layanan & Kepuasan Pelanggan",
        "description": "Penyelesaian tiket omni-channel, panduan produk, dan eskalasi keluhan pelanggan.",
        "icon": "headset",
        "department": "Customer Experience"
    },
    {
        "persona_type": "researcher_agent",
        "display_name": "AI Market Researcher",
        "role_title": "Peneliti Pasar & Radar Kompetitor",
        "description": "Pemantauan intelijen pesaing, ekstraksi tren harga web, dan analisis diferensiasi.",
        "icon": "search",
        "department": "Corporate Strategy"
    },
    {
        "persona_type": "ops_agent",
        "display_name": "AI Operations Coordinator",
        "role_title": "Spesialis Logistik & Rantai Pasok",
        "description": "Sinkronisasi pesanan multi-kurir, pemantauan status gudang, dan eskalasi anomali.",
        "icon": "truck",
        "department": "Operations"
    },
    {
        "persona_type": "chief_of_staff",
        "display_name": "AI Chief of Staff (Arya)",
        "role_title": "Kepala Staf & Pengawas Eksekutif",
        "description": "Morning briefing eksekutif, koordinasi lintas agen otonom, dan sintesis keputusan strategis.",
        "icon": "shield-check",
        "department": "Executive Office"
    }
]

STANDARD_CONNECTORS = [
    {
        "connector_code": "ERP.CorporateBanking",
        "connector_name": "ERP Corporate Banking Gateway",
        "connector_type": "ERP",
        "data_classification": "restricted",
        "description": "Rekening giro korporat, mutasi bank otomatis, dan settlement keuangan."
    },
    {
        "connector_code": "ERP.SAP_FINANCE",
        "connector_name": "SAP S/4HANA Finance Stream",
        "connector_type": "ERP_SAP_ORACLE",
        "data_classification": "confidential",
        "description": "Buku besar umum (GL), jurnal akuntansi, dan faktur hutang-piutang."
    },
    {
        "connector_code": "CRM.Salesforce",
        "connector_name": "Salesforce Enterprise CRM",
        "connector_type": "CRM",
        "data_classification": "internal",
        "description": "Data kontak prospek bisnis, riwayat kesepakatan, dan peluang penjualan."
    },
    {
        "connector_code": "HRIS.Workday",
        "connector_name": "Workday HCM & Payroll",
        "connector_type": "HRIS",
        "data_classification": "restricted",
        "description": "Data PII personalia karyawan, histori kompensasi, dan struktur organisasi."
    },
    {
        "connector_code": "WMS.Logistics",
        "connector_name": "Warehouse & Logistics Stream",
        "connector_type": "CMMS",
        "data_classification": "internal",
        "description": "Stok gudang real-time, jadwal pengiriman kontainer, dan pelacakan kurir."
    },
    {
        "connector_code": "PAYMENT.CoreGateway",
        "connector_name": "Core Payment Settlement Gateway",
        "connector_type": "WEBHOOK_BROKER",
        "data_classification": "confidential",
        "description": "Notifikasi pembayaran Midtrans/Xendit, saldo e-wallet, dan status penagihan."
    }
]


@router.get("/matrix")
async def get_permission_matrix(tenant_id: str, request: Request):
    """
    Mengambil data matriks izin data:
    - Baris: AI Agent Personas
    - Kolom: Enterprise System Connections
    - Sel: access_level ('NONE', 'READ_ONLY', 'READ_WRITE', 'ADMIN')
    """
    async with get_db_connection() as db:
        # 1. Ambil daftar konektor dari integration_fabric_connectors jika ada
        connector_rows = await db.fetch(
            """
            SELECT connector_code, connector_name, connector_type, status, config
            FROM integration_fabric_connectors
            WHERE tenant_id = $1
            ORDER BY created_at ASC;
            """,
            uuid.UUID(tenant_id)
        )

        connectors = list(STANDARD_CONNECTORS)
        seen_codes = {c["connector_code"] for c in connectors}

        for row in connector_rows:
            code = row["connector_code"]
            if code not in seen_codes:
                connectors.append({
                    "connector_code": code,
                    "connector_name": row["connector_name"],
                    "connector_type": row["connector_type"],
                    "data_classification": "confidential",
                    "description": f"Konektor kustom tenant: {row['connector_name']} ({row['status']})",
                    "status": row["status"]
                })
                seen_codes.add(code)

        # 2. Ambil seluruh kebijakan izin aktif dari ai_data_permission_policies
        policy_rows = await db.fetch(
            """
            SELECT id, tenant_id, agent_persona_type, resource_type, resource_identifier,
                   action, data_classification, conditions, effect, priority, access_level,
                   created_at, updated_at
            FROM ai_data_permission_policies
            WHERE tenant_id = $1;
            """,
            uuid.UUID(tenant_id)
        )

        # 3. Bentuk peta matriks sel
        matrix: Dict[str, Dict[str, Any]] = {}
        for pol in policy_rows:
            persona = pol["agent_persona_type"] or "*"
            res_id = pol["resource_identifier"]
            if persona not in matrix:
                matrix[persona] = {}
            matrix[persona][res_id] = {
                "policy_id": str(pol["id"]),
                "access_level": pol["access_level"] or "READ_ONLY",
                "effect": pol["effect"],
                "action": pol["action"],
                "data_classification": pol["data_classification"],
                "priority": pol["priority"],
                "updated_at": pol["updated_at"].isoformat() if pol["updated_at"] else None
            }

        return {
            "tenant_id": tenant_id,
            "personas": STANDARD_PERSONAS,
            "connectors": connectors,
            "matrix": matrix,
            "total_configured_policies": len(policy_rows)
        }


@router.put("/matrix/cell")
async def update_permission_cell(tenant_id: str, payload: MatrixCellUpdateInput):
    """
    Mengubah atau menghapus kebijakan izin per sel (persona x konektor).
    HANYA TENANT_OWNER dan TENANT_ADMIN yang diizinkan.
    Setiap perubahan dicatat ke Audit Ledger (audit_logs).
    """
    role = (payload.user_role or "").upper()
    if role not in ["TENANT_OWNER", "TENANT_ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya Pemilik Organisasi (TENANT_OWNER) atau Administrator (TENANT_ADMIN) yang diizinkan memodifikasi matriks izin data."
        )

    t_uuid = uuid.UUID(tenant_id)
    persona = payload.agent_persona_type
    conn_code = payload.connector_code
    new_level = payload.access_level

    async with get_db_connection() as db:
        async with db.transaction():
            # Cari kebijakan yang ada saat ini
            existing = await db.fetchrow(
                """
                SELECT id, access_level, effect, data_classification
                FROM ai_data_permission_policies
                WHERE tenant_id = $1 AND agent_persona_type = $2 AND resource_identifier = $3
                LIMIT 1;
                """,
                t_uuid, persona, conn_code
            )

            prev_level = existing["access_level"] if existing else "NONE"

            if new_level == "NONE":
                # Hapus kebijakan agar berstatus fail-closed Zero-Trust (DENIED_NO_POLICY)
                if existing:
                    await db.execute(
                        "DELETE FROM ai_data_permission_policies WHERE id = $1;",
                        existing["id"]
                    )
                policy_id = None
                action_logged = "ai_data_permission.revoked"
            else:
                action_str = "data.read" if new_level == "READ_ONLY" else "*"
                priority_val = 200 if new_level == "ADMIN" else 100
                conn_meta = next((c for c in STANDARD_CONNECTORS if c["connector_code"] == conn_code), None)
                default_class = conn_meta["data_classification"] if conn_meta else "internal"
                class_val = payload.data_classification or default_class

                if existing:
                    updated = await db.fetchrow(
                        """
                        UPDATE ai_data_permission_policies
                        SET access_level = $1,
                            effect = 'ALLOW',
                            action = $2,
                            data_classification = $3,
                            priority = $4,
                            conditions = jsonb_build_object('access_level', $1::text),
                            updated_at = NOW()
                        WHERE id = $5
                        RETURNING id;
                        """,
                        new_level, action_str, class_val, priority_val, existing["id"]
                    )
                    policy_id = str(updated["id"])
                    action_logged = "ai_data_permission.updated"
                else:
                    inserted = await db.fetchrow(
                        """
                        INSERT INTO ai_data_permission_policies (
                            id, tenant_id, agent_persona_type, resource_type,
                            resource_identifier, action, data_classification,
                            conditions, effect, priority, access_level,
                            created_at, updated_at
                        ) VALUES (
                            gen_random_uuid(), $1, $2, 'enterprise_system',
                            $3, $4, $5,
                            jsonb_build_object('access_level', $6::text), 'ALLOW', $7, $6,
                            NOW(), NOW()
                        ) RETURNING id;
                        """,
                        t_uuid, persona, conn_code, action_str, class_val,
                        new_level, priority_val
                    )
                    policy_id = str(inserted["id"])
                    action_logged = "ai_data_permission.created"

            # CATAT KE AUDIT LEDGER (audit_logs)
            user_uuid = None
            if payload.user_id:
                try:
                    user_uuid = uuid.UUID(payload.user_id)
                except Exception:
                    user_uuid = None

            await db.execute(
                """
                INSERT INTO audit_logs (
                    tenant_id, actor_type, actor_id, action,
                    resource_type, resource_id, payload_after, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, NOW()
                );
                """,
                t_uuid,
                "human_user",
                user_uuid,
                action_logged,
                "ai_data_permission_policy",
                conn_code,
                {
                    "agent_persona_type": persona,
                    "connector_code": conn_code,
                    "previous_access_level": prev_level,
                    "new_access_level": new_level,
                    "policy_id": policy_id,
                    "modified_by_role": role,
                    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
            )

            return {
                "success": True,
                "tenant_id": tenant_id,
                "agent_persona_type": persona,
                "connector_code": conn_code,
                "previous_access_level": prev_level,
                "access_level": new_level,
                "policy_id": policy_id,
                "audit_recorded": True
            }


@router.post("/evaluate-test")
async def evaluate_access_test(tenant_id: str, payload: EvaluateTestInput):
    """
    Evaluasi uji otorisasi PDP langsung terhadap sumber data perusahaan.
    Skenario Acceptance Criteria PRD v2.2:
    AI HR Agent mencoba akses ERP.CorporateBanking tanpa policy -> Wajib DENIED_NO_POLICY tercatat di audit_logs.
    """
    subject = ABACSubject(
        tenant_id=tenant_id,
        agent_persona_type=payload.agent_persona_type,
        actor_type="ai_agent",
        roles=["AI_AGENT"]
    )

    resource = ABACResource(
        resource_type=payload.resource_type or "enterprise_system",
        resource_identifier=payload.connector_code,
        data_classification=payload.data_classification or "restricted",
        owner_tenant_id=tenant_id
    )

    req_id = f"test-eval-{uuid.uuid4()}"
    decision = check_ai_data_permission(
        subject=subject,
        action=payload.action or "data.read",
        resource=resource,
        context={"request_id": req_id},
        log_audit=True
    )

    return {
        "tenant_id": tenant_id,
        "agent_persona_type": payload.agent_persona_type,
        "connector_code": payload.connector_code,
        "is_authorized": decision.is_authorized,
        "decision": decision.decision,
        "reason": decision.reason,
        "policy_id": decision.policy_id,
        "data_classification": decision.data_classification,
        "request_id": req_id
    }


@router.get("/audit-logs")
async def get_permission_audit_logs(tenant_id: str, limit: int = 50):
    """
    Mengambil riwayat Audit Ledger khusus peristiwa izin data & evaluasi PDP.
    """
    async with get_db_connection() as db:
        rows = await db.fetch(
            """
            SELECT id, tenant_id, actor_type, actor_id, action,
                   resource_type, resource_id, payload_after, created_at
            FROM audit_logs
            WHERE tenant_id = $1
              AND (action LIKE 'ai_data_permission%' OR action LIKE 'abac:%')
            ORDER BY created_at DESC
            LIMIT $2;
            """,
            uuid.UUID(tenant_id), limit
        )

        return {
            "tenant_id": tenant_id,
            "logs": [
                {
                    "id": str(r["id"]),
                    "actor_type": r["actor_type"],
                    "actor_id": str(r["actor_id"]) if r["actor_id"] else None,
                    "action": r["action"],
                    "resource_type": r["resource_type"],
                    "resource_id": r["resource_id"],
                    "payload": r["payload_after"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None
                }
                for r in rows
            ]
        }
