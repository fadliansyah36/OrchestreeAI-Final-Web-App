# PHASE 02 — Authentication & Identity Security
Date: 2026-09-29
Branch: main
Immutable rollback: baseline/phase-00-2026-09-29

## Scope
Hardening follows AGENTS.md and PRD v2.2. Authentication authority remains Supabase Auth. Authorization attributes are resolved server-side from database membership/roles/capabilities. No client-controlled identity, role, capability, or MFA header is trusted.

## Implemented
1. Replaced payload-only JWT decoding with cryptographic Supabase JWKS verification.
   - Signature verification: RS256 / ES256 / ES384 / ES512
   - issuer validation
   - audience validation
   - exp / nbf validation
   - kid/JWKS key selection and rotation refresh
2. Removed production acceptance of harness JWTs. Harness tokens are available only for explicit test environment opt-in.
3. Removed X-User-Roles, X-User-Capabilities and X-MFA-Verified as authorization authorities.
4. Tenant context is derived from verified JWT sub + active tenant_memberships + user_roles.
5. X-Tenant-Id is treated only as a tenant selector and is accepted only after membership verification.
6. Super Admin requires verified Supabase JWT, AAL2 MFA and a database role of SUPER_ADMIN (legacy platform role names remain non-authoritative).
7. Added persistent auth_revoked_tokens migration; logout writes token hashes to Postgres.
8. Added secure login/signup/refresh/session/logout endpoints. Access and refresh tokens are HttpOnly cookies; access token is never returned to browser JavaScript.
9. Removed browser localStorage access-token handling from the authentication UI.
10. Tenant registration and staff join no longer accept client-generated auth_user_id values; backend binds identity to verified session sub.
11. Removed hardcoded storage signing secret fallback.
12. Added regression tests for valid signatures, tampering, expiration and production harness-token rejection.
13. Added CI verification workflow for authentication security and PWA builds.

## Verification status
GitHub Actions workflows were triggered on main, but the GitHub-hosted jobs terminate within approximately two seconds with zero executable steps exposed by the connected GitHub API. The failed runs therefore do not provide a valid application build/test result.

This is an execution-environment/Actions-runner verification blocker, not a passing build. No claim of production runtime success is made until the workflow executes its actual steps.

## Required next verification
- Execute the PHASE 02 workflow on an available GitHub-hosted/self-hosted runner.
- Confirm backend JWT tests pass.
- Confirm client/admin type-check and production builds pass.
- Run against the real Supabase project with real Auth credentials.
- Verify login -> HttpOnly session -> tenant membership -> logout/revocation.
- Verify Super Admin requires AAL2 and server-side SUPER_ADMIN role.
- Verify cross-tenant access is denied.

## Rollback
Do not modify baseline/phase-00-2026-09-29. It remains the immutable rollback point.
