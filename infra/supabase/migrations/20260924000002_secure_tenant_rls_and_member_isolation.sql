-- ==============================================================================
-- OrchestreeAI Migration: 20260924000002_secure_tenant_rls_and_member_isolation.sql
-- Description: Strict isolation and zero pre-auth leak for tenants and memberships
-- ==============================================================================

-- 1. Pastikan Row-Level Security aktif dan FORCE
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;

-- 2. Kebijakan RLS tenants
DROP POLICY IF EXISTS tenant_readable_by_member ON tenants;
DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
DROP POLICY IF EXISTS tenant_write_by_context ON tenants;

CREATE POLICY tenant_readable_by_member ON tenants
    FOR SELECT
    USING (
        id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE auth_user_id = auth.uid()
        )
        OR (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    );

CREATE POLICY tenant_write_by_context ON tenants
    FOR ALL
    USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    );

-- 3. Kebijakan RLS tenant_memberships
DROP POLICY IF EXISTS membership_readable_by_user ON tenant_memberships;
DROP POLICY IF EXISTS tenant_isolation_memberships ON tenant_memberships;
DROP POLICY IF EXISTS tenant_isolation ON tenant_memberships;
DROP POLICY IF EXISTS membership_write_by_context ON tenant_memberships;

CREATE POLICY membership_readable_by_user ON tenant_memberships
    FOR SELECT
    USING (
        auth_user_id = auth.uid()
        OR (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    );

CREATE POLICY membership_write_by_context ON tenant_memberships
    FOR ALL
    USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    );

-- 4. Kebijakan RLS tenant_subscriptions
DROP POLICY IF EXISTS subscription_readable_by_member ON tenant_subscriptions;
DROP POLICY IF EXISTS tenant_isolation_subscriptions ON tenant_subscriptions;
DROP POLICY IF EXISTS tenant_isolation ON tenant_subscriptions;
DROP POLICY IF EXISTS subscription_write_by_context ON tenant_subscriptions;

CREATE POLICY subscription_readable_by_member ON tenant_subscriptions
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE auth_user_id = auth.uid()
        )
        OR (
            NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
            AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
    );

CREATE POLICY subscription_write_by_context ON tenant_subscriptions
    FOR ALL
    USING (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    WITH CHECK (
        NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    );
