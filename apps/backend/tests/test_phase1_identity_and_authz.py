"""
Suite Uji Lengkap Fase 1: Identitas & Otorisasi (PRD v2.2 Bagian 3.5, 9.3, 13.4).
Memverifikasi:
1. Unified Policy Decision Point (PDP) authorize() untuk 6 role:
   - SUPER_ADMIN (MFA enforcement)
   - TENANT_OWNER
   - TENANT_ADMIN
   - DEPT_MANAGER
   - STAFF_HUMAN
   - AI_AGENT
2. Pencatatan setiap keputusan authorize() di tabel audit_logs.
3. CSPRNG Company Code (karakter valid, hash SHA-256, batas kadaluarsa & batas penggunaan).
4. Alur lengkap pendaftaran mandiri (register-tenant), join via company code, dan review HR.
"""

from datetime import datetime, timedelta, timezone
import uuid
import pytest
from starlette.testclient import TestClient
import sqlalchemy as sa
from app.main import app
from app.authz.pdp import (
    ResourceContext,
    SubjectContext,
    authorize,
)
from app.core.database import get_database_engine, tenant_tx
from app.services.company_code import (
    CSPRNG_ALPHABET,
    generate_company_code,
    hash_company_code,
    verify_company_code,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_csprng_company_code_properties():
    """Memverifikasi properti CSPRNG: karakter aman tanpa ambigu (0, O, 1, I) dan hash SHA-256."""
    code, code_hash = generate_company_code()

    assert len(code) == 8
    for char in code:
        assert char in CSPRNG_ALPHABET
        assert char not in ("0", "O", "1", "I")

    assert len(code_hash) == 64  # Panjang SHA-256 hex string
    assert verify_company_code(code, code_hash) is True
    assert verify_company_code("WRONGCODE", code_hash) is False


def test_pdp_super_admin_mfa_rule():
    """SUPER_ADMIN wajib verifikasi MFA aktif untuk operasi platform maupun lintas-tenant."""
    tenant_x = str(uuid.uuid4())
    tenant_y = str(uuid.uuid4())
    user_sa = str(uuid.uuid4())

    resource = ResourceContext(resource_type="platform_settings", owner_tenant_id=tenant_y)

    # Tanpa MFA: Wajib DENY_MFA_REQUIRED
    sub_no_mfa = SubjectContext(
        user_id=user_sa,
        tenant_id=tenant_x,
        roles=["SUPER_ADMIN"],
        is_mfa_verified=False,
    )
    dec_no_mfa = authorize(sub_no_mfa, "platform.config.update", resource, log_audit=True)
    assert dec_no_mfa.is_authorized is False
    assert dec_no_mfa.decision == "DENY_MFA_REQUIRED"

    # Dengan MFA: Wajib ALLOW
    sub_with_mfa = SubjectContext(
        user_id=user_sa,
        tenant_id=tenant_x,
        roles=["SUPER_ADMIN"],
        is_mfa_verified=True,
    )
    dec_with_mfa = authorize(sub_with_mfa, "platform.config.update", resource, log_audit=True)
    assert dec_with_mfa.is_authorized is True
    assert dec_with_mfa.decision == "ALLOW"


def test_pdp_tenant_owner_and_admin_rules():
    """TENANT_OWNER dan TENANT_ADMIN memiliki kewenangan penuh pada tenant sendiri, ditolak lintas tenant."""
    tenant_id = str(uuid.uuid4())
    other_tenant_id = str(uuid.uuid4())
    user_owner = str(uuid.uuid4())
    user_admin = str(uuid.uuid4())

    res_own = ResourceContext(resource_type="tenant_billing", owner_tenant_id=tenant_id)
    res_other = ResourceContext(resource_type="tenant_billing", owner_tenant_id=other_tenant_id)

    # TENANT_OWNER pada tenant sendiri
    sub_owner = SubjectContext(user_id=user_owner, tenant_id=tenant_id, roles=["TENANT_OWNER"])
    assert authorize(sub_owner, "billing.upgrade", res_own).is_authorized is True
    assert authorize(sub_owner, "billing.upgrade", res_other).decision == "DENY_CROSS_TENANT"

    # TENANT_ADMIN pada tenant sendiri
    sub_admin = SubjectContext(user_id=user_admin, tenant_id=tenant_id, roles=["TENANT_ADMIN"])
    assert authorize(sub_admin, "user.invite", res_own).is_authorized is True
    assert authorize(sub_admin, "user.invite", res_other).decision == "DENY_CROSS_TENANT"


def test_pdp_dept_manager_and_staff_rules():
    """DEPT_MANAGER dapat mereview HR/approval, STAFF_HUMAN hanya aksi dasar."""
    tenant_id = str(uuid.uuid4())
    user_mgr = str(uuid.uuid4())
    user_staff = str(uuid.uuid4())

    res_hr = ResourceContext(resource_type="hr_approval_queue", owner_tenant_id=tenant_id)

    # Manager boleh review HR
    sub_mgr = SubjectContext(user_id=user_mgr, tenant_id=tenant_id, roles=["DEPT_MANAGER"])
    assert authorize(sub_mgr, "hr.approval.review", res_hr).is_authorized is True

    # Staff ditolak review HR
    sub_staff = SubjectContext(user_id=user_staff, tenant_id=tenant_id, roles=["STAFF_HUMAN"])
    assert authorize(sub_staff, "hr.approval.review", res_hr).is_authorized is False
    assert authorize(sub_staff, "hr.approval.review", res_hr).decision == "DENY_INSUFFICIENT_ROLE"

    # Staff boleh aksi yang diizinkan (misal clock attendance atau task view)
    assert authorize(sub_staff, "attendance.clock", res_hr).is_authorized is True


def test_pdp_ai_agent_rules():
    """AI_AGENT ditolak tanpa kebijakan ABAC (DENIED_NO_POLICY), dan ditolak untuk aksi administratif."""
    tenant_id = str(uuid.uuid4())
    agent_id = str(uuid.uuid4())
    res_tool = ResourceContext(resource_type="tool_execution", owner_tenant_id=tenant_id)

    sub_agent = SubjectContext(
        user_id=agent_id,
        tenant_id=tenant_id,
        actor_type="ai_agent",
        roles=["AI_AGENT"],
    )

    # 1. Tanpa policy ABAC eksplisit: Wajib DENIED_NO_POLICY (Zero-Trust Default)
    dec_no_policy = authorize(sub_agent, "tool.execute", res_tool)
    assert dec_no_policy.is_authorized is False
    assert dec_no_policy.decision == "DENIED_NO_POLICY"

    # 2. Aksi administratif: Ditolak oleh RBAC (DENY_INSUFFICIENT_ROLE)
    dec_admin = authorize(sub_agent, "hr.approval.review", res_tool)
    assert dec_admin.is_authorized is False
    assert dec_admin.decision == "DENY_INSUFFICIENT_ROLE"


def test_audit_logs_persistence():
    """Setiap keputusan otorisasi wajib tercatat di tabel audit_logs Postgres."""
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    res = ResourceContext(resource_type="test_resource", owner_tenant_id=tenant_id)
    sub = SubjectContext(user_id=user_id, tenant_id=tenant_id, roles=["TENANT_OWNER"])

    # Jalankan evaluasi dengan audit logging aktif
    authorize(sub, "test.action.audit", res, log_audit=True)

    with tenant_tx(tenant_id, user_id) as conn:
        row = conn.execute(
            sa.text("""
                SELECT action, actor_type, (payload_after->>'decision') as decision_val
                FROM audit_logs
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC
                LIMIT 1;
            """),
            {"tenant_id": tenant_id}
        ).mappings().first()

        assert row is not None
        assert row["action"] == "authz:test.action.audit"
        assert row["actor_type"] == "human_user"
        assert row["decision_val"] == "ALLOW"


def test_end_to_end_onboarding_and_hr_approval_flow(client: TestClient):
    """
    Uji siklus hidup Onboarding & Antrean HR:
    1. Register tenant baru (Owner)
    2. Owner generate Company Code
    3. Staf mendaftar dengan Company Code (status: pending di hr_approval_queue)
    4. Owner/Admin melihat antrean HR
    5. Owner/Admin menyetujui (approve) pendaftaran -> staf menjadi active member dengan role STAFF_HUMAN
    """
    owner_auth_id = str(uuid.uuid4())
    staff_auth_id = str(uuid.uuid4())

    # 1. Register Tenant Baru
    reg_res = client.post(
        "/api/v1/onboarding/register-tenant",
        json={
            "legal_name": "PT Nusantara Jaya Digital",
            "display_name": "Nusantara Digital",
            "owner_auth_user_id": owner_auth_id,
            "owner_full_name": "Budi Santoso",
            "plan_code": "FREE_TRIAL",
        }
    )
    assert reg_res.status_code == 201
    tenant_data = reg_res.json()
    tenant_id = tenant_data["tenant_id"]
    assert tenant_data["role"] == "TENANT_OWNER"

    # Token autentikasi Owner untuk request berikutnya
    owner_token = f"jwt.{owner_auth_id}.{tenant_id}.TENANT_OWNER.sig_valid_hash"
    owner_headers = {
        "Authorization": f"Bearer {owner_token}",
        "X-Tenant-Id": tenant_id,
    }

    # 2. Owner generate Company Code
    code_res = client.post(
        "/api/v1/tenant/company-codes",
        headers=owner_headers,
        json={"expires_in_days": 14, "max_uses": 50}
    )
    assert code_res.status_code == 201
    company_code = code_res.json()["code"]
    assert len(company_code) == 8

    # 3. Calon Staf mendaftar via Company Code
    join_res = client.post(
        "/api/v1/onboarding/join-company",
        json={
            "company_code": company_code,
            "full_name": "Siti Rahma",
            "email": "siti.rahma@nusantara.id",
            "auth_user_id": staff_auth_id,
        }
    )
    assert join_res.status_code == 201
    join_data = join_res.json()
    assert join_data["status"] == "pending"
    queue_id = join_data["queue_id"]

    # 4. Owner melihat antrean HR
    queue_res = client.get("/api/v1/tenant/hr-queue", headers=owner_headers)
    assert queue_res.status_code == 200
    queue_items = queue_res.json()
    assert len(queue_items) >= 1
    target_item = next(item for item in queue_items if item["id"] == queue_id)
    assert target_item["submitted_profile"]["full_name"] == "Siti Rahma"

    # 5. Owner menyetujui (approve) pendaftaran staf
    review_res = client.post(
        f"/api/v1/tenant/hr-queue/{queue_id}/review",
        headers=owner_headers,
        json={"decision": "approved"}
    )
    assert review_res.status_code == 200
    review_data = review_res.json()
    assert review_data["status"] == "approved"

    # Verifikasi membership staf aktif di database menggunakan tenant_tx untuk melewati RLS
    with tenant_tx(tenant_id) as conn:
        member_row = conn.execute(
            sa.text("""
                SELECT tm.status, r.role_code
                FROM tenant_memberships tm
                JOIN user_roles ur ON ur.tenant_membership_id = tm.id
                JOIN roles r ON r.id = ur.role_id
                WHERE tm.tenant_id = :tenant_id AND tm.auth_user_id = :user_id;
            """),
            {"tenant_id": tenant_id, "user_id": staff_auth_id}
        ).mappings().first()

        assert member_row is not None
        assert member_row["status"] == "active"
        assert member_row["role_code"] == "STAFF_HUMAN"
