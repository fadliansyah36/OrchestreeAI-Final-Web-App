-- ==============================================================================
-- Migration: Enforce Lowercase & Valid Status on Tenants (PRD v2.2 Bagian 15.3 & Hub Overview)
-- ==============================================================================

-- 1. Normalisasi data eksisting menjadi lowercase murni
UPDATE public.tenants
SET status = LOWER(TRIM(status))
WHERE status IS NOT NULL;

-- 2. Hapus constraint lama jika ada
ALTER TABLE public.tenants
DROP CONSTRAINT IF EXISTS ck_tenants_status_lowercase;

ALTER TABLE public.tenants
DROP CONSTRAINT IF EXISTS ck_tenants_status_valid;

-- 3. Tambahkan constraint status lowercase dan nilai valid
ALTER TABLE public.tenants
ADD CONSTRAINT ck_tenants_status_lowercase
CHECK (status = LOWER(status));

ALTER TABLE public.tenants
ADD CONSTRAINT ck_tenants_status_valid
CHECK (status IN ('trial', 'active', 'suspended', 'churned'));
