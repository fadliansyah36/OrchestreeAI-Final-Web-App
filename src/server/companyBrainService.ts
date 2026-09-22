/**
 * Company Brain Extended Domain Service (PRD v2.2)
 * Kategori Dokumen Company Brain:
 * - Product Catalog (sinkron live dari tabel products)
 * - FAQ / SOP / Sales Playbook / Pricing Policy (diinput Admin & disimpan persisten di memory_documents)
 * - Inventory Real-Time (query live langsung dari tabel inventory_stock & products)
 */

import pg from 'pg';
import crypto from 'crypto';

export type CompanyBrainCategory =
  | 'product_catalog'
  | 'faq'
  | 'sop'
  | 'sales_playbook'
  | 'pricing_policy'
  | 'inventory_realtime';

export interface CompanyBrainDocument {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  summary?: string;
  category: CompanyBrainCategory | string;
  source_type: string;
  data_classification: string;
  confidence: number;
  access_count: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LiveInventoryItem {
  product_id: string;
  sku: string;
  product_name: string;
  category: string;
  base_price: number;
  warehouse_location: string;
  quantity_available: number;
  quantity_reserved: number;
  low_stock_threshold: number;
  stock_status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export class CompanyBrainService {
  constructor(private pool: pg.Pool) {}

  /**
   * Mengambil seluruh dokumen Company Brain berdasarkan filter kategori
   */
  async getDocuments(tenantId: string, category?: string): Promise<CompanyBrainDocument[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      let query = `
        SELECT id, tenant_id, title, content, summary, category, source_type,
               data_classification, confidence, access_count, metadata, created_at, updated_at
        FROM memory_documents
        WHERE tenant_id = $1
      `;
      const params: any[] = [tenantId];
      if (category && category !== 'ALL') {
        query += ` AND category = $2`;
        params.push(category);
      }
      query += ` ORDER BY updated_at DESC`;
      const res = await client.query(query, params);
      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Menyimpan / memperbarui dokumen panduan internal (FAQ, SOP, Sales Playbook, Pricing Policy)
   */
  async upsertAdminDocument(
    tenantId: string,
    payload: {
      id?: string;
      title: string;
      content: string;
      summary?: string;
      category: 'faq' | 'sop' | 'sales_playbook' | 'pricing_policy';
      data_classification?: 'public' | 'internal' | 'confidential' | 'restricted';
      metadata?: Record<string, any>;
      userId?: string;
    }
  ): Promise<CompanyBrainDocument> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const docId = payload.id || crypto.randomUUID();
      const classification = payload.data_classification || 'internal';
      const metadata = payload.metadata || {};

      const query = `
        INSERT INTO memory_documents (
          id, tenant_id, title, content, summary, category, source_type,
          data_classification, confidence, metadata, created_by_user_id, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, 1.0, $8::jsonb, $9, now())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          summary = EXCLUDED.summary,
          category = EXCLUDED.category,
          data_classification = EXCLUDED.data_classification,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        RETURNING id, tenant_id, title, content, summary, category, source_type,
                  data_classification, confidence, access_count, metadata, created_at, updated_at;
      `;
      const res = await client.query(query, [
        docId,
        tenantId,
        payload.title,
        payload.content,
        payload.summary || null,
        payload.category,
        classification,
        JSON.stringify(metadata),
        payload.userId || null,
      ]);
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Sinkronisasi Live Produk dari tabel `products` ke dalam representasi Company Brain (product_catalog)
   */
  async syncProductCatalogToBrain(tenantId: string): Promise<{ synced_count: number }> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);

      // Ambil seluruh produk aktif tenant
      const prodRes = await client.query(`
        SELECT p.id, p.sku, p.name, p.description, p.category, p.base_price, p.currency, p.status,
               coalesce(sum(i.quantity_available), 0) as total_available
        FROM products p
        LEFT JOIN inventory_stock i ON p.id = i.product_id AND p.tenant_id = i.tenant_id
        WHERE p.tenant_id = $1
        GROUP BY p.id, p.sku, p.name, p.description, p.category, p.base_price, p.currency, p.status
      `, [tenantId]);

      let count = 0;
      for (const prod of prodRes.rows) {
        const title = `Katalog Produk: ${prod.name} (${prod.sku})`;
        const content = `Produk: ${prod.name}\nSKU: ${prod.sku}\nKategori: ${prod.category}\nHarga Resmi: Rp ${Number(prod.base_price).toLocaleString('id-ID')}\nStatus: ${prod.status}\nStok Tersedia: ${prod.total_available} unit\nDeskripsi: ${prod.description || 'Tidak ada deskripsi'}`;
        const summary = `${prod.name} - SKU ${prod.sku}, Rp ${Number(prod.base_price).toLocaleString('id-ID')}, Stok: ${prod.total_available}`;

        await client.query(`
          INSERT INTO memory_documents (
            id, tenant_id, title, content, summary, category, source_type,
            source_id, data_classification, confidence, metadata, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, 'product_catalog', 'manual',
            $5, 'public', 1.0, $6::jsonb, now()
          )
          ON CONFLICT (id) DO NOTHING;
        `, [
          tenantId,
          title,
          content,
          summary,
          prod.id,
          JSON.stringify({ sku: prod.sku, base_price: prod.base_price, status: prod.status, source: 'products_sync' })
        ]);
        count++;
      }
      return { synced_count: count };
    } finally {
      client.release();
    }
  }

  /**
   * Query Live Inventori Real-time langsung dari tabel inventory_stock & products
   * Menolak data memori usang dengan melakukan query live ke database sumber.
   */
  async getLiveInventory(tenantId: string, search?: string): Promise<LiveInventoryItem[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      let query = `
        SELECT 
          p.id as product_id,
          p.sku,
          p.name as product_name,
          p.category,
          p.base_price,
          coalesce(i.warehouse_location, 'UTAMA') as warehouse_location,
          coalesce(i.quantity_available, 0) as quantity_available,
          coalesce(i.quantity_reserved, 0) as quantity_reserved,
          coalesce(i.low_stock_threshold, 5) as low_stock_threshold
        FROM products p
        LEFT JOIN inventory_stock i ON p.id = i.product_id AND p.tenant_id = i.tenant_id
        WHERE p.tenant_id = $1
      `;
      const params: any[] = [tenantId];
      if (search && search.trim().length > 0) {
        query += ` AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR p.category ILIKE $2)`;
        params.push(`%${search.trim()}%`);
      }
      query += ` ORDER BY p.name ASC`;

      const res = await client.query(query, params);
      return res.rows.map(row => {
        const avail = Number(row.quantity_available);
        const threshold = Number(row.low_stock_threshold);
        let stock_status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
        if (avail <= 0) {
          stock_status = 'OUT_OF_STOCK';
        } else if (avail <= threshold) {
          stock_status = 'LOW_STOCK';
        }

        return {
          product_id: row.product_id,
          sku: row.sku,
          product_name: row.product_name,
          category: row.category,
          base_price: Number(row.base_price),
          warehouse_location: row.warehouse_location,
          quantity_available: avail,
          quantity_reserved: Number(row.quantity_reserved),
          low_stock_threshold: threshold,
          stock_status,
        };
      });
    } finally {
      client.release();
    }
  }

  /**
   * Menghapus dokumen panduan Company Brain
   */
  async deleteDocument(tenantId: string, documentId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantId]);
      const res = await client.query(
        `DELETE FROM memory_documents WHERE id = $1 AND tenant_id = $2;`,
        [documentId, tenantId]
      );
      return (res.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}
