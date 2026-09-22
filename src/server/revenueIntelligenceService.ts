/**
 * Revenue Intelligence, First-Touch Attribution, and Sales Coach Service (PRD v2.2)
 *
 * Mengimplementasikan:
 * 1. Revenue Attribution First-Touch:
 *    Mengagregasikan pendapatan nyata dari `orders`, `payments` (status PAID/SETTLEMENT),
 *    dan percakapan pertama `conversations` (channel_type / assigned_agent_id).
 * 2. Metrik pendapatan: Total Revenue, Average Order Value (AOV), Conversion Velocity,
 *    Attribution per Kanal (WhatsApp, Telegram, dsb.), dan Attribution per AI Agent / Human.
 * 3. Sales Coach Evaluation:
 *    Menganalisis performa penutupan percakapan penjualan real-time, mendeteksi keberatan (objections),
 *    closing signals, dan memberikan actionable recommendations berbasis transkrip nyata.
 */

import pg from 'pg';

export interface RevenueAttributionSummary {
  total_revenue: number;
  total_paid_orders: number;
  average_order_value: number;
  conversion_rate: number;
  channel_attribution: Array<{
    channel_type: string;
    order_count: number;
    total_revenue: number;
    percentage: number;
  }>;
  agent_attribution: Array<{
    assigned_type: 'AI' | 'HUMAN';
    agent_id?: string;
    agent_name?: string;
    order_count: number;
    total_revenue: number;
    percentage: number;
  }>;
  recent_attributed_orders: Array<{
    order_id: string;
    order_number: string;
    customer_name?: string;
    channel_type?: string;
    total_amount: number;
    paid_at?: string;
    first_touch_conversation_id?: string;
  }>;
}

export interface SalesCoachEvaluation {
  conversation_id: string;
  customer_name?: string;
  sales_stage: string;
  closing_score: number; // 0 - 100
  objections_detected: string[];
  buying_signals: string[];
  ai_recommendation: string;
  suggested_action: 'SEND_DISCOUNT_CODE' | 'CALL_CUSTOMER' | 'SHARE_CATALOG' | 'RESOLVE_OBJECTION' | 'FOLLOW_UP_CART';
}

export class RevenueIntelligenceService {
  constructor(private pool: pg.Pool) {}

  /**
   * Menghitung Revenue First-Touch Attribution dari database nyata Supabase
   */
  async getRevenueAttribution(tenantId: string, startDate?: string, endDate?: string): Promise<RevenueAttributionSummary> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

      // 1. Ambil seluruh order yang telah dibayar (PAID/SETTLEMENT) beserta relasi first-touch conversation & channel
      let orderQuery = `
        SELECT 
          o.id as order_id,
          o.order_number,
          o.total_amount,
          o.created_at as order_created_at,
          p.paid_at,
          c.id as customer_id,
          c.primary_name as customer_name,
          conv.id as conversation_id,
          conv.assigned_type,
          conv.assigned_agent_id,
          ca.channel_type
        FROM orders o
        JOIN payments p ON o.id = p.order_id AND p.status IN ('SETTLEMENT', 'PAID')
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN conversations conv ON o.conversation_id = conv.id
        LEFT JOIN channel_accounts ca ON conv.channel_account_id = ca.id
        WHERE o.tenant_id = $1
      `;
      const params: any[] = [tenantId];
      if (startDate) {
        orderQuery += ` AND o.created_at >= $${params.length + 1}`;
        params.push(startDate);
      }
      if (endDate) {
        orderQuery += ` AND o.created_at <= $${params.length + 1}`;
        params.push(endDate);
      }
      orderQuery += ` ORDER BY o.created_at DESC`;

      const orderRes = await client.query(orderQuery, params);
      const orders = orderRes.rows;

      // 2. Ambil total customer / percakapan untuk menghitung conversion rate nyata
      const totalConvRes = await client.query(
        `SELECT COUNT(*) as total_conv FROM conversations WHERE tenant_id = $1;`,
        [tenantId]
      );
      const totalConversations = Number(totalConvRes.rows[0]?.total_conv) || 1;

      let totalRevenue = 0;
      const channelMap: Record<string, { count: number; revenue: number }> = {};
      const agentMap: Record<string, { assigned_type: 'AI' | 'HUMAN'; agent_id?: string; count: number; revenue: number }> = {};

      for (const ord of orders) {
        const amount = Number(ord.total_amount) || 0;
        totalRevenue += amount;

        // Kanal
        const ch = ord.channel_type || 'DIRECT_STORE';
        if (!channelMap[ch]) {
          channelMap[ch] = { count: 0, revenue: 0 };
        }
        channelMap[ch].count += 1;
        channelMap[ch].revenue += amount;

        // Agen / Penanganan
        const aType: 'AI' | 'HUMAN' = ord.assigned_type || 'AI';
        const key = `${aType}_${ord.assigned_agent_id || 'DEFAULT'}`;
        if (!agentMap[key]) {
          agentMap[key] = {
            assigned_type: aType,
            agent_id: ord.assigned_agent_id || undefined,
            count: 0,
            revenue: 0,
          };
        }
        agentMap[key].count += 1;
        agentMap[key].revenue += amount;
      }

      const totalPaidOrders = orders.length;
      const aov = totalPaidOrders > 0 ? totalRevenue / totalPaidOrders : 0;
      const conversionRate = totalConversations > 0 ? (totalPaidOrders / totalConversations) * 100 : 0;

      const channel_attribution = Object.entries(channelMap).map(([channel_type, data]) => ({
        channel_type,
        order_count: data.count,
        total_revenue: data.revenue,
        percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
      }));

      const agent_attribution = Object.values(agentMap).map(data => ({
        assigned_type: data.assigned_type,
        agent_id: data.agent_id,
        agent_name: data.assigned_type === 'AI' ? 'AI Sales Assistant' : 'Human Specialist',
        order_count: data.count,
        total_revenue: data.revenue,
        percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
      }));

      const recent_attributed_orders = orders.slice(0, 10).map(ord => ({
        order_id: ord.order_id,
        order_number: ord.order_number,
        customer_name: ord.customer_name || 'Customer Organisasi',
        channel_type: ord.channel_type || 'Direct',
        total_amount: Number(ord.total_amount),
        paid_at: ord.paid_at,
        first_touch_conversation_id: ord.conversation_id,
      }));

      return {
        total_revenue: totalRevenue,
        total_paid_orders: totalPaidOrders,
        average_order_value: aov,
        conversion_rate: Number(conversionRate.toFixed(2)),
        channel_attribution,
        agent_attribution,
        recent_attributed_orders,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Evaluasi Sales Coach berbasis percakapan nyata
   */
  async evaluateSalesCoach(tenantId: string, limit: number = 5): Promise<SalesCoachEvaluation[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

      // Ambil percakapan aktif dengan transkrip pesan
      const convRes = await client.query(`
        SELECT 
          c.id as conversation_id,
          c.sales_stage,
          c.last_message_preview,
          cust.primary_name as customer_name
        FROM conversations c
        LEFT JOIN customers cust ON c.customer_id = cust.id
        WHERE c.tenant_id = $1
        ORDER BY c.last_message_at DESC
        LIMIT $2;
      `, [tenantId, limit]);

      const evaluations: SalesCoachEvaluation[] = [];

      for (const conv of convRes.rows) {
        // Ambil 5 pesan terakhir dalam percakapan
        const msgRes = await client.query(`
          SELECT direction, sender_type, content_text
          FROM conversation_messages
          WHERE conversation_id = $1 AND tenant_id = $2
          ORDER BY created_at DESC
          LIMIT 5;
        `, [conv.conversation_id, tenantId]);

        const messages = msgRes.rows.reverse();
        const fullText = messages.map(m => m.content_text).join(' ').toLowerCase();

        // Deteksi sinyal belanja & keberatan dari teks nyata
        const objections: string[] = [];
        const buyingSignals: string[] = [];
        let score = 50;

        if (fullText.includes('mahal') || fullText.includes('ongkir') || fullText.includes('budget')) {
          objections.push('Sensitivitas Harga / Keberatan Biaya Ongkir');
          score -= 15;
        }
        if (fullText.includes('ragu') || fullText.includes('garansi') || fullText.includes('asli')) {
          objections.push('Keraguan Keaslian atau Garansi Produk');
          score -= 10;
        }
        if (fullText.includes('beli') || fullText.includes('pesan') || fullText.includes('transfer') || fullText.includes('checkout')) {
          buyingSignals.push('Niat Beli Tinggi (Menanyakan Prosedur Pemesanan/Transfer)');
          score += 25;
        }
        if (fullText.includes('ready') || fullText.includes('warna') || fullText.includes('ukuran') || fullText.includes('stok')) {
          buyingSignals.push('Ketertarikan Spesifikasi Varian Produk');
          score += 15;
        }

        score = Math.max(10, Math.min(95, score));

        let suggestedAction: SalesCoachEvaluation['suggested_action'] = 'SHARE_CATALOG';
        let recommendation = 'Tampilkan opsi katalog produk yang sesuai kebutuhan pembeli.';

        if (objections.length > 0 && objections[0].includes('Harga')) {
          suggestedAction = 'SEND_DISCOUNT_CODE';
          recommendation = 'Kirim penawaran kupon diskon ongkir atau voucher spesial untuk mempercepat penutupan pesanan.';
        } else if (buyingSignals.length > 0) {
          suggestedAction = 'FOLLOW_UP_CART';
          recommendation = 'Segera kirimkan tautan ringkasan pesanan atau penawaran resmi untuk memicu checkout instan.';
        } else if (conv.sales_stage === 'OBJECTION_HANDLING') {
          suggestedAction = 'RESOLVE_OBJECTION';
          recommendation = 'Jawab keraguan pelanggan dengan data garansi resmi dan kebijakan pengembalian produk.';
        }

        evaluations.push({
          conversation_id: conv.conversation_id,
          customer_name: conv.customer_name || 'Pelanggan Prospektif',
          sales_stage: conv.sales_stage || 'DISCOVERY',
          closing_score: score,
          objections_detected: objections,
          buying_signals: buyingSignals,
          ai_recommendation: recommendation,
          suggested_action: suggestedAction,
        });
      }

      return evaluations;
    } finally {
      client.release();
    }
  }
}
