"""
Suite Uji Isolasi RLS Lintas Tenant & Anti-Spoofing (PRD v2.2 Bagian 2.6 & Bagian 3.5).
Memverifikasi bahwa:
1. User Tenant A TIDAK PERNAH bisa membaca/menulis data Tenant B.
2. Upaya memalsukan header X-Tenant-Id ditolak seketika (HTTP 403 Forbidden).
3. Kerangka otomatis memindai seluruh tabel bertenant saat skema dimigrasi.
"""

import pytest
from starlette.testclient import TestClient
from app.main import app
from tests.harness.rls_isolation_harness import (
    RLSMatrixVerifier,
    TenantCredentials,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_tenant_context_legitimate_access(client: TestClient):
    """
    Memverifikasi akses sah user Tenant A mengekstrak identitas tenant yang tepat.
    """
    tenant_a = TenantCredentials.create(tenant_id="tenant-alpha-101", user_id="user-a-01")

    # Request sah tanpa header X-Tenant-Id
    response = client.get("/api/v1/tenant/context", headers=tenant_a.auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == "tenant-alpha-101"
    assert data["user_id"] == "user-a-01"

    # Request sah dengan header X-Tenant-Id yang konsisten
    headers_with_match = {**tenant_a.auth_headers, "X-Tenant-Id": "tenant-alpha-101"}
    response_match = client.get("/api/v1/tenant/context", headers=headers_with_match)
    assert response_match.status_code == 200
    assert response_match.json()["tenant_id"] == "tenant-alpha-101"


def test_tenant_header_spoofing_rejected(client: TestClient):
    """
    SKENARIO SERANGAN: User Tenant A mencoba mengirim token Tenant A
    tetapi memalsukan header `X-Tenant-Id: tenant-beta-202`.
    Penegakan mutlak: Wajib ditolak dengan 403 Forbidden!
    """
    tenant_a = TenantCredentials.create(tenant_id="tenant-alpha-101", user_id="user-a-01")

    # Serangan manipulasi header X-Tenant-Id
    spoofed_headers = {
        **tenant_a.auth_headers,
        "X-Tenant-Id": "tenant-beta-202",  # Target tenant korban
    }

    response = client.get("/api/v1/tenant/context", headers=spoofed_headers)
    RLSMatrixVerifier.evaluate_anti_spoofing_response(response.status_code, response.json())


def test_unauthenticated_request_rejected(client: TestClient):
    """
    Memverifikasi request tanpa token otentikasi ditolak 401 Unauthorized.
    """
    response = client.get("/api/v1/tenant/context")
    assert response.status_code == 401


def test_rls_database_tables_scan_suite():
    """
    Memindai seluruh tabel bertenant yang terdaftar di schema database
    dan memverifikasi penegakan kebijakan RLS pada tingkat database Postgres.
    """
    from app.core.database import verify_rls_table_enforcement, tenant_tx
    from sqlalchemy import text

    ok, detail, data = verify_rls_table_enforcement()
    assert ok is True, f"Verifikasi RLS gagal: {detail}"
    assert data.get("tenant_tables_count", 0) > 0, "Wajib ada tabel bertenant aktif di database"

    registered_tenant_tables = [
        "tenant_memberships",
        "tenant_capability_overrides",
        "tenant_company_codes",
        "hr_approval_queue",
        "audit_logs",
    ]

    tenant_a = TenantCredentials.create("11111111-1111-1111-1111-111111111111", "aaaa0001-0000-0000-0000-000000000001")
    tenant_b = TenantCredentials.create("22222222-2222-2222-2222-222222222222", "bbbb0002-0000-0000-0000-000000000002")

    for table in registered_tenant_tables:
        RLSMatrixVerifier.verify_tenant_boundary_contract(
            table_name=table,
            tenant_a=tenant_a,
            tenant_b=tenant_b,
            sample_tenant_b_row_id="sample-id",
        )

        # Uji langsung pada tingkat SQL transaction dengan tenant_tx
        with tenant_tx(tenant_a.tenant_id) as conn:
            # Query baris milik Tenant B dari konteks Tenant A: RLS wajib mengembalikan 0 baris
            query = text(f"SELECT count(*) FROM {table} WHERE tenant_id = :other_tenant;")
            count = conn.execute(query, {"other_tenant": tenant_b.tenant_id}).scalar()
            assert count == 0, f"Pelanggaran RLS: Tenant A dapat melihat baris Tenant B pada tabel {table}"

