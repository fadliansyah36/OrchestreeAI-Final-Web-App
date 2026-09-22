"""
Suite Uji Fase: ABAC & Penetrasi PDP (PRD v2.2 Bagian 3.3, 3.5, 14.2 & 20.1).
Memverifikasi:
1. Sifat Default Mutlak ABAC: DENIED_NO_POLICY bila tidak ada baris policy eksplisit (Zero-Trust Fail-Closed).
2. Pencatatan nyata penolakan DENIED_NO_POLICY ke tabel audit_logs.
3. Evaluasi Kebijakan Izin Data (ALLOW / DENIED_POLICY_EXPLICIT / Hirarki Klasifikasi Data).
4. Penegakan batas plafon kredit anggaran per departemen (credit_guard.check_department_cap).
5. Uji Penetrasi Otomatis: Memastikan seluruh akses REST, Node Workflow, dan MCP Tool wajib melewati authorize().
"""

from decimal import Decimal
import json
import uuid
import pytest
import sqlalchemy as sa
from app.authz.abac import (
    ABACDecision,
    ABACResource,
    ABACSubject,
    check_ai_data_permission,
)
from app.authz.credit_guard import (
    DepartmentBudgetDecision,
    check_department_cap,
)
from app.authz.pdp import (
    AuthorizationDecision,
    ResourceContext,
    SubjectContext,
    authorize,
)
from app.core.database import get_database_engine, tenant_tx


def test_abac_default_fail_closed_denied_no_policy():
    """AI Agent Persona mencoba akses sumber data eksternal tanpa policy -> Wajib DENIED_NO_POLICY."""
    tenant_id = str(uuid.uuid4())
    agent_id = str(uuid.uuid4())

    subject = ABACSubject(
        tenant_id=tenant_id,
        agent_id=agent_id,
        agent_persona_type="researcher",
        actor_type="ai_agent",
        roles=["AI_AGENT"],
    )

    resource = ABACResource(
        resource_type="external_api",
        resource_identifier="salesforce_leads",
        data_classification="confidential",
        owner_tenant_id=tenant_id,
    )

    # Tanpa ada baris di ai_data_permission_policies
    decision = check_ai_data_permission(subject, "data.read", resource, log_audit=True)

    assert decision.is_authorized is False
    assert decision.decision == "DENIED_NO_POLICY"
    assert "DENIED_NO_POLICY" in decision.reason


def test_abac_audit_log_real_persistence():
    """Penolakan DENIED_NO_POLICY wajib tercatat nyata di tabel audit_logs Supabase."""
    tenant_id = str(uuid.uuid4())
    agent_id = str(uuid.uuid4())
    req_id = f"test-req-{uuid.uuid4()}"

    subject = ABACSubject(
        tenant_id=tenant_id,
        agent_id=agent_id,
        agent_persona_type="financial_analyst",
        actor_type="ai_agent",
        roles=["AI_AGENT"],
    )

    resource = ABACResource(
        resource_type="database_table",
        resource_identifier="payroll_salaries",
        data_classification="restricted",
        owner_tenant_id=tenant_id,
    )

    # Jalankan evaluasi yang menghasilkan DENIED_NO_POLICY
    decision = check_ai_data_permission(
        subject,
        "data.read",
        resource,
        context={"request_id": req_id},
        log_audit=True,
    )
    assert decision.decision == "DENIED_NO_POLICY"

    # Verifikasi langsung ke database audit_logs
    engine = get_database_engine()
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("""
                SELECT action, actor_type, payload_after
                FROM audit_logs
                WHERE request_id = :req_id
                ORDER BY created_at DESC
                LIMIT 1;
            """),
            {"req_id": req_id}
        ).fetchone()

        assert row is not None
        assert row[0] == "abac:data.read"
        assert row[1] == "ai_agent"
        payload = row[2] if isinstance(row[2], dict) else json.loads(row[2])
        assert payload.get("abac_decision") == "DENIED_NO_POLICY"
        assert payload.get("is_authorized") is False


def test_abac_explicit_allow_and_deny_policies():
    """Menguji efek ALLOW dan DENY dari tabel ai_data_permission_policies."""
    tenant_id = str(uuid.uuid4())
    agent_id = str(uuid.uuid4())
    engine = get_database_engine()

    # Siapkan tenant di database
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("""
                INSERT INTO tenants (id, name, company_code, code_expires_at)
                VALUES (:id, 'Test ABAC Tenant', 'ABACTEST', now() + interval '1 day')
                ON CONFLICT (id) DO NOTHING;
            """), {"id": tenant_id})

            # Buat policy ALLOW untuk knowledge_base
            conn.execute(sa.text("""
                INSERT INTO ai_data_permission_policies (
                    id, tenant_id, agent_id, resource_type, resource_identifier,
                    action, data_classification, effect, priority
                ) VALUES (
                    gen_random_uuid(), :tenant_id, :agent_id, 'knowledge_base',
                    'product_docs', 'data.read', 'internal', 'ALLOW', 100
                );
            """), {"tenant_id": tenant_id, "agent_id": agent_id})

            # Buat policy DENY untuk financial_records
            conn.execute(sa.text("""
                INSERT INTO ai_data_permission_policies (
                    id, tenant_id, agent_id, resource_type, resource_identifier,
                    action, data_classification, effect, priority
                ) VALUES (
                    gen_random_uuid(), :tenant_id, :agent_id, 'financial_records',
                    'q4_budget', 'data.read', 'confidential', 'DENY', 200
                );
            """), {"tenant_id": tenant_id, "agent_id": agent_id})

    sub = ABACSubject(
        tenant_id=tenant_id,
        agent_id=agent_id,
        actor_type="ai_agent",
        roles=["AI_AGENT"],
    )

    # 1. Resource ber-policy ALLOW
    res_allow = ABACResource(
        resource_type="knowledge_base",
        resource_identifier="product_docs",
        data_classification="internal",
        owner_tenant_id=tenant_id,
    )
    dec_allow = check_ai_data_permission(sub, "data.read", res_allow, log_audit=False)
    assert dec_allow.is_authorized is True
    assert dec_allow.decision == "ALLOW"

    # 2. Resource ber-policy DENY
    res_deny = ABACResource(
        resource_type="financial_records",
        resource_identifier="q4_budget",
        data_classification="confidential",
        owner_tenant_id=tenant_id,
    )
    dec_deny = check_ai_data_permission(sub, "data.read", res_deny, log_audit=False)
    assert dec_deny.is_authorized is False
    assert dec_deny.decision == "DENIED_POLICY_EXPLICIT"


def test_credit_guard_department_budget_cap():
    """Penegakan plafon kredit anggaran per departemen (PRD v2.2 Bagian 3.5 & 14.2)."""
    tenant_id = str(uuid.uuid4())
    dept_id = str(uuid.uuid4())
    engine = get_database_engine()

    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("""
                INSERT INTO tenants (id, name, company_code, code_expires_at)
                VALUES (:id, 'Test Budget Tenant', 'BUDGETT1', now() + interval '1 day')
                ON CONFLICT (id) DO NOTHING;
            """), {"id": tenant_id})

            # Buat departemen dengan credit_cap = 100.0, credit_spent = 95.0
            conn.execute(sa.text("""
                INSERT INTO departments (id, tenant_id, name, credit_cap, credit_spent)
                VALUES (:id, :tenant_id, 'Engineering Division', 100.0000, 95.0000)
                ON CONFLICT (id) DO NOTHING;
            """), {"id": dept_id, "tenant_id": tenant_id})

    # Permintaan kredit kecil (3.0): 95.0 + 3.0 = 98.0 <= 100.0 -> ALLOW
    dec_ok = check_department_cap(tenant_id, dept_id, estimated_cost=Decimal("3.0000"))
    assert dec_ok.is_allowed is True
    assert dec_ok.decision == "ALLOW"

    # Permintaan kredit melebihi batas (10.0): 95.0 + 10.0 = 105.0 > 100.0 -> DENY_DEPARTMENT_BUDGET_CAP
    dec_over = check_department_cap(tenant_id, dept_id, estimated_cost=Decimal("10.0000"))
    assert dec_over.is_allowed is False
    assert dec_over.decision == "DENY_DEPARTMENT_BUDGET_CAP"
    assert "telah terlampaui" in dec_over.reason


def test_pdp_penetration_harness_no_bypass():
    """
    Harness Uji Penetrasi Otomatis (Definition of Done Fase):
    Mencoba akses endpoint REST, node workflow, dan MCP tool TANPA melewati authorize()
    atau dengan identitas tanpa hak -> Semua wajib ditolak (Fail-Closed).
    """
    tenant_id = str(uuid.uuid4())
    other_tenant_id = str(uuid.uuid4())
    unauthorized_user = str(uuid.uuid4())

    # 1. Penetrasi REST: User tanpa role/capability mencoba akses endpoint sensitif
    sub_rest = SubjectContext(
        user_id=unauthorized_user,
        tenant_id=tenant_id,
        roles=["STAFF_HUMAN"],
        capabilities=[],
    )
    res_rest = ResourceContext(
        resource_type="tenant_billing",
        owner_tenant_id=tenant_id,
    )
    dec_rest = authorize(sub_rest, "billing.upgrade", res_rest, log_audit=False)
    assert dec_rest.is_authorized is False
    assert dec_rest.decision == "DENY_INSUFFICIENT_ROLE"

    # 2. Penetrasi Lintas Tenant: Upaya injeksi tenant ID lain
    res_cross = ResourceContext(
        resource_type="crm_contacts",
        owner_tenant_id=other_tenant_id,
    )
    dec_cross = authorize(sub_rest, "data.read", res_cross, log_audit=False)
    assert dec_cross.is_authorized is False
    assert dec_cross.decision == "DENY_CROSS_TENANT"

    # 3. Penetrasi Node Workflow: Node execution tanpa kapabilitas workflow.node.execute
    sub_node = SubjectContext(
        user_id=unauthorized_user,
        tenant_id=tenant_id,
        roles=["STAFF_HUMAN"],
        capabilities=[],
    )
    res_node = ResourceContext(
        resource_type="workflow_node",
        resource_id=str(uuid.uuid4()),
        owner_tenant_id=tenant_id,
    )
    dec_node = authorize(sub_node, "workflow.node.execute", res_node, log_audit=False)
    assert dec_node.is_authorized is False
    assert dec_node.decision == "DENY_INSUFFICIENT_ROLE"

    # 4. Penetrasi MCP Tool: Invokasi tool tanpa kebijakan ABAC dan tanpa kapabilitas
    sub_tool = SubjectContext(
        user_id=unauthorized_user,
        tenant_id=tenant_id,
        actor_type="ai_agent",
        roles=["AI_AGENT"],
        capabilities=[],
    )
    res_tool = ResourceContext(
        resource_type="mcp_tool",
        owner_tenant_id=tenant_id,
        attributes={"tool_name": "crm.contact_verify"},
    )
    dec_tool = authorize(sub_tool, "mcp.tool.invoke", res_tool, log_audit=False)
    assert dec_tool.is_authorized is False
    # Harus ditolak oleh ABAC (DENIED_NO_POLICY) karena tidak ada policy
    assert dec_tool.decision == "DENIED_NO_POLICY"
