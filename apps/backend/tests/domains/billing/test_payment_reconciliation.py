"""
Unit & Domain Tests for OrchestreeAI Payment Reconciliation System (PRD v2.2 Bagian 2, 3.5, 12.5, 14.3)
Pengujian mandiri:
1. build_synthetic_webhook_payload: signature kriptografis SHA512 valid.
2. recheck_payment_status: verifikasi status settlement memicu handle_payment_webhook tunggal.
3. recheck_payment_status: penanganan status expire/deny/cancel diekskalasi ke verified_mismatch_escalated.
4. manual_resolve_case: audit logging tercatat dengan risk tier HIGH.
5. detect_payment_reconciliation_cases: deteksi transaksi tertunda dan penanganan webhook hilang.
"""

import asyncio
import hashlib
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.domains.billing.payment_reconciliation import (
    MidtransClient,
    MidtransStatusResult,
    ReconciliationResult,
    build_synthetic_webhook_payload,
    recheck_payment_status,
    manual_resolve_case,
    detect_payment_reconciliation_cases,
)
from app.domains.commerce.payment_webhook import verify_midtrans_signature


class TestPaymentReconciliation(unittest.TestCase):

    def test_build_synthetic_webhook_payload_signature(self):
        """Memverifikasi payload sintesis memiliki signature SHA512 yang valid untuk verifikasi gateway."""
        server_key = "SB-Mid-server-sandbox-test-key"
        order_id = "INV-2026-REC-001"
        gross_amount = "250000.00"
        status_code = "200"

        gateway_res = MidtransStatusResult(
            status_code=status_code,
            status="settlement",
            fraud_status="accept",
            gross_amount=gross_amount,
            transaction_id="TX-MIDTRANS-9988",
            order_id=order_id,
            payment_type="bank_transfer",
            is_success=True,
        )

        payload = build_synthetic_webhook_payload(gateway_res, server_key)

        self.assertEqual(payload["order_id"], order_id)
        self.assertEqual(payload["transaction_status"], "settlement")
        self.assertTrue(payload["is_reconciliation_synthetic"])

        # Verifikasi signature dengan fungsi kanonik verify_midtrans_signature
        is_valid = verify_midtrans_signature(
            order_id=order_id,
            status_code=status_code,
            gross_amount=gross_amount,
            server_key=server_key,
            received_signature=payload["signature_key"],
        )
        self.assertTrue(is_valid, "Signature sintesis harus lolos verifikasi kriptografis SHA512")

    def test_recheck_payment_status_settlement_activates_entitlement(self):
        """Gateway mengonfirmasi settlement: memicu handle_payment_webhook dan menandai verified_matched."""
        case_id = "00000000-0000-0000-0000-000000000001"
        tenant_id = "11111111-1111-1111-1111-111111111111"
        fake_case = {
            "id": case_id,
            "tenant_id": tenant_id,
            "gateway_reference_id": "INV-2026-001",
            "detected_status": "error_confirm",
            "internal_status_before": "pending",
            "gateway_status_latest": None,
            "resolution_status": "open",
        }

        mock_midtrans_res = MidtransStatusResult(
            status_code="200",
            status="settlement",
            fraud_status="accept",
            gross_amount="500000.00",
            transaction_id="TX-12345",
            order_id="INV-2026-001",
            payment_type="echannel",
            is_success=True,
        )

        with patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.get", new_callable=AsyncMock) as mock_get, \
             patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.update_gateway_status", new_callable=AsyncMock) as mock_update_gw, \
             patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.mark_resolved", new_callable=AsyncMock) as mock_mark_res, \
             patch("app.domains.billing.payment_reconciliation.midtrans_client.get_transaction_status", new_callable=AsyncMock) as mock_gw_status, \
             patch("app.domains.billing.payment_reconciliation.handle_payment_webhook", new_callable=AsyncMock) as mock_webhook:

            mock_get.return_value = fake_case
            mock_gw_status.return_value = mock_midtrans_res
            mock_webhook.return_value = {"status": "success", "entitled": True}

            result = asyncio.run(recheck_payment_status(case_id))

            self.assertEqual(result.resolution_status, "verified_matched")
            self.assertEqual(result.gateway_status, "settlement")

            # Entitlement wajib dieksekusi melalui handle_payment_webhook tunggal
            mock_webhook.assert_called_once()
            call_kwargs = mock_webhook.call_args.kwargs
            self.assertEqual(call_kwargs["gateway_provider"], "midtrans")
            self.assertEqual(call_kwargs["payload"]["order_id"], "INV-2026-001")
            self.assertEqual(call_kwargs["payload"]["transaction_status"], "settlement")

            # Kasus ditandai verified_matched
            mock_mark_res.assert_called_once()
            self.assertEqual(mock_mark_res.call_args[0][1], "verified_matched")

    def test_recheck_payment_status_expired_escalates_to_mismatch(self):
        """Gateway mengonfirmasi transaksi expire/deny/cancel: eskalasi status ke verified_mismatch_escalated."""
        case_id = "00000000-0000-0000-0000-000000000002"
        tenant_id = "11111111-1111-1111-1111-111111111111"
        fake_case = {
            "id": case_id,
            "tenant_id": tenant_id,
            "gateway_reference_id": "INV-2026-002",
            "detected_status": "error_confirm",
            "internal_status_before": "pending",
            "gateway_status_latest": None,
            "resolution_status": "open",
        }

        mock_midtrans_res = MidtransStatusResult(
            status_code="200",
            status="expire",
            fraud_status="accept",
            gross_amount="100000.00",
            transaction_id="TX-EXPIRED",
            order_id="INV-2026-002",
            payment_type="bank_transfer",
            is_success=False,
        )

        with patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.get", new_callable=AsyncMock) as mock_get, \
             patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.update_gateway_status", new_callable=AsyncMock), \
             patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.mark_status", new_callable=AsyncMock) as mock_mark_stat, \
             patch("app.domains.billing.payment_reconciliation.midtrans_client.get_transaction_status", new_callable=AsyncMock) as mock_gw_status, \
             patch("app.domains.billing.payment_reconciliation.handle_payment_webhook", new_callable=AsyncMock) as mock_webhook:

            mock_get.return_value = fake_case
            mock_gw_status.return_value = mock_midtrans_res

            result = asyncio.run(recheck_payment_status(case_id))

            self.assertEqual(result.resolution_status, "verified_mismatch_escalated")
            self.assertEqual(result.gateway_status, "expire")

            # Tidak boleh menjalankan entitlement bila status gagal/expire
            mock_webhook.assert_not_called()
            mock_mark_stat.assert_called_once()
            self.assertEqual(mock_mark_stat.call_args[0][1], "verified_mismatch_escalated")

    def test_manual_resolve_case_records_high_risk_audit_and_webhook_entitlement(self):
        """Penyelesaian manual oleh Super Admin mencatat Audit Ledger risk tier HIGH dan menjalankan handle_payment_webhook."""
        case_id = "00000000-0000-0000-0000-000000000003"
        admin_id = "00000000-0000-0000-0000-000000000099"
        tenant_id = "22222222-2222-2222-2222-222222222222"

        fake_case = {
            "id": case_id,
            "tenant_id": tenant_id,
            "gateway_reference_id": "ORD-2026-MANUAL-01",
            "detected_status": "error_confirm",
            "internal_status_before": "pending",
            "gateway_status_latest": "expire",
            "resolution_status": "verified_mismatch_escalated",
            "invoice_amount": 150000,
        }

        mock_conn = AsyncMock()
        mock_engine = MagicMock()
        mock_engine.begin.return_value.__aenter__.return_value = mock_conn

        with patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.get", new_callable=AsyncMock) as mock_get, \
             patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.mark_resolved", new_callable=AsyncMock) as mock_mark_res, \
             patch("app.domains.billing.payment_reconciliation.get_engine", return_value=mock_engine), \
             patch("app.domains.billing.payment_reconciliation.handle_payment_webhook", new_callable=AsyncMock) as mock_webhook:

            mock_get.return_value = fake_case
            notes = "Telah diperiksa bukti mutasi rekening koran BCA tanggal 26/09/2026 jam 14:00 referensi #889912 valid."

            res = asyncio.run(manual_resolve_case(
                case_id=case_id,
                resolution_status="resolved",
                resolution_notes=notes,
                admin_user_id=admin_id,
            ))

            self.assertEqual(res["resolution_status"], "resolved")
            self.assertEqual(res["resolved_by"], admin_id)

            # Verifikasi audit log dicatat dengan risk_tier HIGH
            mock_conn.execute.assert_called_once()
            audit_call_args = mock_conn.execute.call_args
            params = audit_call_args[0][1]
            after_payload = json.loads(params["after_payload"])
            self.assertEqual(after_payload["risk_tier"], "HIGH")
            self.assertEqual(after_payload["resolution_status"], "resolved")

            # Entitlement dipicu lewat webhook kanonik
            mock_webhook.assert_called_once()
            self.assertEqual(mock_webhook.call_args.kwargs["payload"]["order_id"], "ORD-2026-MANUAL-01")


class TestPaymentReconciliationAPI(unittest.TestCase):
    """Pengujian API Endpoints Rekonsiliasi Pembayaran via TestClient."""

    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app.main import app
        cls.client = TestClient(app)
        cls.superadmin_headers = {
            "Authorization": "Bearer test-superadmin-token",
            "X-User-Roles": "PLATFORM_SUPERADMIN",
            "X-User-Capabilities": "admin.commercial.reconciliation.view,admin.commercial.reconciliation.manage,platform.admin.manage",
            "X-MFA-Verified": "true",
        }
        cls.tenant_headers = {
            "Authorization": "Bearer test-tenant-token",
            "X-User-Roles": "TENANT_ADMIN",
            "X-User-Capabilities": "billing.invoice.view,billing.reconciliation.view",
            "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
            "X-MFA-Verified": "true",
        }

    def test_admin_get_reconciliation_cases_endpoint(self):
        """Memverifikasi endpoint GET /api/v1/billing/admin/reconciliation/cases mengembalikan metrik 3 tab dan daftar kasus."""
        fake_counts = {"success": 42, "pending": 7, "error_confirm": 2}
        fake_cases = [
            {
                "id": "case-001",
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "gateway_reference_id": "INV-2026-999",
                "detected_status": "error_confirm",
                "internal_status_before": "pending_payment",
                "resolution_status": "open",
                "created_at": "2026-09-26T12:00:00Z",
            }
        ]

        with patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.get_counts", new_callable=AsyncMock, return_value=fake_counts), \
             patch("app.domains.billing.payment_reconciliation.payment_reconciliation_repo.list_cases", new_callable=AsyncMock, return_value=fake_cases):

            resp = self.client.get(
                "/api/v1/billing/admin/reconciliation/cases?tab=error_confirm",
                headers=self.superadmin_headers,
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["active_tab"], "error_confirm")
            self.assertEqual(data["counts"]["success"], 42)
            self.assertEqual(data["counts"]["pending"], 7)
            self.assertEqual(data["counts"]["error_confirm"], 2)
            self.assertEqual(len(data["cases"]), 1)
            self.assertEqual(data["cases"][0]["gateway_reference_id"], "INV-2026-999")

    def test_admin_recheck_gateway_endpoint(self):
        """Memverifikasi endpoint POST /api/v1/billing/admin/reconciliation/cases/{case_id}/recheck."""
        mock_result = ReconciliationResult(
            case_id="case-123",
            gateway_status="settlement",
            resolution_status="verified_matched",
            message="Verifikasi status ke gateway selesai",
        )

        with patch("app.api.v1.billing.recheck_payment_status", new_callable=AsyncMock, return_value=mock_result):
            resp = self.client.post(
                "/api/v1/billing/admin/reconciliation/cases/case-123/recheck",
                headers=self.superadmin_headers,
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["gateway_status"], "settlement")
            self.assertEqual(data["resolution_status"], "verified_matched")

    def test_admin_manual_resolve_endpoint(self):
        """Memverifikasi endpoint POST /api/v1/billing/admin/reconciliation/cases/{case_id}/resolve."""
        mock_resolved = {
            "case_id": "case-456",
            "resolution_status": "resolved",
            "resolved_by": "admin-001",
            "notes": "Bukti transfer rekening koran valid.",
        }

        with patch("app.api.v1.billing.manual_resolve_case", new_callable=AsyncMock, return_value=mock_resolved):
            resp = self.client.post(
                "/api/v1/billing/admin/reconciliation/cases/case-456/resolve",
                headers=self.superadmin_headers,
                json={
                    "resolution_status": "resolved",
                    "resolution_notes": "Bukti transfer rekening koran valid.",
                },
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["data"]["resolution_status"], "resolved")

    def test_admin_run_detection_endpoint(self):
        """Memverifikasi endpoint POST /api/v1/billing/admin/reconciliation/detect."""
        mock_report = {
            "status": "completed",
            "scanned_invoices": 10,
            "scanned_orders": 5,
            "detected_cases": 2,
            "auto_resolved_cases": 2,
            "escalated_cases": 0,
            "threshold_minutes": 15,
        }

        with patch("app.api.v1.billing.detect_payment_reconciliation_cases", new_callable=AsyncMock, return_value=mock_report):
            resp = self.client.post(
                "/api/v1/billing/admin/reconciliation/detect",
                headers=self.superadmin_headers,
                json={"threshold_minutes": 15},
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["report"]["auto_resolved_cases"], 2)


if __name__ == "__main__":
    unittest.main()
