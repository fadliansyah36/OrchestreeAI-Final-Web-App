"""AI Job Titles, Structural Roles, Job Levels, Subtitles and Shadow Mapping

Revision ID: 0036_ai_job_titles_and_structural_roles_shadow_mapping
Revises: 0035_specialist_agents_project_health_and_collaboration
Create Date: 2026-09-23 15:30:00.000000

PRD v2.2 Bagian 2.4 (Rekonsiliasi Arsitektur) & Bagian 9.1:
- Tabel ai_structural_roles (is_reference=true)
- Tabel job_levels (is_reference=true)
- Tabel ai_job_titles (15 katalog terstandarisasi, is_reference=true)
- Tabel job_subtitles (is_reference=true)
- Shadow Mapping: Menambahkan kolom job_title_id (NULLABLE) pada ai_agents
- Tabel job_title_mapping_rules & job_title_migration_reports untuk rekonsiliasi audit
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0036_ai_job_titles_and_structural_roles_shadow_mapping"
down_revision: Union[str, None] = "0035_specialist_agents_project_health_and_collaboration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. ai_structural_roles
    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_structural_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        role_code varchar(50) NOT NULL UNIQUE,
        name varchar(100) NOT NULL,
        description text,
        hierarchy_rank int NOT NULL DEFAULT 1,
        is_reference boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 2. job_levels
    op.execute("""
    CREATE TABLE IF NOT EXISTS job_levels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        level_code varchar(20) NOT NULL UNIQUE,
        name varchar(100) NOT NULL,
        description text,
        level_rank int NOT NULL UNIQUE,
        min_complexity_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
        is_reference boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 3. ai_job_titles
    op.execute("""
    CREATE TABLE IF NOT EXISTS ai_job_titles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title_code varchar(100) NOT NULL UNIQUE,
        title_name varchar(150) NOT NULL,
        structural_role_id uuid NOT NULL REFERENCES ai_structural_roles(id) ON DELETE RESTRICT,
        job_level_id uuid NOT NULL REFERENCES job_levels(id) ON DELETE RESTRICT,
        category_tag varchar(100) NOT NULL,
        badge_stars varchar(50) NOT NULL DEFAULT 'Enterprise Ready',
        primary_duties text NOT NULL,
        recommended_tools text[] NOT NULL DEFAULT '{}',
        primary_deliverable text NOT NULL,
        is_reference boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 4. job_subtitles
    op.execute("""
    CREATE TABLE IF NOT EXISTS job_subtitles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_title_id uuid NOT NULL REFERENCES ai_job_titles(id) ON DELETE CASCADE,
        subtitle_code varchar(100) NOT NULL UNIQUE,
        subtitle_name varchar(150) NOT NULL,
        description text,
        focus_areas text[] NOT NULL DEFAULT '{}',
        is_reference boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 5. Shadow Mapping: kolom job_title_id (NULLABLE) pada ai_agents
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'ai_agents'
            AND column_name = 'job_title_id'
        ) THEN
            ALTER TABLE ai_agents ADD COLUMN job_title_id uuid REFERENCES ai_job_titles(id) ON DELETE SET NULL;
        END IF;
    END
    $$;
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_ai_agents_job_title_id ON ai_agents(job_title_id);")

    # 6. job_title_mapping_rules
    op.execute("""
    CREATE TABLE IF NOT EXISTS job_title_mapping_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source_persona_type varchar(100) NOT NULL UNIQUE,
        target_job_title_code varchar(100) REFERENCES ai_job_titles(title_code) ON DELETE SET NULL,
        mapping_confidence varchar(20) NOT NULL CHECK (mapping_confidence IN ('HIGH', 'MEDIUM', 'AMBIGUOUS')),
        requires_manual_review boolean NOT NULL DEFAULT false,
        notes text,
        is_reference boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    """)

    # 7. job_title_migration_reports
    op.execute("""
    CREATE TABLE IF NOT EXISTS job_title_migration_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
        report_batch_id varchar(100) NOT NULL,
        total_agents_audited int NOT NULL DEFAULT 0,
        auto_mapped_count int NOT NULL DEFAULT 0,
        ambiguous_count int NOT NULL DEFAULT 0,
        reconciliation_status varchar(50) NOT NULL DEFAULT 'COMPLETED',
        mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
        summary_notes text,
        generated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_job_title_migration_reports_tenant
        ON job_title_migration_reports(tenant_id, generated_at DESC);
    """)

    # 8. Seed reference data
    op.execute("""
    INSERT INTO ai_structural_roles (role_code, name, description, hierarchy_rank, is_reference) VALUES
        ('ORCHESTRATOR', 'Orchestrator & Coordinator', 'Pusat dekomposisi target pimpinan, delegasi lintas divisi AI, dan sintesis eksekutif', 1, true),
        ('SPECIALIST', 'Domain Specialist Autonomous', 'Spesialis otonom divisi bisnis dengan SOP ketat dan integrasi sistem kerja mendalam', 2, true),
        ('SENTINEL', 'Governance & Risk Sentinel', 'Pengawas kepatuhan SOP, SLA waktu tanggap, penjaga batas guardrails, dan risiko proyek', 2, true),
        ('ANALYST', 'Intelligence & Strategic Analyst', 'Peneliti pasar terstruktur, pemodel keuangan, dan penganalisis performa lintas divisi', 3, true),
        ('OPERATOR', 'Operational Assistant & Knowledge', 'Eksekutor tugas operasional harian, pengarsipan dokumen, dan indeks Company Brain', 4, true)
    ON CONFLICT (role_code) DO NOTHING;

    INSERT INTO job_levels (level_code, name, description, level_rank, min_complexity_multiplier, is_reference) VALUES
        ('L1', 'Principal / Executive Orchestrator', 'Tingkat tertinggi orkestrasi multi-agen dan penghubung utama pimpinan bisnis', 1, 2.50, true),
        ('L2', 'Lead Domain Specialist', 'Pengambil keputusan divisi mandiri, pemodel skenario, dan sintesis strategis', 2, 2.00, true),
        ('L3', 'Autonomous Practitioner', 'Eksekutor alur kerja otonom divisi, penerbit deliverable langsung ke pelanggan/vendor', 3, 1.50, true),
        ('L4', 'Associate Operator & Sentinel', 'Pengawas SLA, verifikasi data masukan, dan pemroses antrean tugas departemen', 4, 1.20, true),
        ('L5', 'Operational Support Worker', 'Pembantu tugas rutin, ekstraksi teks dokumen OCR, dan klasifikasi berkas', 5, 1.00, true)
    ON CONFLICT (level_code) DO NOTHING;

    INSERT INTO ai_job_titles (
        title_code, title_name, structural_role_id, job_level_id, category_tag, badge_stars, primary_duties, recommended_tools, primary_deliverable, is_reference
    ) VALUES
        ('AI_CHIEF_OF_STAFF', 'AI Chief of Staff', (SELECT id FROM ai_structural_roles WHERE role_code = 'ORCHESTRATOR'), (SELECT id FROM job_levels WHERE level_code = 'L1'), 'EXECUTIVE', '5-Star Top Coordinator', 'Dekomposisi target pimpinan, orkestrasi 14 staf AI, dan briefing eksekutif harian', ARRAY['Cross-System DAG', 'Executive Cockpit', 'Company Brain RAG', 'WhatsApp Gateway'], 'Executive Daily Briefing & Alert Eskalasi', true),
        ('AI_COMPANY_INTELLIGENCE', 'AI Company Intelligence', (SELECT id FROM ai_structural_roles WHERE role_code = 'ANALYST'), (SELECT id FROM job_levels WHERE level_code = 'L2'), 'KNOWLEDGE', 'Central Knowledge Master', 'Indeks dokumen SOP, regulasi keselamatan kerja, dan profil korporasi terenkripsi', ARRAY['Vector Database', 'Semantic RAG', 'Document Classifier'], 'Konteks Tunggal Tanpa Halusinasi', true),
        ('AI_OPERATIONS_FLEET', 'AI Operations & Fleet', (SELECT id FROM ai_structural_roles WHERE role_code = 'SPECIALIST'), (SELECT id FROM job_levels WHERE level_code = 'L3'), 'OPERATIONS', 'Operations Orchestrator', 'Monitoring logistik gudang, utilisasi armada logistik, dan kepatuhan alur kerja', ARRAY['WMS API', 'GPS Telematics', 'Route Optimizer'], 'Optimasi Utilisasi Armada & Logistik', true),
        ('AI_FINANCE_CASH_FLOW', 'AI Finance & Cash Flow', (SELECT id FROM ai_structural_roles WHERE role_code = 'SPECIALIST'), (SELECT id FROM job_levels WHERE level_code = 'L2'), 'FINANCE', 'Financial Modeler', 'Rekonsiliasi mutasi bank, audit kepatuhan invoice, dan prediksi arus kas 6 bulan', ARRAY['Accurate', 'BCA/Mandiri API', 'Jurnal Ledger'], 'Rekonsiliasi Kas 500+ Invoice per Menit', true),
        ('AI_PROCUREMENT_VENDOR', 'AI Procurement & Vendor', (SELECT id FROM ai_structural_roles WHERE role_code = 'SPECIALIST'), (SELECT id FROM job_levels WHERE level_code = 'L3'), 'SUPPLY_CHAIN', 'Supply Chain Specialist', 'Perbandingan komparasi penawaran vendor, verifikasi dokumen legalitas, dan draf Purchase Order', ARRAY['ERP SAP', 'Vendor Portal', 'Price Indexer'], 'Evaluasi Hemat Biaya Pengadaan & Draf PO', true),
        ('AI_SALES_DEAL_CLOSER', 'AI Sales & Deal Closer', (SELECT id FROM ai_structural_roles WHERE role_code = 'SPECIALIST'), (SELECT id FROM job_levels WHERE level_code = 'L3'), 'SALES', 'Revenue Specialist', 'Kualifikasi prospek masuk B2B, penerbitan draf kontrak resmi, dan follow-up deal berkecepatan tinggi', ARRAY['WhatsApp API', 'HubSpot CRM', 'PDF Quotation Engine'], 'Kualifikasi Prospek BANT dalam 3 Detik', true),
        ('AI_HR_PEOPLE_OPS', 'AI HR & People Ops', (SELECT id FROM ai_structural_roles WHERE role_code = 'SPECIALIST'), (SELECT id FROM job_levels WHERE level_code = 'L3'), 'HR', 'Talent & Compliance', 'Screening CV kandidat berbasis rubrik objektif, tracking absensi, dan FAQ SOP internal', ARRAY['Talent ATS', 'Attendance Vault', 'Employee WA Portal'], 'Penyaringan Kandidat & Monitoring Tim', true),
        ('AI_CUSTOMER_SUCCESS', 'AI Customer Success', (SELECT id FROM ai_structural_roles WHERE role_code = 'SPECIALIST'), (SELECT id FROM job_levels WHERE level_code = 'L3'), 'CUSTOMER_SERVICE', 'Retention & SLA Sentinel', 'Monitoring tiket kendala, mitigasi churn pelanggan korporasi, dan resolusi komplain', ARRAY['Zendesk API', 'WhatsApp Support', 'Ticket Router'], 'Respon Masalah Kritis di Bawah 1 Menit', true),
        ('AI_PROJECT_MILESTONES', 'AI Project & Milestones', (SELECT id FROM ai_structural_roles WHERE role_code = 'SENTINEL'), (SELECT id FROM job_levels WHERE level_code = 'L2'), 'PROJECT_MANAGEMENT', 'Project Governance', 'Pelacak milestone proyek, deteksi keterlambatan subkontraktor, dan mitigasi risiko jadwal', ARRAY['Microsoft Project API', 'Jira', 'Trello API'], 'Early Warning Keterlambatan Proyek', true),
        ('AI_MARKETING_BRANDING', 'AI Marketing & Branding', (SELECT id FROM ai_structural_roles WHERE role_code = 'SPECIALIST'), (SELECT id FROM job_levels WHERE level_code = 'L3'), 'MARKETING', 'Creative Specialist', 'Penyusunan naskah konten promosi, audit kepatuhan brand kit, dan sebaran media kampanye', ARRAY['Brand Kit Vault', 'Meta API', 'Content Scheduler'], 'Penerbitan Konten Terjadwal Multi-Platform', true),
        ('AI_CRM_LIFECYCLE', 'AI CRM & Customer Lifecycle', (SELECT id FROM ai_structural_roles WHERE role_code = 'SPECIALIST'), (SELECT id FROM job_levels WHERE level_code = 'L3'), 'SALES', 'Lifecycle Specialist', 'Segmentasi pelanggan, prediksi repeat order, dan penjadwalan re-engagement otomatis', ARRAY['CRM Database', 'LTV Calculator', 'Email Gateway'], 'Peningkatan Retensi & Nilai Transaksi', true),
        ('AI_TASK_WORKFLOW', 'AI Task & Workflow', (SELECT id FROM ai_structural_roles WHERE role_code = 'SENTINEL'), (SELECT id FROM job_levels WHERE level_code = 'L4'), 'OPERATIONS', 'SLA Sentinel', 'Delegasi tiket pekerjaan, pengingat tenggat waktu otomatis, dan pelaporan hambatan operasional', ARRAY['Kanban Engine', 'Notification Bus', 'Escalation Timer'], 'Nol Tiket Pekerjaan Terbengkalai', true),
        ('AI_KNOWLEDGE_DOCUMENT', 'AI Knowledge & Document', (SELECT id FROM ai_structural_roles WHERE role_code = 'OPERATOR'), (SELECT id FROM job_levels WHERE level_code = 'L4'), 'KNOWLEDGE', 'Document Archiver', 'Ekstraksi dokumen faktur scan, klasifikasi arsip legalitas, dan pencarian cepat terindeks', ARRAY['OCR Vision API', 'Document Vault', 'Audit Log'], 'Pencarian Dokumen Kontrak Instan', true),
        ('AI_RESEARCH_INTELLIGENCE', 'AI Research & Intelligence', (SELECT id FROM ai_structural_roles WHERE role_code = 'ANALYST'), (SELECT id FROM job_levels WHERE level_code = 'L2'), 'ANALYTICS', 'Market Strategist', 'Riset regulasi industri baru, pergerakan kompetitor, dan komparasi harga pasar terpercaya', ARRAY['Web Intelligence API', 'Market Reports', 'Summarizer'], 'Briefing Tren Bisnis & Regulasi Baru', true),
        ('AI_REPORTING_BI_ANALYST', 'AI Reporting & BI Analyst', (SELECT id FROM ai_structural_roles WHERE role_code = 'ANALYST'), (SELECT id FROM job_levels WHERE level_code = 'L2'), 'ANALYTICS', 'Analytics Specialist', 'Sintesis metrik lintas departemen menjadi ringkasan grafik untuk jajaran direksi', ARRAY['BigQuery', 'Looker Studio', 'Executive KPI Engine'], 'Dashboard Kinerja Harian Real-Time', true)
    ON CONFLICT (title_code) DO NOTHING;

    INSERT INTO job_title_mapping_rules (
        source_persona_type, target_job_title_code, mapping_confidence, requires_manual_review, notes, is_reference
    ) VALUES
        ('chief_of_staff', 'AI_CHIEF_OF_STAFF', 'HIGH', false, 'Pemetaan otomatis langsung ke AI Chief of Staff', true),
        ('CHIEF_OF_STAFF', 'AI_CHIEF_OF_STAFF', 'HIGH', false, 'Pemetaan otomatis kapital langsung ke AI Chief of Staff', true),
        ('market_intelligence', 'AI_RESEARCH_INTELLIGENCE', 'HIGH', false, 'Pemetaan persona riset pasar ke AI Research & Intelligence', true),
        ('researcher_agent', 'AI_COMPANY_INTELLIGENCE', 'HIGH', false, 'Pemetaan agen riset dokumen ke AI Company Intelligence', true),
        ('COMPETITOR_ANALYST', 'AI_RESEARCH_INTELLIGENCE', 'HIGH', false, 'Pemetaan analis kompetitor ke AI Research & Intelligence', true),
        ('sales_agent', 'AI_SALES_DEAL_CLOSER', 'HIGH', false, 'Pemetaan agen penjualan ke AI Sales & Deal Closer', true),
        ('sales_specialist', 'AI_SALES_DEAL_CLOSER', 'HIGH', false, 'Pemetaan spesialis penjualan ke AI Sales & Deal Closer', true),
        ('CLOSER', 'AI_SALES_DEAL_CLOSER', 'HIGH', false, 'Pemetaan closer ke AI Sales & Deal Closer', true),
        ('QUALIFIER', 'AI_SALES_DEAL_CLOSER', 'HIGH', false, 'Pemetaan lead qualifier ke AI Sales & Deal Closer (sub-spesialisasi Inbound Qualifier)', true),
        ('marketing_agent', 'AI_MARKETING_BRANDING', 'HIGH', false, 'Pemetaan agen pemasaran ke AI Marketing & Branding', true),
        ('campaign_builder', 'AI_MARKETING_BRANDING', 'HIGH', false, 'Pemetaan perancang kampanye ke AI Marketing & Branding', true),
        ('cfo_agent', 'AI_FINANCE_CASH_FLOW', 'HIGH', false, 'Pemetaan CFO agent ke AI Finance & Cash Flow', true),
        ('finance_specialist', 'AI_FINANCE_CASH_FLOW', 'HIGH', false, 'Pemetaan spesialis keuangan ke AI Finance & Cash Flow', true),
        ('hr_agent', 'AI_HR_PEOPLE_OPS', 'HIGH', false, 'Pemetaan agen HR ke AI HR & People Ops', true),
        ('hr_specialist', 'AI_HR_PEOPLE_OPS', 'HIGH', false, 'Pemetaan spesialis personalia ke AI HR & People Ops', true),
        ('support_agent', 'AI_CUSTOMER_SUCCESS', 'HIGH', false, 'Pemetaan staf dukungan ke AI Customer Success', true),
        ('service_agent', 'AI_CUSTOMER_SUCCESS', 'HIGH', false, 'Pemetaan staf layanan ke AI Customer Success', true),
        ('ops_agent', 'AI_OPERATIONS_FLEET', 'HIGH', false, 'Pemetaan agen operasional ke AI Operations & Fleet', true),
        ('operations_specialist', 'AI_OPERATIONS_FLEET', 'HIGH', false, 'Pemetaan spesialis operasional ke AI Operations & Fleet', true),
        ('project_agent', 'AI_PROJECT_MILESTONES', 'HIGH', false, 'Pemetaan agen proyek ke AI Project & Milestones', true),
        ('crm_agent', 'AI_CRM_LIFECYCLE', 'HIGH', false, 'Pemetaan agen CRM ke AI CRM & Customer Lifecycle', true),
        ('task_agent', 'AI_TASK_WORKFLOW', 'HIGH', false, 'Pemetaan agen tugas workflow ke AI Task & Workflow', true),
        ('document_agent', 'AI_KNOWLEDGE_DOCUMENT', 'HIGH', false, 'Pemetaan agen dokumen ke AI Knowledge & Document', true),
        ('reporting_agent', 'AI_REPORTING_BI_ANALYST', 'HIGH', false, 'Pemetaan analis pelaporan ke AI Reporting & BI Analyst', true),
        ('general_assistant', NULL, 'AMBIGUOUS', true, 'Persona ambigu tidak memiliki domain divisi khusus; butuh keputusan penugasan manual', true),
        ('custom_agent', NULL, 'AMBIGUOUS', true, 'Persona kustom tidak terdaftar dalam ontologi resmi; butuh telaah manual oleh admin', true),
        ('unspecified', NULL, 'AMBIGUOUS', true, 'Persona belum dikonfigurasi saat pembuatan; butuh penetapan manual', true)
    ON CONFLICT (source_persona_type) DO NOTHING;
    """)

    # 9. RLS & Grants
    op.execute("""
    ALTER TABLE ai_structural_roles DISABLE ROW LEVEL SECURITY;
    ALTER TABLE job_levels DISABLE ROW LEVEL SECURITY;
    ALTER TABLE ai_job_titles DISABLE ROW LEVEL SECURITY;
    ALTER TABLE job_subtitles DISABLE ROW LEVEL SECURITY;
    ALTER TABLE job_title_mapping_rules DISABLE ROW LEVEL SECURITY;

    GRANT SELECT ON ai_structural_roles TO orchestree_app;
    GRANT SELECT ON job_levels TO orchestree_app;
    GRANT SELECT ON ai_job_titles TO orchestree_app;
    GRANT SELECT ON job_subtitles TO orchestree_app;
    GRANT SELECT ON job_title_mapping_rules TO orchestree_app;

    ALTER TABLE job_title_migration_reports ENABLE ROW LEVEL SECURITY;
    ALTER TABLE job_title_migration_reports FORCE ROW LEVEL SECURITY;

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
            AND tablename = 'job_title_migration_reports'
            AND policyname = 'job_title_migration_reports_isolation'
        ) THEN
            CREATE POLICY job_title_migration_reports_isolation ON job_title_migration_reports
                USING (
                    tenant_id IS NULL OR
                    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                )
                WITH CHECK (
                    tenant_id IS NULL OR
                    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                );
        END IF;
    END
    $$;

    GRANT SELECT, INSERT, UPDATE, DELETE ON job_title_migration_reports TO orchestree_app;
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS job_title_migration_reports_isolation ON job_title_migration_reports;")
    op.execute("DROP TABLE IF EXISTS job_title_migration_reports CASCADE;")
    op.execute("DROP TABLE IF EXISTS job_title_mapping_rules CASCADE;")
    op.execute("DROP INDEX IF EXISTS idx_ai_agents_job_title_id;")
    op.execute("ALTER TABLE ai_agents DROP COLUMN IF EXISTS job_title_id;")
    op.execute("DROP TABLE IF EXISTS job_subtitles CASCADE;")
    op.execute("DROP TABLE IF EXISTS ai_job_titles CASCADE;")
    op.execute("DROP TABLE IF EXISTS job_levels CASCADE;")
    op.execute("DROP TABLE IF EXISTS ai_structural_roles CASCADE;")
