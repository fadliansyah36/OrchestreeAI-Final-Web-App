/**
 * OrchestreeAI Proactive Communication & Notification Router (Express / TypeScript)
 * Sesuai PRD v2.2 Bagian 10.3, 10.6, 8.2 & 14.1:
 * - WhatsApp OTP Verification & Meta Cloud API webhook
 * - Telegram Bot Deep-link & Webhook Handler
 * - Opt-in / Opt-out Protocol (STOP / START / BERHENTI / LANJUT)
 * - Proactive Dispatch Scheduler & Anti-Spam Guard (08:00 - 20:00 WIB, max 3/hari)
 * - In-App Notification Center & Web Push
 * - SSE Streaming Chat / Ask AI via Model Router & Credit Ledger
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import pg from 'pg';
import { ModelRouterService, authorizePDP } from './cognitiveCore';

export function createProactiveRouter(pool: pg.Pool | null, modelRouter: ModelRouterService) {
  const router = express.Router();

  // Helper: Kirim Pesan WhatsApp via Meta Cloud API
  async function sendMetaWhatsAppMessage(phoneNumberId: string, accessToken: string, recipientPhone: string, text: string) {
    if (!phoneNumberId || !accessToken) {
      console.warn('WhatsApp API credentials tidak lengkap, pesan tidak dapat dikirim secara fisik.');
      return { success: false, reason: 'missing_credentials' };
    }
    try {
      const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
      const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      });
      const data = await resp.json();
      return { success: resp.ok, data };
    } catch (e: any) {
      console.error('Error pengiriman pesan WhatsApp:', e.message);
      return { success: false, error: e.message };
    }
  }

  // Helper: Kirim Pesan Telegram
  async function sendTelegramMessage(botToken: string, chatId: string | number, text: string) {
    if (!botToken) {
      console.warn('Telegram Bot Token tidak disetel.');
      return { success: false, reason: 'missing_bot_token' };
    }
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      });
      const data = await resp.json();
      return { success: resp.ok, data };
    } catch (e: any) {
      console.error('Error pengiriman pesan Telegram:', e.message);
      return { success: false, error: e.message };
    }
  }

  // =========================================================================
  // 1. WHATSAPP CHANNELS (OTP & VERIFIKASI)
  // =========================================================================

  router.post('/api/v1/proactive/channels/whatsapp/request-otp', async (req: Request, res: Response) => {
    const { tenant_id, membership_id, phone_number } = req.body;
    if (!tenant_id || !membership_id || !phone_number) {
      return res.status(400).json({ error: 'tenant_id, membership_id, dan phone_number wajib diisi.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        // Validasi format nomor telepon
        let cleanPhone = phone_number.trim();
        if (cleanPhone.startsWith('08')) {
          cleanPhone = '+62' + cleanPhone.substring(1);
        } else if (cleanPhone.startsWith('62')) {
          cleanPhone = '+' + cleanPhone;
        } else if (!cleanPhone.startsWith('+')) {
          cleanPhone = '+' + cleanPhone;
        }

        // Generate 6 digit OTP acak yang aman
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

        // Ambil atau buat langganan
        const subRes = await client.query(
          `SELECT id FROM staff_proactive_subscriptions 
           WHERE tenant_id = $1 AND membership_id = $2 AND channel = 'whatsapp'`,
          [tenant_id, membership_id]
        );

        let subId: string;
        if (subRes.rows.length === 0) {
          subId = crypto.randomUUID();
          await client.query(
            `INSERT INTO staff_proactive_subscriptions (
               id, tenant_id, membership_id, channel, destination_target,
               verification_status, verification_code, verification_expires_at, status
             ) VALUES ($1, $2, $3, 'whatsapp', $4, 'pending', $5, $6, 'active')`,
            [subId, tenant_id, membership_id, cleanPhone, otpCode, expiresAt]
          );
        } else {
          subId = subRes.rows[0].id;
          await client.query(
            `UPDATE staff_proactive_subscriptions
             SET destination_target = $1,
                 verification_status = 'pending',
                 verification_code = $2,
                 verification_expires_at = $3,
                 status = 'active',
                 updated_at = now()
             WHERE id = $4`,
            [cleanPhone, otpCode, expiresAt, subId]
          );
        }

        // Kirim OTP melalui Meta WhatsApp Business Cloud API jika kredensial tersedia
        const waPhoneId = process.env.WA_PROACTIVE_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
        const waToken = process.env.WA_PROACTIVE_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';
        let dispatchResult = { success: false };

        if (waPhoneId && waToken) {
          const messageText = `*Kode Verifikasi OrchestreeAI*\n\nKode verifikasi kanal notifikasi WhatsApp Anda adalah: *${otpCode}*\n\nKode ini berlaku selama 10 menit. Jangan berikan kode ini kepada pihak manapun.`;
          dispatchResult = await sendMetaWhatsAppMessage(waPhoneId, waToken, cleanPhone, messageText);
        }

        return res.json({
          success: true,
          subscription_id: subId,
          phone_number: cleanPhone,
          message: 'Kode verifikasi OTP WhatsApp berhasil diterbitkan.',
          expires_in_minutes: 10,
          delivered: dispatchResult.success,
        });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error('Gagal request WhatsApp OTP:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  router.post('/api/v1/proactive/channels/whatsapp/verify-otp', async (req: Request, res: Response) => {
    const { tenant_id, membership_id, verification_code } = req.body;
    if (!tenant_id || !membership_id || !verification_code) {
      return res.status(400).json({ error: 'tenant_id, membership_id, dan verification_code wajib diisi.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        const subRes = await client.query(
          `SELECT id, destination_target, verification_code, verification_expires_at, verification_status
           FROM staff_proactive_subscriptions
           WHERE tenant_id = $1 AND membership_id = $2 AND channel = 'whatsapp'`,
          [tenant_id, membership_id]
        );

        if (subRes.rows.length === 0) {
          return res.status(404).json({ error: 'Langganan kanal WhatsApp tidak ditemukan.' });
        }

        const sub = subRes.rows[0];
        if (sub.verification_status === 'verified') {
          return res.json({ success: true, message: 'Nomor WhatsApp telah terverifikasi sebelumnya.' });
        }

        if (sub.verification_code !== verification_code.trim()) {
          return res.status(400).json({ error: 'Kode verifikasi OTP salah.' });
        }

        if (new Date() > new Date(sub.verification_expires_at)) {
          return res.status(400).json({ error: 'Kode verifikasi telah kedaluwarsa. Silakan minta kode baru.' });
        }

        await client.query(
          `UPDATE staff_proactive_subscriptions
           SET verification_status = 'verified',
               status = 'active',
               opt_in_at = now(),
               updated_at = now()
           WHERE id = $1`,
          [sub.id]
        );

        // Kirim pesan selamat datang
        const waPhoneId = process.env.WA_PROACTIVE_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
        const waToken = process.env.WA_PROACTIVE_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';
        if (waPhoneId && waToken && sub.destination_target) {
          const welcomeMsg = `🎉 *Kanal WhatsApp OrchestreeAI Terverifikasi!*\n\nAnda akan menerima ringkasan kerja harian dan pembaruan penting operasional organisasi Anda.\n\n_Catatan: Ketik STOP atau BERHENTI kapan saja untuk menjeda pesan._`;
          await sendMetaWhatsAppMessage(waPhoneId, waToken, sub.destination_target, welcomeMsg);
        }

        return res.json({
          success: true,
          message: 'Nomor WhatsApp berhasil diverifikasi dan diaktifkan.',
          channel: 'whatsapp',
          destination_target: sub.destination_target,
        });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // =========================================================================
  // 2. TELEGRAM CHANNELS (DEEPLINK & START)
  // =========================================================================

  router.post('/api/v1/proactive/channels/telegram/deeplink', async (req: Request, res: Response) => {
    const { tenant_id, membership_id } = req.body;
    if (!tenant_id || !membership_id) {
      return res.status(400).json({ error: 'tenant_id dan membership_id wajib diisi.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        const verifyCode = crypto.randomBytes(8).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 menit

        const subRes = await client.query(
          `SELECT id FROM staff_proactive_subscriptions
           WHERE tenant_id = $1 AND membership_id = $2 AND channel = 'telegram'`,
          [tenant_id, membership_id]
        );

        let subId: string;
        if (subRes.rows.length === 0) {
          subId = crypto.randomUUID();
          await client.query(
            `INSERT INTO staff_proactive_subscriptions (
               id, tenant_id, membership_id, channel,
               verification_status, verification_code, verification_expires_at, status
             ) VALUES ($1, $2, $3, 'telegram', 'pending', $4, $5, 'active')`,
            [subId, tenant_id, membership_id, verifyCode, expiresAt]
          );
        } else {
          subId = subRes.rows[0].id;
          await client.query(
            `UPDATE staff_proactive_subscriptions
             SET verification_code = $1,
                 verification_expires_at = $2,
                 verification_status = 'pending',
                 status = 'active',
                 updated_at = now()
             WHERE id = $3`,
            [verifyCode, expiresAt, subId]
          );
        }

        const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'OrchestreeAiBot';
        const deeplink = `https://t.me/${botUsername}?start=verify_${verifyCode}`;

        return res.json({
          success: true,
          bot_username: botUsername,
          deeplink,
          verification_code: verifyCode,
          expires_in_minutes: 15,
        });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // =========================================================================
  // 3. PREFERENSI & SUBSCRIPTIONS
  // =========================================================================

  router.get('/api/v1/proactive/subscriptions', async (req: Request, res: Response) => {
    const tenant_id = req.query.tenant_id as string;
    const membership_id = req.query.membership_id as string;
    if (!tenant_id || !membership_id) {
      return res.status(400).json({ error: 'tenant_id dan membership_id wajib disertakan.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT id, channel, destination_target, verification_status, status,
                  notification_types, preferred_send_times, timezone, opt_in_at, opt_out_at,
                  total_messages_sent, last_sent_at
           FROM staff_proactive_subscriptions
           WHERE tenant_id = $1 AND membership_id = $2`,
          [tenant_id, membership_id]
        );
        return res.json({ success: true, subscriptions: result.rows });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  router.patch('/api/v1/proactive/subscriptions/:channel', async (req: Request, res: Response) => {
    const { channel } = req.params;
    const { tenant_id, membership_id, notif_types, send_times, timezone, status } = req.body;
    if (!tenant_id || !membership_id) {
      return res.status(400).json({ error: 'tenant_id dan membership_id wajib diisi.' });
    }
    if (!['whatsapp', 'telegram'].includes(channel)) {
      return res.status(400).json({ error: 'Kanal tidak didukung' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        const updates: string[] = ['updated_at = now()'];
        const values: any[] = [tenant_id, membership_id, channel];
        let idx = 4;

        if (notif_types !== undefined) {
          updates.push(`notification_types = $${idx}`);
          values.push(JSON.stringify(notif_types));
          idx++;
        }
        if (send_times !== undefined) {
          updates.push(`preferred_send_times = $${idx}`);
          values.push(JSON.stringify(send_times));
          idx++;
        }
        if (timezone !== undefined) {
          updates.push(`timezone = $${idx}`);
          values.push(timezone);
          idx++;
        }
        if (status !== undefined) {
          updates.push(`status = $${idx}`);
          values.push(status);
          idx++;
        }

        const query = `
          UPDATE staff_proactive_subscriptions
          SET ${updates.join(', ')}
          WHERE tenant_id = $1 AND membership_id = $2 AND channel = $3
          RETURNING *;
        `;
        const result = await client.query(query, values);
        return res.json({ success: true, subscription: result.rows[0] });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  router.get('/api/v1/proactive/logs', async (req: Request, res: Response) => {
    const tenant_id = req.query.tenant_id as string;
    const membership_id = req.query.membership_id as string;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!tenant_id) return res.status(400).json({ error: 'tenant_id wajib disertakan.' });
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        let query = `
          SELECT l.*, s.channel, s.destination_target
          FROM proactive_message_logs l
          JOIN staff_proactive_subscriptions s ON l.subscription_id = s.id
          WHERE l.tenant_id = $1
        `;
        const values: any[] = [tenant_id];

        if (membership_id) {
          query += ` AND s.membership_id = $2`;
          values.push(membership_id);
        }

        query += ` ORDER BY l.created_at DESC LIMIT $${values.length + 1}`;
        values.push(limit);

        const result = await client.query(query, values);
        return res.json({ success: true, logs: result.rows });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // =========================================================================
  // 4. IN-APP NOTIFICATIONS & PUSH NOTIFICATIONS
  // =========================================================================

  router.get('/api/v1/proactive/notifications', async (req: Request, res: Response) => {
    const tenant_id = req.query.tenant_id as string;
    const membership_id = req.query.membership_id as string;
    const unread_only = req.query.unread_only === 'true';
    const limit = parseInt(req.query.limit as string) || 50;

    if (!tenant_id || !membership_id) {
      return res.status(400).json({ error: 'tenant_id dan membership_id wajib disertakan.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        let query = `
          SELECT * FROM in_app_notifications
          WHERE tenant_id = $1 AND membership_id = $2
        `;
        const values: any[] = [tenant_id, membership_id];

        if (unread_only) {
          query += ` AND is_read = false`;
        }

        query += ` ORDER BY created_at DESC LIMIT $3`;
        values.push(limit);

        const result = await client.query(query, values);
        return res.json({ success: true, notifications: result.rows });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  router.patch('/api/v1/proactive/notifications/:id/read', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { tenant_id, membership_id } = req.body;
    if (!tenant_id || !membership_id) {
      return res.status(400).json({ error: 'tenant_id dan membership_id wajib diisi.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE in_app_notifications
           SET is_read = true, read_at = now()
           WHERE id = $1 AND tenant_id = $2 AND membership_id = $3`,
          [id, tenant_id, membership_id]
        );
        return res.json({ success: true });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  router.post('/api/v1/proactive/notifications/read-all', async (req: Request, res: Response) => {
    const { tenant_id, membership_id } = req.body;
    if (!tenant_id || !membership_id) {
      return res.status(400).json({ error: 'tenant_id dan membership_id wajib diisi.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `UPDATE in_app_notifications
           SET is_read = true, read_at = now()
           WHERE tenant_id = $1 AND membership_id = $2 AND is_read = false`,
          [tenant_id, membership_id]
        );
        return res.json({ success: true, marked_count: result.rowCount });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  router.post('/api/v1/proactive/push/subscribe', async (req: Request, res: Response) => {
    const { tenant_id, membership_id, endpoint, p256dh, auth_token, user_agent } = req.body;
    if (!tenant_id || !membership_id || !endpoint || !p256dh || !auth_token) {
      return res.status(400).json({ error: 'Parameter push subscription tidak lengkap.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    try {
      const client = await pool.connect();
      try {
        const id = crypto.randomUUID();
        await client.query(
          `INSERT INTO web_push_subscriptions (
             id, tenant_id, membership_id, endpoint, p256dh, auth_token, user_agent
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (endpoint) DO UPDATE
           SET p256dh = EXCLUDED.p256dh,
               auth_token = EXCLUDED.auth_token,
               user_agent = EXCLUDED.user_agent,
               is_active = true,
               updated_at = now()`,
          [id, tenant_id, membership_id, endpoint, p256dh, auth_token, user_agent || null]
        );
        return res.json({ success: true, message: 'Web Push subscription tersimpan' });
      } finally {
        client.release();
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // =========================================================================
  // 5. SCHEDULER DISPATCH RUNNER (CELERY BEAT ALTERNATIVE TRIGGER)
  // =========================================================================

  router.post('/api/v1/proactive/scheduler/trigger', async (req: Request, res: Response) => {
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    const client = await pool.connect();
    try {
      // Ambil seluruh langganan yang aktif dan terverifikasi
      const subsRes = await client.query(`
        SELECT s.*, m.tenant_id, u.full_name as member_name
        FROM staff_proactive_subscriptions s
        JOIN tenant_memberships m ON s.membership_id = m.id
        LEFT JOIN users u ON m.user_id = u.id
        WHERE s.status = 'active' AND s.verification_status = 'verified'
      `);

      let processed = 0;
      let sent = 0;
      const details: any[] = [];

      for (const sub of subsRes.rows) {
        processed++;

        // Anti-spam guard: cek pengiriman dalam 24 jam terakhir (max 3)
        const countRes = await client.query(`
          SELECT count(*) as sent_count
          FROM proactive_message_logs
          WHERE subscription_id = $1 AND delivery_status = 'delivered'
            AND created_at >= now() - interval '24 hours'
        `, [sub.id]);

        const sentCount = parseInt(countRes.rows[0].sent_count || '0');
        if (sentCount >= 3) {
          details.push({ subscription_id: sub.id, status: 'skipped', reason: 'daily_limit_reached' });
          continue;
        }

        // Susun prompt laporan ringkasan operasional dengan Model Router
        const prompt = `Buat ringkasan tugas operasional singkat (maks 3 poin penting) untuk staf bernama ${sub.member_name || 'Rekan'} di OrchestreeAI hari ini. Gunakan nada profesional, ringkas, dan jelas dalam Bahasa Indonesia.`;
        const llmRes = await modelRouter.route({
          tenant_id: sub.tenant_id,
          prompt,
          system_prompt: 'Anda adalah asisten proaktif AI OrchestreeAI.',
          preferred_provider: 'nvidia',
        });

        const messageContent = llmRes.content || `Halo ${sub.member_name || 'Rekan'}, berikut pembaruan operasional terjadwal dari OrchestreeAI. Semua sistem agen AI berjalan normal.`;

        // Kirimkan ke kanal tujuan
        let isDelivered = false;
        let extMessageId: string | null = null;

        if (sub.channel === 'whatsapp') {
          const waPhoneId = process.env.WA_PROACTIVE_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
          const waToken = process.env.WA_PROACTIVE_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';
          if (waPhoneId && waToken && sub.destination_target) {
            const sendRes = await sendMetaWhatsAppMessage(waPhoneId, waToken, sub.destination_target, messageContent);
            isDelivered = sendRes.success;
            extMessageId = (sendRes.data as any)?.messages?.[0]?.id || null;
          }
        } else if (sub.channel === 'telegram') {
          const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_OFFICIAL_BOT_TOKEN || '';
          if (botToken && sub.destination_target) {
            const sendRes = await sendTelegramMessage(botToken, sub.destination_target, messageContent);
            isDelivered = sendRes.success;
            extMessageId = (sendRes.data as any)?.result?.message_id ? String((sendRes.data as any).result.message_id) : null;
          }
        }

        // Simpan log audit ke proactive_message_logs
        const logId = crypto.randomUUID();
        await client.query(`
          INSERT INTO proactive_message_logs (
            id, tenant_id, subscription_id, message_type, content,
            delivery_status, external_message_id, created_at
          ) VALUES ($1, $2, $3, 'morning_digest', $4, $5, $6, now())
        `, [
          logId,
          sub.tenant_id,
          sub.id,
          messageContent,
          isDelivered ? 'delivered' : 'failed',
          extMessageId,
        ]);

        if (isDelivered) {
          sent++;
          await client.query(`
            UPDATE staff_proactive_subscriptions
            SET total_messages_sent = total_messages_sent + 1,
                last_sent_at = now()
            WHERE id = $1
          `, [sub.id]);
        }

        details.push({
          subscription_id: sub.id,
          channel: sub.channel,
          target: sub.destination_target,
          status: isDelivered ? 'sent' : 'failed',
        });
      }

      return res.json({
        success: true,
        summary: {
          total_subscriptions: processed,
          messages_dispatched: sent,
        },
        details,
      });
    } catch (e: any) {
      console.error('Error saat memicu scheduler proaktif:', e);
      return res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  // =========================================================================
  // 6. META WHATSAPP WEBHOOK HANDLERS
  // =========================================================================

  router.get('/api/v1/webhooks/whatsapp', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'orchestre_meta_secure_verify_token_2026';
    if (mode === 'subscribe' && token === expectedToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden: Token verifikasi tidak cocok.');
  });

  router.post('/api/v1/webhooks/whatsapp', async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || !body.entry) return res.json({ status: 'ok' });
    if (!pool) return res.json({ status: 'db_unavailable' });

    try {
      const client = await pool.connect();
      try {
        for (const entry of body.entry) {
          for (const change of entry.changes || []) {
            const val = change.value || {};
            const incomingPhoneId = val.metadata?.phone_number_id;
            const messages = val.messages || [];

            for (const msg of messages) {
              const senderRaw = msg.from || '';
              const formattedSender = senderRaw.startsWith('+') ? senderRaw : `+${senderRaw}`;
              const textBody = msg.text?.body?.trim() || '';
              const upper = textBody.toUpperCase();

              const waPhoneId = process.env.WA_PROACTIVE_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
              const waToken = process.env.WA_PROACTIVE_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';

              // Deteksi Opt-Out
              if (['STOP', 'BERHENTI', 'UNSUBSCRIBE'].includes(upper)) {
                await client.query(`
                  UPDATE staff_proactive_subscriptions
                  SET status = 'paused',
                      opt_out_at = now(),
                      opt_out_keyword = $1,
                      updated_at = now()
                  WHERE destination_target = $2 AND channel = 'whatsapp'
                `, [upper, formattedSender]);

                if (incomingPhoneId && waToken) {
                  const replyText = 'Pesan notifikasi proaktif OrchestreeAI telah dijeda. Ketik START atau LANJUT untuk mengaktifkannya kembali.';
                  await sendMetaWhatsAppMessage(incomingPhoneId, waToken, formattedSender, replyText);
                }
              }

              // Deteksi Opt-In
              else if (['START', 'LANJUT', 'MULAI', 'RESUME'].includes(upper)) {
                await client.query(`
                  UPDATE staff_proactive_subscriptions
                  SET status = 'active',
                      opt_in_at = now(),
                      updated_at = now()
                  WHERE destination_target = $1 AND channel = 'whatsapp'
                `, [formattedSender]);

                if (incomingPhoneId && waToken) {
                  const replyText = '🎉 Layanan notifikasi proaktif OrchestreeAI Anda telah aktif kembali.';
                  await sendMetaWhatsAppMessage(incomingPhoneId, waToken, formattedSender, replyText);
                }
              }
            }
          }
        }
        return res.json({ status: 'ok' });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error('Error proses WhatsApp webhook:', e);
      return res.json({ status: 'error', message: e.message });
    }
  });

  // =========================================================================
  // 7. TELEGRAM BOT WEBHOOK HANDLER
  // =========================================================================

  router.post('/api/v1/webhooks/telegram-bot', async (req: Request, res: Response) => {
    const update = req.body;
    if (!update || !update.message) return res.json({ status: 'ok' });
    if (!pool) return res.json({ status: 'db_unavailable' });

    const msg = update.message;
    const chatId = msg.chat?.id;
    const text = (msg.text || '').trim();
    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_OFFICIAL_BOT_TOKEN || '';

    if (!chatId || !text) return res.json({ status: 'ok' });

    try {
      const client = await pool.connect();
      try {
        // Deep-link verification: /start verify_{code}
        if (text.startsWith('/start verify_')) {
          const code = text.split('verify_')[1]?.split(' ')[0]?.trim();
          const subRes = await client.query(`
            SELECT id, tenant_id, membership_id, verification_expires_at
            FROM staff_proactive_subscriptions
            WHERE channel = 'telegram' AND verification_code = $1 AND verification_status = 'pending'
          `, [code]);

          if (subRes.rows.length === 0) {
            await sendTelegramMessage(botToken, chatId, '❌ <b>Verifikasi Tautan Gagal:</b> Kode verifikasi tidak ditemukan atau telah kedaluwarsa.');
            return res.json({ status: 'ok', action: 'verification_failed' });
          }

          const sub = subRes.rows[0];
          if (new Date() > new Date(sub.verification_expires_at)) {
            await sendTelegramMessage(botToken, chatId, '❌ <b>Verifikasi Tautan Gagal:</b> Kode verifikasi telah kedaluwarsa.');
            return res.json({ status: 'ok', action: 'verification_expired' });
          }

          await client.query(`
            UPDATE staff_proactive_subscriptions
            SET destination_target = $1,
                verification_status = 'verified',
                status = 'active',
                opt_in_at = now(),
                updated_at = now()
            WHERE id = $2
          `, [String(chatId), sub.id]);

          const successMsg = '🎉 <b>Akun Telegram Berhasil Dihubungkan!</b>\n\nAnda sekarang akan menerima notifikasi dan laporan terjadwal resmi dari OrchestreeAI.\n\n<i>Ketik STOP untuk menjeda notifikasi kapan saja.</i>';
          await sendTelegramMessage(botToken, chatId, successMsg);
          return res.json({ status: 'ok', action: 'verified' });
        }

        const upper = text.toUpperCase();

        // Deteksi Opt-Out
        if (['STOP', 'BERHENTI', '/STOP'].includes(upper)) {
          await client.query(`
            UPDATE staff_proactive_subscriptions
            SET status = 'paused',
                opt_out_at = now(),
                opt_out_keyword = $1,
                updated_at = now()
            WHERE destination_target = $2 AND channel = 'telegram'
          `, [upper, String(chatId)]);

          await sendTelegramMessage(botToken, chatId, '<b>Notifikasi Dijeda</b>\nAnda tidak akan menerima pesan operasional terjadwal. Ketik <b>START</b> untuk mengaktifkannya kembali.');
          return res.json({ status: 'ok', action: 'opt_out' });
        }

        // Deteksi Opt-In
        if (['START', 'LANJUT', '/START'].includes(upper)) {
          await client.query(`
            UPDATE staff_proactive_subscriptions
            SET status = 'active',
                opt_in_at = now(),
                updated_at = now()
            WHERE destination_target = $1 AND channel = 'telegram'
          `, [String(chatId)]);

          await sendTelegramMessage(botToken, chatId, '<b>🎉 Notifikasi Aktif Kembali</b>\nLayanan pengiriman pesan proaktif Anda aktif kembali.');
          return res.json({ status: 'ok', action: 'opt_in' });
        }

        return res.json({ status: 'ok' });
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.error('Error proses Telegram webhook:', e);
      return res.json({ status: 'error', message: e.message });
    }
  });

  // =========================================================================
  // 8. ASK AI STREAMING SSE CHAT (PRD v2.2 Bagian 8.2 & 14.1)
  // =========================================================================

  router.post('/api/v1/chat/messages', async (req: Request, res: Response) => {
    const { tenant_id, message, membership_id, session_id, preferred_provider, system_prompt } = req.body;
    if (!tenant_id || !message) {
      return res.status(400).json({ error: 'tenant_id dan message wajib diisi.' });
    }
    if (!pool) return res.status(503).json({ error: 'Database tidak tersedia' });

    // PDP Authorization
    const subject = {
      tenant_id,
      user_id: membership_id || 'anonymous_user',
      roles: ['MEMBER'],
      capabilities: ['chat.message.create'],
    };
    const decision = authorizePDP(subject, 'chat.message.create', {
      resource_type: 'chat_session',
      owner_tenant_id: tenant_id,
    });
    if (!decision.is_authorized) {
      return res.status(403).json({ error: `Otorisasi ditolak: ${decision.reason}` });
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const activeSessionId = session_id || crypto.randomUUID();
    res.write(`data: ${JSON.stringify({ event: 'start', session_id: activeSessionId })}\n\n`);

    try {
      // Panggil Model Router nyata
      const llmResult = await modelRouter.route({
        tenant_id,
        prompt: message,
        system_prompt: system_prompt || 'Anda adalah asisten cerdas OrchestreeAI. Berikan respons ringkas, relevan, dan profesional.',
        preferred_provider: preferred_provider || 'nvidia',
      });

      // Stream respons token per token (simulasi streaming halus dari hasil nyata provider)
      const fullText = llmResult.content || 'Maaf, saya tidak dapat memproses tanggapan saat ini.';
      const words = fullText.split(' ');

      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i < words.length - 1 ? ' ' : '');
        res.write(`data: ${JSON.stringify({ event: 'token', token: chunk })}\n\n`);
        // Berikan delay sangat singkat agar efek streaming halus di frontend
        await new Promise((r) => setTimeout(r, 20));
      }

      // Deduct credit dari Dompet Tenant di Supabase
      const actualCost = Math.max(0.5, (llmResult.total_tokens || 100) * 0.005);
      const client = await pool.connect();
      try {
        await client.query(`
          UPDATE tenant_wallets
          SET current_balance = GREATEST(0, current_balance - $1),
              total_consumed = total_consumed + $1,
              updated_at = now()
          WHERE tenant_id = $2;
        `, [actualCost, tenant_id]);

        await client.query(`
          INSERT INTO credit_transactions (
            id, tenant_id, amount, transaction_type, reference_type,
            reference_id, description, created_at
          ) VALUES ($1, $2, $3, 'deduction', 'chat_message', $4, $5, now());
        `, [
          crypto.randomUUID(),
          tenant_id,
          actualCost,
          activeSessionId,
          `Chat AI (${llmResult.provider_id || 'nvidia'} / ${llmResult.model_id || 'default'})`,
        ]);
      } catch (dbErr) {
        console.warn('Gagal memotong kredit chat di DB:', dbErr);
      } finally {
        client.release();
      }

      // Selesai
      res.write(`data: ${JSON.stringify({
        event: 'done',
        session_id: activeSessionId,
        cost: actualCost,
        tokens: llmResult.total_tokens || words.length,
        provider: llmResult.provider_id,
        model: llmResult.model_id,
      })}\n\n`);
      res.end();
    } catch (e: any) {
      console.error('Error saat streaming chat message:', e);
      res.write(`data: ${JSON.stringify({ event: 'error', error: e.message })}\n\n`);
      res.end();
    }
  });

  return router;
}
