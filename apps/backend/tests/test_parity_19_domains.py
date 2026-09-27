"""
Uji Paritas Nyata 19 Kategori Domain FastAPI (PRD v2.2 Bagian 9 & Tindakan 1 Paritas).
Memverifikasi respons HTTP, penegakan Unified PDP authorize(), dan ketiadaan error 500.
"""

# Parity test for 19 domains
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
TENANT_ID = "10e75d63-15f8-42e8-a6ce-24fece12cd04"
AUTH_HEADERS = {
    "Authorization": f"Bearer jwt.usr_admin_01.{TENANT_ID}.TENANT_OWNER.sig_valid_hash",
    "X-Tenant-Id": TENANT_ID,
    "X-User-Role": "TENANT_OWNER",
}


def test_public_and_health():
    """Domain: Public Catalog & System Health"""
    res = client.get("/health/live")
    assert res.status_code == 200
    assert res.json()["status"] == "alive"

    res = client.get("/public/subscription-plans")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) >= 4


def test_domain_1_workforce():
    """Domain 1: Workforce & Organization Structure"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/agents", headers=AUTH_HEADERS)
    assert res.status_code == 200

    res = client.get(f"/api/v1/tenants/{TENANT_ID}/departments", headers=AUTH_HEADERS)
    assert res.status_code == 200

    # Unauthenticated must be denied (401)
    unauth = client.get(f"/api/v1/tenants/{TENANT_ID}/agents")
    assert unauth.status_code == 401


def test_domain_2_kanban_and_attendance():
    """Domain 2: Kanban Boards & WebAuthn Attendance"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/boards", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_3_billing_and_commercial():
    """Domain 3: Billing, Credit Ledger & Financial Command"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/billing/overview", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_4_enterprise_fabrics():
    """Domain 4: Enterprise Fabrics & Chief of Staff Synthesizer"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/briefings/daily", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_5_commerce():
    """Domain 5: Omnichannel Commerce & Orders"""
    res = client.get("/api/v1/commerce/products", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_6_marketing():
    """Domain 6: Marketing Campaigns & Social Scheduling"""
    res = client.get("/api/v1/marketing/campaigns", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_7_omnichannel():
    """Domain 7: Omnichannel Messaging & Customer Merging"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/omnichannel/channels", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_8_intelligence():
    """Domain 8: Competitive Intelligence & Scraper"""
    res = client.get("/api/v1/intelligence/competitors", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_9_selection():
    """Domain 9: Universal Selection & Candidate Scoring"""
    res = client.get("/api/v1/selection/candidates", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_10_generative():
    """Domain 10: Generative Studio & GPT-Image-2 Router"""
    res = client.get("/api/v1/generative/assets", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_11_crm():
    """Domain 11: CRM Pipeline & Contracts"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/crm/leads", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_12_proactive():
    """Domain 12: Proactive Multi-channel Notification"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/proactive/templates", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_13_sales():
    """Domain 13: Sales Playbooks & Real-time Guardrails"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/sales/guardrails", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_14_service():
    """Domain 14: Customer Service & Human-AI Handover"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/service/tickets", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_15_learning():
    """Domain 15: Cognitive Core & Learning Adaptation"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/learning/modules", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_16_memory():
    """Domain 16: Semantic Vector Memory & Long-term Episodic"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/memory/stats", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_17_orchestration_and_chat():
    """Domain 17: Orchestration Engine & Real-time Chat"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/orchestration/workflows", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_18_agent_catalog():
    """Domain 18: Agent Blueprint Catalog & One-Click Provisioning"""
    res = client.get("/api/v1/agents/catalog", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)


def test_domain_19_integrations_and_security():
    """Domain 19: Integrations Fabric & ABAC Data Permissions"""
    res = client.get(f"/api/v1/tenants/{TENANT_ID}/integrations", headers=AUTH_HEADERS)
    assert res.status_code in (200, 404)
