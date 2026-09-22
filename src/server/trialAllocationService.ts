/**
 * OrchestreeAI Trial Slot Allocation Service (PRD v2.2 Bagian 13.5).
 * Alokasi slot trial atomik dengan konkurensi tinggi (SELECT FOR UPDATE SKIP LOCKED).
 * Kapasitas slot (awal 36) dan durasi trial dibaca dinamis dari platform_settings.
 */

import pg from 'pg';

export class SlotCapacityExhaustedError extends Error {
  constructor(message = 'Kapasitas 36 slot uji coba saat ini sedang terisi penuh. Silakan hubungi tim solusi atau coba beberapa saat lagi.') {
    super(message);
    this.name = 'SlotCapacityExhaustedError';
  }
}

export interface PlatformTrialConfig {
  capacity: number;
  durationDays: number;
  initialCredits: number;
}

export class TrialAllocationService {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async getPlatformTrialConfig(client?: pg.PoolClient): Promise<PlatformTrialConfig> {
    const runner = client || this.pool;
    const res = await runner.query(`
      SELECT key, value 
      FROM platform_settings 
      WHERE key IN ('trial_slot_capacity', 'trial_duration_days', 'trial_initial_credits');
    `);

    const config: PlatformTrialConfig = {
      capacity: 36,
      durationDays: 7,
      initialCredits: 1000
    };

    for (const row of res.rows) {
      let val = row.value;
      if (typeof val === 'string') {
        try {
          val = JSON.parse(val);
        } catch {
          val = {};
        }
      }
      if (row.key === 'trial_slot_capacity') {
        config.capacity = Number(val.capacity || 36);
      } else if (row.key === 'trial_duration_days') {
        config.durationDays = Number(val.days || 7);
      } else if (row.key === 'trial_initial_credits') {
        config.initialCredits = Number(val.credits || 1000);
      }
    }

    return config;
  }

  async allocateSlotAtomically(prospectId: string): Promise<{
    slotId: string;
    slotNumber: number;
    prospectId: string;
    durationDays: number;
    expiresAt: string;
    status: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Baca konfigurasi platform dinamis
      const config = await this.getPlatformTrialConfig(client);
      const { capacity, durationDays } = config;

      // 2. Pastikan prospek ada
      const pRes = await client.query(
        'SELECT id, full_name, work_email, trial_status FROM prospects WHERE id = $1 FOR UPDATE',
        [prospectId]
      );
      if (pRes.rows.length === 0) {
        throw new Error(`Prospek dengan id '${prospectId}' tidak ditemukan.`);
      }

      // 3. Cari slot AVAILABLE pertama dengan SELECT FOR UPDATE SKIP LOCKED
      // Membatasi slot_number <= capacity sesuai platform_settings
      const slotRes = await client.query(
        `SELECT id, slot_number 
         FROM trial_slots 
         WHERE status = 'AVAILABLE' AND slot_number <= $1
         ORDER BY slot_number ASC 
         LIMIT 1 
         FOR UPDATE SKIP LOCKED;`,
        [capacity]
      );

      if (slotRes.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new SlotCapacityExhaustedError(
          `Kapasitas ${capacity} slot uji coba saat ini sedang terisi penuh. Silakan hubungi tim solusi atau coba beberapa saat lagi.`
        );
      }

      const slot = slotRes.rows[0];
      const slotId = slot.id;
      const slotNumber = Number(slot.slot_number);

      // 4. Update status slot menjadi RESERVED
      const updateRes = await client.query(
        `UPDATE trial_slots 
         SET status = 'RESERVED',
             prospect_id = $1,
             reserved_at = NOW(),
             expires_at = NOW() + ($2 || ' days')::interval,
             updated_at = NOW()
         WHERE id = $3
         RETURNING expires_at;`,
        [prospectId, durationDays, slotId]
      );

      const expiresAt = updateRes.rows[0].expires_at.toISOString();

      // 5. Update status prospek
      await client.query(
        `UPDATE prospects 
         SET trial_status = 'SELECTED',
             assigned_slot_number = $1,
             updated_at = NOW()
         WHERE id = $2;`,
        [slotNumber, prospectId]
      );

      await client.query('COMMIT');

      return {
        slotId,
        slotNumber,
        prospectId,
        durationDays,
        expiresAt,
        status: 'RESERVED'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async activateTrial(
    prospectId: string,
    tenantId: string,
    activatedBy?: string | null,
    notes?: string | null
  ): Promise<{
    activationId: string;
    slotNumber: number;
    prospectId: string;
    tenantId: string;
    initialCredits: number;
    expiresAt: string;
    status: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const config = await this.getPlatformTrialConfig(client);
      const { initialCredits, durationDays } = config;

      // Cari slot untuk prospek
      const slotRes = await client.query(
        `SELECT id, slot_number 
         FROM trial_slots 
         WHERE prospect_id = $1 
         FOR UPDATE;`,
        [prospectId]
      );

      if (slotRes.rows.length === 0) {
        throw new Error(`Tidak ada slot trial yang terikat pada prospek '${prospectId}'.`);
      }

      const slot = slotRes.rows[0];
      const slotId = slot.id;
      const slotNumber = Number(slot.slot_number);

      // Update slot ke ALLOCATED
      const slotUpd = await client.query(
        `UPDATE trial_slots 
         SET status = 'ALLOCATED',
             tenant_id = $1,
             allocated_at = NOW(),
             expires_at = NOW() + ($2 || ' days')::interval,
             updated_at = NOW()
         WHERE id = $3
         RETURNING expires_at;`,
        [tenantId, durationDays, slotId]
      );

      const expiresAt = slotUpd.rows[0].expires_at.toISOString();

      // Catat ke trial_activations
      const actRes = await client.query(
        `INSERT INTO trial_activations (
           slot_id, prospect_id, tenant_id, initial_credits, credits_remaining,
           started_at, expires_at, status, activated_by, notes, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $4, NOW(), NOW() + ($5 || ' days')::interval, 'ACTIVE', $6, $7, NOW(), NOW()
         ) RETURNING id;`,
        [slotId, prospectId, tenantId, initialCredits, durationDays, activatedBy || null, notes || null]
      );

      const activationId = actRes.rows[0].id;

      // Perbarui status prospek
      await client.query(
        `UPDATE prospects 
         SET trial_status = 'ACTIVE',
             trial_credits_allocated = $1,
             trial_notes = $2,
             updated_at = NOW()
         WHERE id = $3;`,
        [initialCredits, notes || null, prospectId]
      );

      // Top up credit wallet tenant
      try {
        await client.query(
          `INSERT INTO tenant_credit_wallet (
             tenant_id, balance, reserved_credits, lifetime_granted, updated_at
           ) VALUES (
             $1, $2, 0, $2, NOW()
           )
           ON CONFLICT (tenant_id) DO UPDATE SET 
             balance = tenant_credit_wallet.balance + EXCLUDED.balance,
             lifetime_granted = tenant_credit_wallet.lifetime_granted + EXCLUDED.lifetime_granted,
             updated_at = EXCLUDED.updated_at;`,
          [tenantId, initialCredits]
        );
      } catch (wErr) {
        console.warn('[TrialAllocation] Gagal memperbarui tenant_credit_wallet:', wErr);
      }

      await client.query('COMMIT');

      return {
        activationId,
        slotNumber,
        prospectId,
        tenantId,
        initialCredits,
        expiresAt,
        status: 'ACTIVE'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getSlotsStatus(): Promise<any> {
    const config = await this.getPlatformTrialConfig();
    const { capacity } = config;

    const res = await this.pool.query(
      `SELECT 
         s.id, s.slot_number, s.status, s.prospect_id, s.tenant_id,
         s.reserved_at, s.allocated_at, s.expires_at,
         p.full_name as prospect_name, p.company_name, p.work_email,
         t.name as tenant_name
       FROM trial_slots s
       LEFT JOIN prospects p ON s.prospect_id = p.id
       LEFT JOIN tenants t ON s.tenant_id = t.id
       WHERE s.slot_number <= $1
       ORDER BY s.slot_number ASC;`,
      [capacity]
    );

    const counts: Record<string, number> = {
      AVAILABLE: 0,
      RESERVED: 0,
      ALLOCATED: 0,
      EXPIRED: 0
    };

    const slots = res.rows.map((r) => {
      const st = r.status as string;
      counts[st] = (counts[st] || 0) + 1;
      return {
        id: r.id,
        slot_number: Number(r.slot_number),
        status: st,
        prospect_id: r.prospect_id,
        prospect_name: r.prospect_name,
        company_name: r.company_name,
        work_email: r.work_email,
        tenant_name: r.tenant_name,
        reserved_at: r.reserved_at ? r.reserved_at.toISOString() : null,
        allocated_at: r.allocated_at ? r.allocated_at.toISOString() : null,
        expires_at: r.expires_at ? r.expires_at.toISOString() : null
      };
    });

    return {
      capacity,
      durationDays: config.durationDays,
      initialCredits: config.initialCredits,
      counts,
      availableCount: counts.AVAILABLE || 0,
      slots
    };
  }

  async listProspects(options: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any> {
    const { status, search, limit = 50, offset = 0 } = options;

    let queryStr = `
      SELECT 
        p.id, p.full_name, p.work_email, p.phone_number, p.company_name,
        p.company_scale, p.interest_type, p.notes, p.trial_status, p.meeting_status,
        p.scheduled_meeting_date, p.scheduled_meeting_link, p.scheduled_meeting_notes,
        p.trial_credits_allocated, p.trial_notes, p.assigned_slot_number,
        p.web_integrity_verified, p.created_at, p.updated_at,
        s.status as slot_status, s.expires_at as slot_expires_at
      FROM prospects p
      LEFT JOIN trial_slots s ON p.id = s.prospect_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let idx = 1;

    if (status) {
      queryStr += ` AND p.trial_status = $${idx++}`;
      params.push(status);
    }

    if (search) {
      queryStr += ` AND (p.full_name ILIKE $${idx} OR p.company_name ILIKE $${idx} OR p.work_email ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    queryStr += ` ORDER BY p.created_at DESC LIMIT $${idx++} OFFSET $${idx++};`;
    params.push(limit, offset);

    const res = await this.pool.query(queryStr, params);
    const countRes = await this.pool.query('SELECT COUNT(*) FROM prospects;');

    return {
      total: Number(countRes.rows[0].count),
      count: res.rows.length,
      prospects: res.rows.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        work_email: r.work_email,
        phone_number: r.phone_number,
        company_name: r.company_name,
        company_scale: r.company_scale,
        interest_type: r.interest_type,
        notes: r.notes,
        trial_status: r.trial_status,
        meeting_status: r.meeting_status,
        scheduled_meeting_date: r.scheduled_meeting_date ? r.scheduled_meeting_date.toISOString() : null,
        scheduled_meeting_link: r.scheduled_meeting_link,
        scheduled_meeting_notes: r.scheduled_meeting_notes,
        trial_credits_allocated: Number(r.trial_credits_allocated || 0),
        trial_notes: r.trial_notes,
        assigned_slot_number: r.assigned_slot_number ? Number(r.assigned_slot_number) : null,
        slot_status: r.slot_status,
        slot_expires_at: r.slot_expires_at ? r.slot_expires_at.toISOString() : null,
        web_integrity_verified: Boolean(r.web_integrity_verified),
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString()
      }))
    };
  }

  async scheduleMeeting(
    prospectId: string,
    meetingDate: string,
    meetingLink?: string | null,
    notes?: string | null
  ): Promise<any> {
    const res = await this.pool.query(
      `UPDATE prospects 
       SET meeting_status = 'SCHEDULED',
           scheduled_meeting_date = $1,
           scheduled_meeting_link = $2,
           scheduled_meeting_notes = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, scheduled_meeting_date, scheduled_meeting_link;`,
      [meetingDate, meetingLink || null, notes || null, prospectId]
    );

    if (res.rows.length === 0) {
      throw new Error(`Prospek dengan id '${prospectId}' tidak ditemukan.`);
    }

    return res.rows[0];
  }

  async deleteProspect(prospectId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Bebaskan slot
      await client.query(
        `UPDATE trial_slots 
         SET status = 'AVAILABLE',
             prospect_id = NULL,
             reserved_at = NULL,
             allocated_at = NULL,
             expires_at = NULL,
             updated_at = NOW()
         WHERE prospect_id = $1;`,
        [prospectId]
      );

      // Hapus prospek
      await client.query('DELETE FROM prospects WHERE id = $1;', [prospectId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
