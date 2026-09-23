-- Migration: 20260923000004_data_quality_issues_and_confidence.sql
-- Description: Create data_quality_issues table with 5-state data availability, conflict marking, and RLS

CREATE TABLE IF NOT EXISTS public.data_quality_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    field_name VARCHAR(64) NOT NULL,
    issue_type VARCHAR(48) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
    availability_state VARCHAR(24) NOT NULL,
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
    sources_involved JSONB NOT NULL DEFAULT '[]'::jsonb,
    conflict_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_auto_selection_prevented BOOLEAN NOT NULL DEFAULT TRUE,
    requires_human_resolution BOOLEAN NOT NULL DEFAULT TRUE,
    resolution_status VARCHAR(24) NOT NULL DEFAULT 'UNRESOLVED',
    resolved_by VARCHAR(128),
    resolved_at TIMESTAMPTZ,
    resolution_source_chosen VARCHAR(128),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tenant and status queries
CREATE INDEX IF NOT EXISTS idx_data_quality_issues_tenant_status 
ON public.data_quality_issues(tenant_id, resolution_status);

CREATE INDEX IF NOT EXISTS idx_data_quality_issues_entity 
ON public.data_quality_issues(tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_data_quality_issues_availability 
ON public.data_quality_issues(tenant_id, availability_state);

-- Enable RLS
ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
DROP POLICY IF EXISTS data_quality_issues_tenant_isolation ON public.data_quality_issues;
CREATE POLICY data_quality_issues_tenant_isolation ON public.data_quality_issues
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR tenant_id = NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid
        OR current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
        OR current_user IN ('postgres', 'service_role')
    );
