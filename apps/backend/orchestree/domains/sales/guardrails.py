"""Sales Guardrails Matrix & Human Approval Engine (PRD v2.2 Bagian 3.5, 4, 11.2, 12.7, 16.1)

Menyediakan:
1. Matriks Guardrail Sales:
   - Diskon > batas (default 10%)
   - Refund
   - Cancel Order
   - Kontrak Khusus
   Seluruhnya dipetakan ke risk_tier = 'high' dan otomatis berhenti di HUMAN_APPROVAL saat diajukan oleh AI Agent.
2. Pencatatan Audit Ledger komprehensif dengan:
   - actor_type = 'ai_agent'
   - persona_type = (persona AI pemohon, misal 'sales_specialist')
   - Status guardrail dan alasan eskalasi
3. Penegakan Real Data pada Supabase PostgreSQL dengan RLS.
"""

from decimal import Decimal
from enum import Enum
import json
import logging
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.core.database import get_database_engine

logger = logging.getLogger("orchestree.sales.guardrails")


class SalesGuardrailAction(str, Enum):
    DISCOUNT = "DISCOUNT"
    REFUND = "REFUND"
    CANCEL_ORDER = "CANCEL_ORDER"
    CUSTOM_CONTRACT = "CUSTOM_CONTRACT"


class GuardrailEvaluationResult(BaseModel):
    action_type: str
    risk_tier: str = "high"
    requires_human_approval: bool = True
    is_autonomous_allowed: bool = False
    reason: str
    rule_id: Optional[str] = None
    threshold_value: Optional[float] = None
    requested_value: Optional[float] = None


class SalesGuardrailService:
    """Layanan penegakan Matriks Guardrail Sales & Eskalasi Human-in-the-Loop."""

    @staticmethod
    def get_guardrail_rules(tenant_id: str) -> List[Dict[str, Any]]:
        """Mengambil seluruh aturan guardrail aktif untuk tenant dari Supabase Postgres."""
        engine = get_database_engine()
        with engine.connect() as conn:
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            result = conn.execute(
                sa.text("""
                    SELECT id, action_type, risk_tier, requires_human_approval,
                           max_autonomous_discount_pct, max_autonomous_amount,
                           is_active, description, updated_at
                    FROM sales_guardrail_rules
                    WHERE tenant_id = :tenant_id
                    ORDER BY action_type ASC;
                """),
                {"tenant_id": tenant_id}
            )
            rows = result.fetchall()
            return [
                {
                    "id": str(r.id),
                    "action_type": r.action_type,
                    "risk_tier": r.risk_tier,
                    "requires_human_approval": r.requires_human_approval,
                    "max_autonomous_discount_pct": float(r.max_autonomous_discount_pct),
                    "max_autonomous_amount": float(r.max_autonomous_amount),
                    "is_active": r.is_active,
                    "description": r.description,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
                for r in rows
            ]

    @staticmethod
    def evaluate_action(
        tenant_id: str,
        action_type: str,
        actor_type: str = "ai_agent",
        persona_type: str = "sales_specialist",
        payload: Optional[Dict[str, Any]] = None,
    ) -> GuardrailEvaluationResult:
        """
        Mengevaluasi apakah aksi penjualan melanggar batas otonomi AI dan wajib dihentikan ke HUMAN_APPROVAL.
        """
        payload = payload or {}
        action_upper = action_type.upper()

        engine = get_database_engine()
        with engine.connect() as conn:
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            res = conn.execute(
                sa.text("""
                    SELECT id, action_type, risk_tier, requires_human_approval,
                           max_autonomous_discount_pct, max_autonomous_amount, is_active
                    FROM sales_guardrail_rules
                    WHERE tenant_id = :tenant_id AND action_type = :action_type;
                """),
                {"tenant_id": tenant_id, "action_type": action_upper}
            ).fetchone()

        max_discount_pct = float(res.max_autonomous_discount_pct) if res else 10.00
        rule_id = str(res.id) if res else None

        # 1. Evaluasi Diskon
        if action_upper == SalesGuardrailAction.DISCOUNT.value:
            requested_discount = float(payload.get("discount_pct", 0.0))
            if requested_discount > max_discount_pct:
                return GuardrailEvaluationResult(
                    action_type=action_upper,
                    risk_tier="high",
                    requires_human_approval=True,
                    is_autonomous_allowed=False,
                    reason=(
                        f"Permintaan diskon {requested_discount:.1f}% oleh agen AI ({persona_type}) "
                        f"melebihi batas toleransi otonom maksimal ({max_discount_pct:.1f}%). "
                        "Aksi dihentikan seketika dan dialihkan ke persetujuan staf manusia (HUMAN_APPROVAL)."
                    ),
                    rule_id=rule_id,
                    threshold_value=max_discount_pct,
                    requested_value=requested_discount,
                )
            else:
                return GuardrailEvaluationResult(
                    action_type=action_upper,
                    risk_tier="low",
                    requires_human_approval=False,
                    is_autonomous_allowed=True,
                    reason=f"Diskon {requested_discount:.1f}% berada dalam batas otonom AI ({max_discount_pct:.1f}%).",
                    rule_id=rule_id,
                    threshold_value=max_discount_pct,
                    requested_value=requested_discount,
                )

        # 2. Evaluasi Refund (Wajib Persetujuan Manusia)
        elif action_upper == SalesGuardrailAction.REFUND.value:
            amount = float(payload.get("amount", 0.0))
            return GuardrailEvaluationResult(
                action_type=action_upper,
                risk_tier="high",
                requires_human_approval=True,
                is_autonomous_allowed=False,
                reason=(
                    f"Pengembalian dana (refund) sebesar Rp {amount:,.0f} oleh agen AI ({persona_type}) "
                    "termasuk kategori aksi berisiko tinggi (risk_tier='high'). "
                    "Wajib mendapatkan persetujuan staf manusia berwenang sebelum dana dicairkan."
                ),
                rule_id=rule_id,
                threshold_value=0.0,
                requested_value=amount,
            )

        # 3. Evaluasi Cancel Order (Wajib Persetujuan Manusia)
        elif action_upper == SalesGuardrailAction.CANCEL_ORDER.value:
            order_id = payload.get("order_id", "N/A")
            return GuardrailEvaluationResult(
                action_type=action_upper,
                risk_tier="high",
                requires_human_approval=True,
                is_autonomous_allowed=False,
                reason=(
                    f"Pembatalan pesanan #{order_id} oleh agen AI ({persona_type}) "
                    "termasuk kategori aksi berisiko tinggi (risk_tier='high'). "
                    "Wajib melalui verifikasi dan persetujuan staf manusia."
                ),
                rule_id=rule_id,
                threshold_value=0.0,
            )

        # 4. Evaluasi Kontrak Khusus (Wajib Persetujuan Manusia)
        elif action_upper == SalesGuardrailAction.CUSTOM_CONTRACT.value:
            customer_id = payload.get("customer_id", "N/A")
            return GuardrailEvaluationResult(
                action_type=action_upper,
                risk_tier="high",
                requires_human_approval=True,
                is_autonomous_allowed=False,
                reason=(
                    f"Pembuatan draf kontrak kesepakatan komersial non-standar untuk pelanggan #{customer_id} "
                    f"oleh agen AI ({persona_type}) mewajibkan persetujuan staf manusia (HUMAN_APPROVAL)."
                ),
                rule_id=rule_id,
                threshold_value=0.0,
            )

        # Aksi lain tidak dikenal
        return GuardrailEvaluationResult(
            action_type=action_upper,
            risk_tier="medium",
            requires_human_approval=True,
            is_autonomous_allowed=False,
            reason=f"Aksi penjualan '{action_type}' belum memiliki aturan guardrail definitif.",
        )

    @staticmethod
    def execute_or_escalate(
        tenant_id: str,
        action_type: str,
        actor_type: str = "ai_agent",
        actor_id: Optional[str] = None,
        persona_type: str = "sales_specialist",
        target_resource_type: str = "order",
        target_resource_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mengevaluasi guardrail dan menghentikan eksekusi AI ke antrean persetujuan jika berisiko.
        Mencatat audit ledger lengkap dengan actor_type='ai_agent' dan persona_type.
        """
        payload = payload or {}
        evaluation = SalesGuardrailService.evaluate_action(
            tenant_id=tenant_id,
            action_type=action_type,
            actor_type=actor_type,
            persona_type=persona_type,
            payload=payload,
        )

        engine = get_database_engine()

        # JIKA MEMERLUKAN PERSETUJUAN MANUSIA: EKSEKUSI DIHENTIKAN SEKETIKA
        if evaluation.requires_human_approval:
            approval_id = str(uuid.uuid4())
            with engine.connect() as conn:
                with conn.begin():
                    conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
                    conn.execute(
                        sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                        {"tenant_id": tenant_id}
                    )

                    # 1. Simpan tiket approval ke sales_guardrail_approvals
                    conn.execute(
                        sa.text("""
                            INSERT INTO sales_guardrail_approvals (
                                id, tenant_id, action_type, risk_tier, status,
                                requested_by_actor_type, requested_by_actor_id,
                                requested_by_persona_type, target_resource_type,
                                target_resource_id, request_payload, guardrail_violation_reason
                            ) VALUES (
                                :id, :tenant_id, :action_type, :risk_tier, 'PENDING_APPROVAL',
                                :actor_type, :actor_id, :persona_type, :resource_type,
                                :resource_id, :request_payload, :reason
                            );
                        """),
                        {
                            "id": approval_id,
                            "tenant_id": tenant_id,
                            "action_type": evaluation.action_type,
                            "risk_tier": evaluation.risk_tier,
                            "actor_type": actor_type,
                            "actor_id": actor_id,
                            "persona_type": persona_type,
                            "resource_type": target_resource_type,
                            "resource_id": target_resource_id,
                            "request_payload": json.dumps(payload),
                            "reason": evaluation.reason,
                        }
                    )

                    # 2. Catat audit log nyata dengan actor_type='ai_agent' dan persona_type
                    conn.execute(
                        sa.text("""
                            INSERT INTO audit_logs (
                                tenant_id, actor_type, actor_id, persona_type,
                                action, resource_type, resource_id, payload_after, request_id
                            ) VALUES (
                                :tenant_id, :actor_type, :actor_id, :persona_type,
                                :action, :resource_type, :resource_id, :payload_after, :request_id
                            );
                        """),
                        {
                            "tenant_id": tenant_id,
                            "actor_type": actor_type,
                            "actor_id": actor_id if actor_id and len(actor_id) == 36 else None,
                            "persona_type": persona_type,
                            "action": f"sales.guardrail.{evaluation.action_type.lower()}",
                            "resource_type": target_resource_type,
                            "resource_id": target_resource_id if target_resource_id and len(target_resource_id) == 36 else None,
                            "payload_after": json.dumps({
                                "status": "PENDING_APPROVAL",
                                "risk_tier": evaluation.risk_tier,
                                "guardrail_violation_reason": evaluation.reason,
                                "approval_id": approval_id,
                                "requested_payload": payload,
                                "requires_human_approval": True,
                            }),
                            "request_id": request_id,
                        }
                    )

            logger.info(
                f"[GUARDRAIL BLOCKED] Aksi AI '{action_type}' oleh persona '{persona_type}' "
                f"dihentikan di approval {approval_id}. Alasan: {evaluation.reason}"
            )

            return {
                "executed": False,
                "status": "PENDING_APPROVAL",
                "requires_human_approval": True,
                "approval_id": approval_id,
                "action_type": evaluation.action_type,
                "risk_tier": evaluation.risk_tier,
                "reason": evaluation.reason,
                "message": "Permintaan aksi berisiko tinggi oleh AI Agent dihentikan oleh Sales Guardrail dan dialihkan ke persetujuan staf manusia.",
            }

        # JIKA DIPERBOLEHKAN OTONOM (Diskon <= batas)
        with engine.connect() as conn:
            with conn.begin():
                conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
                conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                    {"tenant_id": tenant_id}
                )

                conn.execute(
                    sa.text("""
                        INSERT INTO audit_logs (
                            tenant_id, actor_type, actor_id, persona_type,
                            action, resource_type, resource_id, payload_after, request_id
                        ) VALUES (
                            :tenant_id, :actor_type, :actor_id, :persona_type,
                            :action, :resource_type, :resource_id, :payload_after, :request_id
                        );
                    """),
                    {
                        "tenant_id": tenant_id,
                        "actor_type": actor_type,
                        "actor_id": actor_id if actor_id and len(actor_id) == 36 else None,
                        "persona_type": persona_type,
                        "action": f"sales.guardrail.{evaluation.action_type.lower()}",
                        "resource_type": target_resource_type,
                        "resource_id": target_resource_id if target_resource_id and len(target_resource_id) == 36 else None,
                        "payload_after": json.dumps({
                            "status": "AUTONOMOUS_EXECUTED",
                            "risk_tier": evaluation.risk_tier,
                            "reason": evaluation.reason,
                            "requested_payload": payload,
                            "requires_human_approval": False,
                        }),
                        "request_id": request_id,
                    }
                )

        return {
            "executed": True,
            "status": "AUTONOMOUS_EXECUTED",
            "requires_human_approval": False,
            "action_type": evaluation.action_type,
            "risk_tier": evaluation.risk_tier,
            "reason": evaluation.reason,
            "message": "Aksi berhasil dieksekusi secara otonom dalam batas guardrail toleransi.",
        }

    @staticmethod
    def list_approvals(tenant_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Mengambil daftar tiket persetujuan manusia guardrail sales."""
        engine = get_database_engine()
        with engine.connect() as conn:
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            query = """
                SELECT id, action_type, risk_tier, status, requested_by_actor_type,
                       requested_by_actor_id, requested_by_persona_type,
                       target_resource_type, target_resource_id, request_payload,
                       guardrail_violation_reason, reviewed_by_user_id, reviewed_at,
                       rejection_reason, approval_notes, created_at, updated_at
                FROM sales_guardrail_approvals
                WHERE tenant_id = :tenant_id
            """
            params: Dict[str, Any] = {"tenant_id": tenant_id}
            if status:
                query += " AND status = :status"
                params["status"] = status
            query += " ORDER BY created_at DESC;"

            rows = conn.execute(sa.text(query), params).fetchall()
            return [
                {
                    "id": str(r.id),
                    "action_type": r.action_type,
                    "risk_tier": r.risk_tier,
                    "status": r.status,
                    "requested_by_actor_type": r.requested_by_actor_type,
                    "requested_by_actor_id": r.requested_by_actor_id,
                    "requested_by_persona_type": r.requested_by_persona_type,
                    "target_resource_type": r.target_resource_type,
                    "target_resource_id": r.target_resource_id,
                    "request_payload": r.request_payload if isinstance(r.request_payload, dict) else {},
                    "guardrail_violation_reason": r.guardrail_violation_reason,
                    "reviewed_by_user_id": str(r.reviewed_by_user_id) if r.reviewed_by_user_id else None,
                    "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                    "rejection_reason": r.rejection_reason,
                    "approval_notes": r.approval_notes,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
                for r in rows
            ]

    @staticmethod
    def review_approval(
        tenant_id: str,
        approval_id: str,
        reviewer_user_id: Optional[str],
        decision: str,  # 'APPROVED' | 'REJECTED'
        approval_notes: Optional[str] = None,
        rejection_reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Memberikan persetujuan atau penolakan staf manusia pada tiket guardrail sales."""
        engine = get_database_engine()
        with engine.connect() as conn:
            with conn.begin():
                conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
                conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                    {"tenant_id": tenant_id}
                )

                res = conn.execute(
                    sa.text("""
                        SELECT id, action_type, status, target_resource_type, target_resource_id,
                               requested_by_persona_type, request_payload
                        FROM sales_guardrail_approvals
                        WHERE tenant_id = :tenant_id AND id = :approval_id;
                    """),
                    {"tenant_id": tenant_id, "approval_id": approval_id}
                ).fetchone()

                if not res:
                    raise ValueError(f"Tiket persetujuan '{approval_id}' tidak ditemukan.")
                if res.status != "PENDING_APPROVAL":
                    raise ValueError(f"Tiket persetujuan sudah berstatus '{res.status}', tidak dapat ditinjau ulang.")

                new_status = "APPROVED" if decision.upper() == "APPROVED" else "REJECTED"
                rev_id = reviewer_user_id if reviewer_user_id and len(reviewer_user_id) == 36 else None

                conn.execute(
                    sa.text("""
                        UPDATE sales_guardrail_approvals
                        SET status = :status,
                            reviewed_by_user_id = :reviewed_by,
                            reviewed_at = now(),
                            approval_notes = :notes,
                            rejection_reason = :rejection_reason,
                            updated_at = now()
                        WHERE tenant_id = :tenant_id AND id = :approval_id;
                    """),
                    {
                        "status": new_status,
                        "reviewed_by": rev_id,
                        "notes": approval_notes,
                        "rejection_reason": rejection_reason,
                        "tenant_id": tenant_id,
                        "approval_id": approval_id,
                    }
                )

                # Catat audit log persetujuan manusia
                conn.execute(
                    sa.text("""
                        INSERT INTO audit_logs (
                            tenant_id, actor_type, actor_id, persona_type,
                            action, resource_type, resource_id, payload_after
                        ) VALUES (
                            :tenant_id, 'human_user', :actor_id, :persona_type,
                            :action, :resource_type, :resource_id, :payload_after
                        );
                    """),
                    {
                        "tenant_id": tenant_id,
                        "actor_id": rev_id,
                        "persona_type": res.requested_by_persona_type,
                        "action": f"sales.guardrail.review_{new_status.lower()}",
                        "resource_type": res.target_resource_type,
                        "resource_id": res.target_resource_id if res.target_resource_id and len(res.target_resource_id) == 36 else None,
                        "payload_after": json.dumps({
                            "approval_id": approval_id,
                            "decision": new_status,
                            "notes": approval_notes,
                            "rejection_reason": rejection_reason,
                        }),
                    }
                )

        return {
            "success": True,
            "approval_id": approval_id,
            "status": new_status,
            "message": f"Tiket persetujuan guardrail berhasil disetujui ({new_status}).",
        }

    @staticmethod
    def update_rule(
        tenant_id: str,
        action_type: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Memperbarui aturan guardrail untuk tenant tertentu di Supabase Postgres."""
        engine = get_database_engine()
        with engine.connect() as conn:
            with conn.begin():
                conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
                conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                    {"tenant_id": tenant_id}
                )

                set_clauses = ["updated_at = now()"]
                params: Dict[str, Any] = {
                    "tenant_id": tenant_id,
                    "action_type": action_type.upper(),
                }

                if "max_autonomous_discount_pct" in updates and updates["max_autonomous_discount_pct"] is not None:
                    set_clauses.append("max_autonomous_discount_pct = :max_disc")
                    params["max_disc"] = float(updates["max_autonomous_discount_pct"])

                if "max_autonomous_amount" in updates and updates["max_autonomous_amount"] is not None:
                    set_clauses.append("max_autonomous_amount = :max_amt")
                    params["max_amt"] = float(updates["max_autonomous_amount"])

                if "requires_human_approval" in updates and updates["requires_human_approval"] is not None:
                    set_clauses.append("requires_human_approval = :req_approval")
                    params["req_approval"] = bool(updates["requires_human_approval"])

                if "is_active" in updates and updates["is_active"] is not None:
                    set_clauses.append("is_active = :is_active")
                    params["is_active"] = bool(updates["is_active"])

                query = f"""
                    UPDATE sales_guardrail_rules
                    SET {', '.join(set_clauses)}
                    WHERE tenant_id = :tenant_id AND action_type = :action_type
                    RETURNING id, tenant_id, action_type, risk_tier, requires_human_approval,
                              max_autonomous_discount_pct, max_autonomous_amount, is_active,
                              description, updated_at;
                """
                row = conn.execute(sa.text(query), params).fetchone()
                if not row:
                    raise ValueError(f"Aturan guardrail '{action_type}' untuk tenant '{tenant_id}' tidak ditemukan.")

                return {
                    "id": str(row.id),
                    "tenant_id": str(row.tenant_id),
                    "action_type": row.action_type,
                    "risk_tier": row.risk_tier,
                    "requires_human_approval": row.requires_human_approval,
                    "max_autonomous_discount_pct": float(row.max_autonomous_discount_pct),
                    "max_autonomous_amount": float(row.max_autonomous_amount),
                    "is_active": row.is_active,
                    "description": row.description,
                    "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                }

    @staticmethod
    def get_audit_logs(tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Mengambil riwayat Audit Ledger aksi penjualan berisiko oleh AI dari Supabase Postgres."""
        engine = get_database_engine()
        with engine.connect() as conn:
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )

            query = """
                SELECT id, tenant_id, actor_type, actor_id, persona_type,
                       action, resource_type, resource_id, payload_after, request_id, created_at
                FROM audit_logs
                WHERE tenant_id = :tenant_id AND (action LIKE 'sales.guardrail%' OR actor_type = 'ai_agent')
                ORDER BY created_at DESC
                LIMIT :limit;
            """
            rows = conn.execute(sa.text(query), {"tenant_id": tenant_id, "limit": limit}).fetchall()
            return [
                {
                    "id": str(r.id),
                    "tenant_id": str(r.tenant_id),
                    "actor_type": r.actor_type,
                    "actor_id": str(r.actor_id) if r.actor_id else None,
                    "persona_type": r.persona_type,
                    "action": r.action,
                    "resource_type": r.resource_type,
                    "resource_id": str(r.resource_id) if r.resource_id else None,
                    "payload_after": r.payload_after,
                    "request_id": r.request_id,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]

    @staticmethod
    def get_mcp_high_risk_tools() -> List[Dict[str, Any]]:
        """Mengambil daftar perkakas risiko tinggi di MCP Tool Registry dari Supabase Postgres."""
        engine = get_database_engine()
        with engine.connect() as conn:
            query = """
                SELECT id, tool_name, risk_tier, description, is_active, input_schema, output_schema
                FROM mcp_tools
                WHERE risk_tier = 'high' AND tool_name LIKE 'sales.%'
                ORDER BY tool_name ASC;
            """
            rows = conn.execute(sa.text(query)).fetchall()
            return [
                {
                    "id": str(r.id),
                    "tool_name": r.tool_name,
                    "risk_tier": r.risk_tier,
                    "description": r.description,
                    "is_active": r.is_active,
                    "input_schema": r.input_schema if isinstance(r.input_schema, dict) else {},
                    "output_schema": r.output_schema if isinstance(r.output_schema, dict) else {},
                }
                for r in rows
            ]

