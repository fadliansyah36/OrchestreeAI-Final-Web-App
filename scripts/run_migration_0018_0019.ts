import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || (process.env.DATABASE_URL || '');

async function runMigration0018And0019() {
  console.log('🔄 Memulai eksekusi migrasi DDL 0018 & 0019 (Omnichannel, Persona Handoff, Leads, Qualification, Lead Scoring)...');
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    console.log('✅ Terhubung ke database PostgreSQL.');

    await client.query('BEGIN');

    // ==========================================
    // 1. DDL MIGRATION 0018 (OMNICHANNEL & CONVERSATIONS)
    // ==========================================
    console.log('📦 Menjalankan DDL 0018 (customers, channel_accounts, conversations, handovers)...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          primary_name text,
          primary_phone text,
          primary_email text,
          avatar_url text,
          status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'ARCHIVED')),
          lifecycle_stage text NOT NULL DEFAULT 'LEAD' CHECK (lifecycle_stage IN ('LEAD', 'PROSPECT', 'CUSTOMER', 'CHURNED')),
          total_spent numeric(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_spent >= 0),
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_phone 
          ON customers(tenant_id, primary_phone) 
          WHERE primary_phone IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_customers_tenant_email 
          ON customers(tenant_id, primary_email) 
          WHERE primary_email IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_customers_tenant_lifecycle 
          ON customers(tenant_id, lifecycle_stage);

      CREATE TABLE IF NOT EXISTS channel_accounts (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          channel_type text NOT NULL CHECK (channel_type IN ('telegram_mtproto', 'whatsapp_cloud', 'instagram', 'facebook', 'tiktok')),
          connection_mode text NOT NULL CHECK (connection_mode IN ('official_business_api', 'mtproto_qr', 'platform_oauth')),
          account_label text NOT NULL,
          external_identifier text NOT NULL,
          external_identifier_hash text NOT NULL,
          credential_ref text,
          department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
          status text NOT NULL DEFAULT 'PENDING_SETUP' CHECK (status IN ('PENDING_SETUP', 'ACTIVE', 'ERROR', 'REVOKED', 'SUSPENDED')),
          created_by_membership_id uuid,
          requires_owner_approval boolean NOT NULL DEFAULT false,
          is_approved boolean NOT NULL DEFAULT true,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_channel_accounts_tenant_channel_identifier UNIQUE (tenant_id, channel_type, external_identifier_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_channel_accounts_tenant_status 
          ON channel_accounts(tenant_id, status);

      CREATE TABLE IF NOT EXISTS customer_channel_identities (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          channel_account_id uuid REFERENCES channel_accounts(id) ON DELETE SET NULL,
          channel_type text NOT NULL,
          external_user_id text NOT NULL,
          external_username text,
          display_name text,
          phone_number text,
          verification_level text NOT NULL DEFAULT 'WEAK' CHECK (verification_level IN ('WEAK', 'VERIFIED_OTP', 'STRONG_DOCUMENT')),
          raw_profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
          last_active_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_cust_channel_identities UNIQUE (tenant_id, channel_type, external_user_id)
      );

      CREATE TABLE IF NOT EXISTS customer_attributes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          attribute_key text NOT NULL,
          attribute_value text NOT NULL,
          value_type text NOT NULL DEFAULT 'STRING' CHECK (value_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON')),
          confidence numeric(4, 3) NOT NULL DEFAULT 1.000,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_cust_attributes UNIQUE (tenant_id, customer_id, attribute_key)
      );

      CREATE TABLE IF NOT EXISTS customer_segments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          segment_name text NOT NULL,
          criteria_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
          description text,
          member_count integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS customer_funnel_state (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          current_stage text NOT NULL DEFAULT 'AWARENESS' CHECK (current_stage IN ('AWARENESS', 'INTEREST', 'DECISION', 'ACTION', 'RETENTION')),
          entered_stage_at timestamptz NOT NULL DEFAULT now(),
          previous_stage text,
          stage_transition_reason text,
          stage_history jsonb NOT NULL DEFAULT '[]'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_cust_funnel_state UNIQUE (tenant_id, customer_id)
      );

      CREATE TABLE IF NOT EXISTS customer_merge_log (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          source_customer_id uuid NOT NULL,
          target_customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          merge_reason text NOT NULL,
          snapshot_source_data jsonb NOT NULL,
          merged_by_user_id uuid,
          is_reverted boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          reverted_at timestamptz
      );

      CREATE TABLE IF NOT EXISTS channel_account_permissions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
          role_or_membership_id uuid NOT NULL,
          can_read boolean NOT NULL DEFAULT true,
          can_send boolean NOT NULL DEFAULT true,
          can_manage boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_channel_acc_perm UNIQUE (tenant_id, channel_account_id, role_or_membership_id)
      );

      CREATE TABLE IF NOT EXISTS channel_account_persona_assignments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
          ai_persona_id uuid NOT NULL,
          is_default boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_channel_acc_persona UNIQUE (tenant_id, channel_account_id, ai_persona_id)
      );

      CREATE TABLE IF NOT EXISTS channel_account_usage_ledger (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
          direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
          message_id text,
          credit_deducted numeric(10, 4) NOT NULL DEFAULT 0.0000,
          wallet_transaction_id uuid,
          created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS mtproto_sessions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
          session_string text,
          session_key_id text NOT NULL,
          api_id_ref text NOT NULL,
          device_model text NOT NULL DEFAULT 'OrchestreeAI Server',
          last_authorized_at timestamptz,
          status text NOT NULL DEFAULT 'qr_pending' CHECK (status IN ('qr_pending', 'authorized', 'revoked', 'error')),
          qr_token text,
          qr_expires_at timestamptz,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_mtproto_sessions_channel_account UNIQUE (channel_account_id)
      );

      CREATE TABLE IF NOT EXISTS conversations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          channel_account_id uuid NOT NULL REFERENCES channel_accounts(id) ON DELETE CASCADE,
          customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          customer_channel_identity_id uuid REFERENCES customer_channel_identities(id) ON DELETE SET NULL,
          status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PENDING_STAFF', 'RESOLVED', 'CLOSED')),
          assigned_agent_id uuid,
          assigned_type text NOT NULL DEFAULT 'AI' CHECK (assigned_type IN ('AI', 'HUMAN')),
          channel_thread_id text,
          last_message_preview text,
          last_message_at timestamptz NOT NULL DEFAULT now(),
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON conversations(tenant_id, status, last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);

      CREATE TABLE IF NOT EXISTS conversation_messages (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
          sender_type text NOT NULL CHECK (sender_type IN ('CUSTOMER', 'AI_AGENT', 'HUMAN_STAFF', 'SYSTEM')),
          sender_identifier text,
          content_text text NOT NULL,
          media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
          external_message_id text,
          delivery_status text NOT NULL DEFAULT 'SENT' CHECK (delivery_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
          raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_created ON conversation_messages(conversation_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_conv_messages_tenant ON conversation_messages(tenant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS conversation_intents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          intent_name text NOT NULL,
          confidence numeric(4, 3) NOT NULL,
          extracted_entities jsonb NOT NULL DEFAULT '{}'::jsonb,
          detected_by text NOT NULL DEFAULT 'MODEL_ROUTER',
          created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS conversation_handovers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          from_agent_type text NOT NULL DEFAULT 'AI',
          to_agent_type text NOT NULL DEFAULT 'HUMAN',
          handover_reason text NOT NULL,
          summary_context text,
          assigned_to_user_id uuid,
          status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'ACCEPTED', 'REJECTED', 'RESOLVED')),
          created_at timestamptz NOT NULL DEFAULT now(),
          resolved_at timestamptz
      );

      CREATE INDEX IF NOT EXISTS idx_conv_handovers_tenant_status ON conversation_handovers(tenant_id, status);
    `);

    // Enable and force RLS on 0018 tables
    const tables0018 = [
      'customers',
      'channel_accounts',
      'customer_channel_identities',
      'customer_attributes',
      'customer_segments',
      'customer_funnel_state',
      'customer_merge_log',
      'channel_account_permissions',
      'channel_account_persona_assignments',
      'channel_account_usage_ledger',
      'mtproto_sessions',
      'conversations',
      'conversation_messages',
      'conversation_intents',
      'conversation_handovers',
    ];

    for (const tbl of tables0018) {
      await client.query(`
        ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON ${tbl};
        CREATE POLICY tenant_isolation_policy ON ${tbl}
            FOR ALL
            USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
      `);
    }

    // ==========================================
    // 2. DDL MIGRATION 0019 (PERSONA CONFIG, HANDOFF RULES, LEADS, QUALIFICATION, SCORE HISTORY)
    // ==========================================
    console.log('📦 Menjalankan DDL 0019 (ai_agents persona_config, persona_handoff_rules, leads, qualification, score history)...');

    // 2.1 Perluas ai_agents dengan persona_config jsonb
    await client.query(`
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS persona_config jsonb NOT NULL DEFAULT '{}'::jsonb;
    `);

    // 2.2 Tabel persona_handoff_rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS persona_handoff_rules (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          source_persona_type text NOT NULL,
          target_persona_type text NOT NULL,
          condition_type text NOT NULL CHECK (condition_type IN ('LEAD_SCORE_THRESHOLD', 'INTENT_MATCH', 'MANUAL_REQUEST', 'STAGE_CHANGE', 'UNANSWERED_THRESHOLD')),
          condition_config jsonb NOT NULL DEFAULT '{}'::jsonb,
          priority integer NOT NULL DEFAULT 100,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_persona_handoff_rule UNIQUE (tenant_id, source_persona_type, target_persona_type, condition_type)
      );

      CREATE INDEX IF NOT EXISTS idx_persona_handoff_tenant_active 
          ON persona_handoff_rules(tenant_id, is_active, priority ASC);
    `);

    // 2.3 Tabel leads
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
          title text NOT NULL,
          company_name text,
          contact_name text NOT NULL,
          contact_phone text,
          contact_email text,
          stage text NOT NULL DEFAULT 'NEW' CHECK (stage IN ('NEW', 'CONTACTED', 'QUALIFYING', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST')),
          funnel_stage text NOT NULL DEFAULT 'AWARENESS' CHECK (funnel_stage IN ('AWARENESS', 'INTEREST', 'DECISION', 'ACTION', 'RETENTION')),
          lead_score numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (lead_score >= 0.00 AND lead_score <= 100.00),
          temperature text NOT NULL DEFAULT 'COLD' CHECK (temperature IN ('COLD', 'WARM', 'HOT')),
          deal_value numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (deal_value >= 0.00),
          assigned_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
          assigned_user_id uuid,
          source text NOT NULL DEFAULT 'INBOUND_CHAT',
          channel_type text NOT NULL DEFAULT 'whatsapp',
          tags jsonb NOT NULL DEFAULT '[]'::jsonb,
          custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
          last_activity_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_leads_tenant_stage ON leads(tenant_id, stage, lead_score DESC);
      CREATE INDEX IF NOT EXISTS idx_leads_tenant_temp ON leads(tenant_id, temperature);
      CREATE INDEX IF NOT EXISTS idx_leads_customer ON leads(customer_id);
    `);

    // 2.4 Tabel lead_qualification_answers
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_qualification_answers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
          question_key text NOT NULL,
          question_text text NOT NULL,
          answer_text text NOT NULL,
          score_weight numeric(5, 2) NOT NULL DEFAULT 10.00,
          verified boolean NOT NULL DEFAULT true,
          extracted_by text NOT NULL DEFAULT 'AI_AGENT',
          conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_lead_qualification_key UNIQUE (tenant_id, lead_id, question_key)
      );

      CREATE INDEX IF NOT EXISTS idx_lead_qual_tenant_lead ON lead_qualification_answers(tenant_id, lead_id);
    `);

    // 2.5 Tabel lead_score_history
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_score_history (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
          previous_score numeric(5, 2) NOT NULL,
          new_score numeric(5, 2) NOT NULL,
          delta numeric(5, 2) NOT NULL,
          trigger_event text NOT NULL,
          trigger_details jsonb NOT NULL DEFAULT '{}'::jsonb,
          calculated_by text NOT NULL DEFAULT 'LEAD_SCORING_ENGINE',
          created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead ON lead_score_history(lead_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lead_score_history_tenant ON lead_score_history(tenant_id, created_at DESC);
    `);

    // Enable and force RLS on 0019 tables
    const tables0019 = [
      'persona_handoff_rules',
      'leads',
      'lead_qualification_answers',
      'lead_score_history',
    ];

    for (const tbl of tables0019) {
      await client.query(`
        ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_policy ON ${tbl};
        CREATE POLICY tenant_isolation_policy ON ${tbl}
            FOR ALL
            USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
      `);
    }

    // 2.6 Registrasi capabilities di feature_capabilities
    await client.query(`
      INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
      VALUES 
          ('sales.lead_scoring', 1, 'Kalkulasi Skor Lead Dinamis - Perhitungan otomatis lead score dan funnel stage pada setiap event interaksi customer.'),
          ('sales.lead_pipeline', 1, 'Kanban Pipeline Lead F.01-CRM - Manajemen tahap peluang penjualan dan linimasa aktivitas real-time.'),
          ('sales.persona_handoff', 1, 'Handover Otomatis Antar Persona AI - Pengalihan konteks percakapan antar persona AI Agent secara mulus dalam satu thread tunggal.'),
          ('sales.crm_timeline', 1, 'Linimasa Riwayat Interaksi Lead - Riwayat komprehensif pesan, perubahan skor kualifikasi, dan transisi tahap lead.')
      ON CONFLICT (capability_key) DO UPDATE 
      SET description = EXCLUDED.description;
    `);

    // 2.7 Update alembic_version record
    await client.query(`
      INSERT INTO alembic_version (version_num) 
      VALUES ('0019_persona_handoff_and_leads')
      ON CONFLICT DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('✅ Migrasi DDL 0018 & 0019 berhasil dieksekusi 100% dengan RLS FORCE!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Kegagalan saat menjalankan migrasi DDL:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration0018And0019().catch(err => {
  console.error(err);
  process.exit(1);
});
