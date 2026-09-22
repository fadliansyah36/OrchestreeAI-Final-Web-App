# OrchestreeAI Super Admin Web Dashboard

A dedicated, enterprise-grade Web Dashboard for **OrchestreeAI Platform Super Administrators**.

Built as a decoupled client communicating with the centralized Ktor Backend Server (`orchestreeai-backend-server`) via REST APIs, enforcing multi-factor authentication (MFA) and strict role-based access control (RBAC).

---

## Architecture Highlights
- **Design System**: M3 Design Tokens aligned with Fase 64.A (`#090d16` deep dark canvas, emerald accents, elevated containers).
- **Authentication**: Supabase Auth with Mandatory 6-Digit TOTP Multi-Factor Authentication (MFA).
- **Fail-Closed RBAC**: Only users with `role: 'SUPER_ADMIN'` and verified MFA sessions can access the dashboard. Non-superadmin users are completely denied.
- **Single Source of Truth**: Connects directly to `orchestreeai-backend-server` REST API routes (`/api/v1/admin/*`).

---

## Implemented Screens & Feature Matrix

1. **`LoginScreen`**: Dual-step Super Admin login with TOTP MFA input.
2. **`DashboardOverviewScreen`**: Real-time platform analytics, LLM router health, SLA status.
3. **`TenantManagementScreen`**: Multi-tenant database provisioning, tier assignments (`STARTER`, `GROWTH`, `ENTERPRISE`), user & autonomous agent quotas.
4. **`LlmProviderManagementScreen` (Fase 93.A)**: Failover sequence, latency tracking (OpenRouter, Groq, DeepSeek, Apimart).
5. **`McpToolRegistryManagementScreen` (Fase 93.B)**: Model Context Protocol sandbox registry, risk levels (`LOW` to `CRITICAL`), RBAC assignment.
6. **`ThirdPartyAppRegistryManagementScreen` (Fase 93.C)**: OAuth client registration for ERP (SAP), CRM (Salesforce), Marketplaces (Tokopedia).
7. **`MasterDataManagementScreen` (Fase 91)**: Industry preset templates, default roles, system prompt guardrails.
8. **`SkillPluginManagementScreen` (Fase 92.C)**: WASM, JVM Native, and Python worker plugin approval workflows.
9. **`UsageCostDashboardScreen` (PRD 15.1, 25.6)**: Real-time MTD token telemetry, USD cost tracking, per-tenant margin analysis.
10. **`SecurityAuditCenterScreen`**: Immutable audit logs, ABAC violation blocking, IP tracking.

---

## Running Locally

```bash
cd orchestreeai-admin-dashboard
npm install
npm run dev
```
