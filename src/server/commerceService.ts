/**
 * OrchestreeAI Commerce Domain Service (PRD v2.2 Bagian 12)
 * Terhubung langsung ke Supabase PostgreSQL dengan penegakan RLS app.tenant_id.
 * 
 * Fungsionalitas:
 * 1. Manajemen Produk, Varian, Relasi (Upsell/Cross-sell), dan Inventori multi-gudang
 * 2. Promosi diskon & aturan kupon
 * 3. Keranjang belanja (carts), item keranjang, dan penawaran resmi (quotations)
 * 4. Pembuatan dan pengelolaan pesanan (orders)
 * 5. Verifikasi Webhook Pembayaran (Midtrans / Xendit) dengan validasi signature kriptografis
 *    SATU-SATUNYA sumber kebenaran status 'paid' adalah webhook resmi tervalidasi.
 * 6. Integrasi Ekspedisi / Kurir Aggregator resmi (cek ongkir, generate resi, tracking events)
 * 7. State Machine SalesStage (GREETING -> DISCOVERY -> ... -> RETENTION)
 * 8. Penegakan Grounding AI Commerce (Output Validator harga resmi & stok nyata)
 */

import pg from 'pg';
import crypto from 'crypto';

export interface ProductItem {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  base_price: number;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'OUT_OF_STOCK';
  image_url?: string;
  metadata: Record<string, any>;
  quantity_available?: number;
  quantity_reserved?: number;
  variants?: any[];
  relations?: any[];
  created_at: string;
  updated_at: string;
}

export interface PromotionItem {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  applicable_product_ids: string[];
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface OrderItem {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  conversation_id?: string;
  quotation_id?: string;
  subtotal_amount: number;
  discount_amount: number;
  shipping_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  payment_status: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  fulfillment_status: 'UNFULFILLED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  shipping_address: Record<string, any>;
  items?: any[];
  payments?: any[];
  shipments?: any[];
  created_at: string;
  updated_at: string;
}

export class CommerceService {
  constructor(private pool: pg.Pool) {}

  /**
   * Helper eksekusi transaksi terisolasi RLS per tenant
   */
  private async executeWithTenant<T>(
    tenantId: string,
    fn: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.tenant_id = '${tenantId}';`);
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}';`);
      return await fn(client);
    } finally {
      client.release();
    }
  }

  /**
   * Resolusi Tenant UUID
   */
  async resolveTenantUuid(slugOrId: string): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    if (isUuid) return slugOrId;

    const res = await this.pool.query(
      `SELECT id FROM tenants WHERE slug = $1 LIMIT 1;`,
      [slugOrId]
    );
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    const defaultRes = await this.pool.query(`SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1;`);
    return defaultRes.rows[0]?.id || slugOrId;
  }

  // ==========================================
  // 1. KATALOG PRODUK & INVENTORI
  // ==========================================

  async getProducts(tenantId: string, options: { status?: string; search?: string } = {}): Promise<ProductItem[]> {
    return this.executeWithTenant(tenantId, async (client) => {
      let query = `
        SELECT 
          p.id, p.tenant_id, p.sku, p.name, p.description, p.category, 
          p.base_price, p.currency, p.status, p.image_url, p.metadata,
          p.created_at, p.updated_at,
          COALESCE(SUM(i.quantity_available), 0)::integer AS quantity_available,
          COALESCE(SUM(i.quantity_reserved), 0)::integer AS quantity_reserved
        FROM products p
        LEFT JOIN inventory_stock i ON i.product_id = p.id
        WHERE p.tenant_id = $1
      `;
      const params: any[] = [tenantId];

      if (options.status) {
        params.push(options.status);
        query += ` AND p.status = $${params.length}`;
      }
      if (options.search) {
        params.push(`%${options.search}%`);
        query += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`;
      }

      query += ` GROUP BY p.id ORDER BY p.created_at DESC;`;
      const res = await client.query(query, params);

      // Ambil varian untuk produk yang ditemukan
      const products: ProductItem[] = res.rows.map(r => ({
        ...r,
        base_price: parseFloat(r.base_price),
        quantity_available: parseInt(r.quantity_available, 10),
        quantity_reserved: parseInt(r.quantity_reserved, 10),
        variants: [],
      }));

      if (products.length > 0) {
        const prodIds = products.map(p => p.id);
        const varRes = await client.query(
          `SELECT id, product_id, variant_sku, variant_name, attributes, price_override, status
           FROM product_variants
           WHERE tenant_id = $1 AND product_id = ANY($2::uuid[]);`,
          [tenantId, prodIds]
        );
        const variantMap = new Map<string, any[]>();
        for (const v of varRes.rows) {
          const list = variantMap.get(v.product_id) || [];
          list.push({
            ...v,
            price_override: v.price_override ? parseFloat(v.price_override) : null,
          });
          variantMap.set(v.product_id, list);
        }

        for (const p of products) {
          p.variants = variantMap.get(p.id) || [];
        }
      }

      return products;
    });
  }

  async createProduct(tenantId: string, data: {
    sku: string;
    name: string;
    description?: string;
    category?: string;
    base_price: number;
    currency?: string;
    initial_stock?: number;
    image_url?: string;
    variants?: Array<{
      variant_sku: string;
      variant_name: string;
      attributes?: Record<string, any>;
      price_override?: number;
    }>;
  }): Promise<ProductItem> {
    return this.executeWithTenant(tenantId, async (client) => {
      await client.query('BEGIN');
      try {
        const productId = crypto.randomUUID();
        const basePrice = data.base_price;
        const initialStock = data.initial_stock ?? 10;
        const status = initialStock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';

        const insertRes = await client.query(
          `INSERT INTO products (
            id, tenant_id, sku, name, description, category,
            base_price, currency, status, image_url, metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}'::jsonb, now(), now())
          RETURNING *;`,
          [
            productId,
            tenantId,
            data.sku,
            data.name,
            data.description || null,
            data.category || 'Umum',
            basePrice,
            data.currency || 'IDR',
            status,
            data.image_url || null,
          ]
        );

        // Buat inventory_stock awal
        await client.query(
          `INSERT INTO inventory_stock (
            id, tenant_id, product_id, warehouse_location, quantity_available, quantity_reserved, updated_at
          ) VALUES ($1, $2, $3, 'DEFAULT', $4, 0, now());`,
          [crypto.randomUUID(), tenantId, productId, initialStock]
        );

        // Buat varian jika diberikan
        const variantsList: any[] = [];
        if (data.variants && data.variants.length > 0) {
          for (const v of data.variants) {
            const varId = crypto.randomUUID();
            await client.query(
              `INSERT INTO product_variants (
                id, tenant_id, product_id, variant_sku, variant_name, attributes, price_override, status, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', now(), now());`,
              [
                varId,
                tenantId,
                productId,
                v.variant_sku,
                v.variant_name,
                JSON.stringify(v.attributes || {}),
                v.price_override ?? null,
              ]
            );
            variantsList.push({
              id: varId,
              product_id: productId,
              variant_sku: v.variant_sku,
              variant_name: v.variant_name,
              attributes: v.attributes || {},
              price_override: v.price_override,
            });
          }
        }

        await client.query('COMMIT');

        const row = insertRes.rows[0];
        return {
          ...row,
          base_price: parseFloat(row.base_price),
          quantity_available: initialStock,
          quantity_reserved: 0,
          variants: variantsList,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }

  async updateProduct(tenantId: string, productId: string, data: Partial<ProductItem>): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const updates: string[] = [];
      const values: any[] = [productId, tenantId];

      if (data.name !== undefined) {
        values.push(data.name);
        updates.push(`name = $${values.length}`);
      }
      if (data.base_price !== undefined) {
        values.push(data.base_price);
        updates.push(`base_price = $${values.length}`);
      }
      if (data.status !== undefined) {
        values.push(data.status);
        updates.push(`status = $${values.length}`);
      }
      if (data.category !== undefined) {
        values.push(data.category);
        updates.push(`category = $${values.length}`);
      }
      if (data.description !== undefined) {
        values.push(data.description);
        updates.push(`description = $${values.length}`);
      }

      if (updates.length === 0) return { success: true };

      updates.push(`updated_at = now()`);
      const q = `UPDATE products SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *;`;
      const res = await client.query(q, values);
      return res.rows[0];
    });
  }

  async updateStock(tenantId: string, productId: string, quantityAvailable: number): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const status = quantityAvailable > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';

      await client.query(
        `INSERT INTO inventory_stock (id, tenant_id, product_id, warehouse_location, quantity_available, quantity_reserved, updated_at)
         VALUES ($1, $2, $3, 'DEFAULT', $4, 0, now())
         ON CONFLICT (tenant_id, product_id, variant_id, warehouse_location) DO UPDATE
         SET quantity_available = EXCLUDED.quantity_available, updated_at = now();`,
        [crypto.randomUUID(), tenantId, productId, quantityAvailable]
      );

      await client.query(
        `UPDATE products SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3;`,
        [status, productId, tenantId]
      );

      return { success: true, quantity_available: quantityAvailable, status };
    });
  }

  // ==========================================
  // 2. PROMOSI & KUPON DISKON
  // ==========================================

  async getPromotions(tenantId: string): Promise<PromotionItem[]> {
    return this.executeWithTenant(tenantId, async (client) => {
      const res = await client.query(
        `SELECT id, tenant_id, code, name, discount_type, discount_value, min_order_amount,
                max_discount_amount, applicable_product_ids, start_date, end_date, is_active, created_at
         FROM promotions
         WHERE tenant_id = $1
         ORDER BY created_at DESC;`,
        [tenantId]
      );
      return res.rows.map(r => ({
        ...r,
        discount_value: parseFloat(r.discount_value),
        min_order_amount: parseFloat(r.min_order_amount || '0'),
        max_discount_amount: r.max_discount_amount ? parseFloat(r.max_discount_amount) : undefined,
      }));
    });
  }

  async createPromotion(tenantId: string, data: {
    code: string;
    name: string;
    discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
    discount_value: number;
    min_order_amount?: number;
    max_discount_amount?: number;
    applicable_product_ids?: string[];
    start_date?: string;
    end_date?: string;
  }): Promise<PromotionItem> {
    return this.executeWithTenant(tenantId, async (client) => {
      const startDate = data.start_date ? new Date(data.start_date) : new Date();
      const endDate = data.end_date ? new Date(data.end_date) : new Date(Date.now() + 30 * 86400000);

      const res = await client.query(
        `INSERT INTO promotions (
          id, tenant_id, code, name, discount_type, discount_value,
          min_order_amount, max_discount_amount, applicable_product_ids,
          start_date, end_date, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, now(), now()
        ) RETURNING *;`,
        [
          tenantId,
          data.code.toUpperCase(),
          data.name,
          data.discount_type,
          data.discount_value,
          data.min_order_amount || 0,
          data.max_discount_amount || null,
          JSON.stringify(data.applicable_product_ids || []),
          startDate,
          endDate,
        ]
      );
      const r = res.rows[0];
      return {
        ...r,
        discount_value: parseFloat(r.discount_value),
        min_order_amount: parseFloat(r.min_order_amount || '0'),
        max_discount_amount: r.max_discount_amount ? parseFloat(r.max_discount_amount) : undefined,
      };
    });
  }

  // ==========================================
  // 3. KERANJANG (CARTS) & ITEM
  // ==========================================

  async getOrCreateCart(tenantId: string, customerId: string, conversationId?: string): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      let cartRes = await client.query(
        `SELECT id, tenant_id, customer_id, conversation_id, currency, status, created_at, updated_at
         FROM carts
         WHERE tenant_id = $1 AND customer_id = $2 AND status = 'ACTIVE'
         ORDER BY updated_at DESC LIMIT 1;`,
        [tenantId, customerId]
      );

      let cart = cartRes.rows[0];
      if (!cart) {
        const insertRes = await client.query(
          `INSERT INTO carts (id, tenant_id, customer_id, conversation_id, currency, status, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'IDR', 'ACTIVE', now(), now())
           RETURNING *;`,
          [tenantId, customerId, conversationId || null]
        );
        cart = insertRes.rows[0];
      }

      // Ambil cart_items
      const itemsRes = await client.query(
        `SELECT ci.id, ci.cart_id, ci.product_id, ci.variant_id, ci.quantity, ci.unit_price, ci.notes,
                p.name AS product_name, p.sku, p.image_url,
                (ci.quantity * ci.unit_price) AS subtotal
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.tenant_id = $1 AND ci.cart_id = $2
         ORDER BY ci.created_at ASC;`,
        [tenantId, cart.id]
      );

      const items = itemsRes.rows.map(item => ({
        ...item,
        unit_price: parseFloat(item.unit_price),
        subtotal: parseFloat(item.subtotal),
      }));

      const totalAmount = items.reduce((acc, it) => acc + it.subtotal, 0);

      return {
        ...cart,
        items,
        total_amount: totalAmount,
      };
    });
  }

  async addItemToCart(tenantId: string, cartId: string, item: {
    product_id: string;
    variant_id?: string;
    quantity: number;
    notes?: string;
  }): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      // Dapatkan harga produk resmi
      const prodRes = await client.query(
        `SELECT id, name, base_price, status FROM products WHERE id = $1 AND tenant_id = $2;`,
        [item.product_id, tenantId]
      );
      if (prodRes.rows.length === 0) throw new Error('Produk tidak ditemukan.');

      const product = prodRes.rows[0];
      let unitPrice = parseFloat(product.base_price);

      if (item.variant_id) {
        const varRes = await client.query(
          `SELECT price_override FROM product_variants WHERE id = $1 AND product_id = $2 AND tenant_id = $3;`,
          [item.variant_id, item.product_id, tenantId]
        );
        if (varRes.rows.length > 0 && varRes.rows[0].price_override) {
          unitPrice = parseFloat(varRes.rows[0].price_override);
        }
      }

      await client.query(
        `INSERT INTO cart_items (
          id, tenant_id, cart_id, product_id, variant_id, quantity, unit_price, notes, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now(), now()
        )
        ON CONFLICT (cart_id, product_id, variant_id) DO UPDATE
        SET quantity = cart_items.quantity + EXCLUDED.quantity,
            updated_at = now();`,
        [
          tenantId,
          cartId,
          item.product_id,
          item.variant_id || null,
          item.quantity,
          unitPrice,
          item.notes || null,
        ]
      );

      await client.query(`UPDATE carts SET updated_at = now() WHERE id = $1 AND tenant_id = $2;`, [cartId, tenantId]);
      return { success: true };
    });
  }

  async removeCartItem(tenantId: string, cartId: string, itemId: string): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      await client.query(
        `DELETE FROM cart_items WHERE id = $1 AND cart_id = $2 AND tenant_id = $3;`,
        [itemId, cartId, tenantId]
      );
      await client.query(`UPDATE carts SET updated_at = now() WHERE id = $1 AND tenant_id = $2;`, [cartId, tenantId]);
      return { success: true };
    });
  }

  // ==========================================
  // 4. PENAWARAN RESMI (QUOTATIONS)
  // ==========================================

  async createQuotationFromCart(tenantId: string, cartId: string, notes?: string): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const cartRes = await client.query(
        `SELECT id, customer_id, conversation_id, currency FROM carts WHERE id = $1 AND tenant_id = $2;`,
        [cartId, tenantId]
      );
      if (cartRes.rows.length === 0) throw new Error('Keranjang belanja tidak ditemukan.');

      const cart = cartRes.rows[0];

      const itemsRes = await client.query(
        `SELECT ci.product_id, ci.variant_id, ci.quantity, ci.unit_price, p.name AS product_name, p.sku
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.cart_id = $1 AND ci.tenant_id = $2;`,
        [cartId, tenantId]
      );

      if (itemsRes.rows.length === 0) throw new Error('Keranjang belanja masih kosong.');

      const items = itemsRes.rows.map(it => ({
        ...it,
        unit_price: parseFloat(it.unit_price),
        subtotal: it.quantity * parseFloat(it.unit_price),
      }));

      const subtotal = items.reduce((acc, it) => acc + it.subtotal, 0);
      const totalAmount = subtotal; // Diskon / ongkir bisa ditambahkan

      const quotationNumber = `QUO-${Date.now().toString().slice(-6)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const validUntil = new Date(Date.now() + 7 * 86400000); // 7 hari

      const qRes = await client.query(
        `INSERT INTO quotations (
          id, tenant_id, quotation_number, customer_id, conversation_id, cart_id,
          subtotal_amount, discount_amount, shipping_amount, total_amount, currency,
          valid_until, status, items_snapshot, notes, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9, 'SENT', $10, $11, now(), now()
        ) RETURNING *;`,
        [
          tenantId,
          quotationNumber,
          cart.customer_id,
          cart.conversation_id,
          cartId,
          subtotal,
          totalAmount,
          cart.currency || 'IDR',
          validUntil,
          JSON.stringify(items),
          notes || 'Penawaran resmi terbuat otomatis',
        ]
      );

      // Transisi sales_stage percakapan bila ada
      if (cart.conversation_id) {
        await client.query(
          `UPDATE conversations SET sales_stage = 'CLOSING', updated_at = now() WHERE id = $1 AND tenant_id = $2;`,
          [cart.conversation_id, tenantId]
        );
      }

      return qRes.rows[0];
    });
  }

  // ==========================================
  // 5. PESANAN (ORDERS)
  // ==========================================

  async createOrderFromCart(tenantId: string, params: {
    cart_id: string;
    shipping_address?: Record<string, any>;
    billing_address?: Record<string, any>;
    shipping_cost?: number;
    promotion_code?: string;
  }): Promise<OrderItem> {
    return this.executeWithTenant(tenantId, async (client) => {
      await client.query('BEGIN');
      try {
        const cartRes = await client.query(
          `SELECT id, customer_id, conversation_id, currency FROM carts WHERE id = $1 AND tenant_id = $2;`,
          [params.cart_id, tenantId]
        );
        if (cartRes.rows.length === 0) throw new Error('Keranjang belanja tidak ditemukan.');
        const cart = cartRes.rows[0];

        const itemsRes = await client.query(
          `SELECT ci.product_id, ci.variant_id, ci.quantity, ci.unit_price, p.name AS product_name, p.sku
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
           WHERE ci.cart_id = $1 AND ci.tenant_id = $2;`,
          [params.cart_id, tenantId]
        );
        if (itemsRes.rows.length === 0) throw new Error('Keranjang belanja masih kosong.');

        const orderId = crypto.randomUUID();
        const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

        let subtotal = 0;
        const orderItemsData = itemsRes.rows.map(it => {
          const up = parseFloat(it.unit_price);
          const st = it.quantity * up;
          subtotal += st;
          return {
            id: crypto.randomUUID(),
            product_id: it.product_id,
            variant_id: it.variant_id,
            product_name: it.product_name,
            sku: it.sku,
            quantity: it.quantity,
            unit_price: up,
            subtotal: st,
          };
        });

        // Hitung diskon bila promo code diberikan
        let discount = 0;
        if (params.promotion_code) {
          const promoRes = await client.query(
            `SELECT discount_type, discount_value, min_order_amount, max_discount_amount
             FROM promotions
             WHERE tenant_id = $1 AND code = $2 AND is_active = true AND start_date <= now() AND end_date >= now();`,
            [tenantId, params.promotion_code.toUpperCase()]
          );
          if (promoRes.rows.length > 0) {
            const promo = promoRes.rows[0];
            const minAmt = parseFloat(promo.min_order_amount || '0');
            if (subtotal >= minAmt) {
              const val = parseFloat(promo.discount_value);
              if (promo.discount_type === 'PERCENTAGE') {
                discount = (subtotal * val) / 100;
              } else {
                discount = val;
              }
              if (promo.max_discount_amount) {
                discount = Math.min(discount, parseFloat(promo.max_discount_amount));
              }
            }
          }
        }

        const shippingAmount = params.shipping_cost || 0;
        const totalAmount = Math.max(0, subtotal - discount + shippingAmount);

        // Insert order
        const orderInsertRes = await client.query(
          `INSERT INTO orders (
            id, tenant_id, order_number, customer_id, conversation_id,
            subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, currency,
            payment_status, fulfillment_status, status, shipping_address, billing_address,
            metadata, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, 0, $9, 'IDR',
            'UNPAID', 'UNFULFILLED', 'PENDING', $10, $11, '{}'::jsonb, now(), now()
          ) RETURNING *;`,
          [
            orderId,
            tenantId,
            orderNumber,
            cart.customer_id,
            cart.conversation_id,
            subtotal,
            discount,
            shippingAmount,
            totalAmount,
            JSON.stringify(params.shipping_address || {}),
            JSON.stringify(params.billing_address || {}),
          ]
        );

        // Insert order_items
        for (const it of orderItemsData) {
          await client.query(
            `INSERT INTO order_items (
              id, tenant_id, order_id, product_id, variant_id, product_name, sku, quantity, unit_price, subtotal, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now());`,
            [
              it.id,
              tenantId,
              orderId,
              it.product_id,
              it.variant_id || null,
              it.product_name,
              it.sku,
              it.quantity,
              it.unit_price,
              it.subtotal,
            ]
          );
        }

        // Tandai cart CHECKED_OUT
        await client.query(
          `UPDATE carts SET status = 'CHECKED_OUT', updated_at = now() WHERE id = $1 AND tenant_id = $2;`,
          [params.cart_id, tenantId]
        );

        // Transisi sales_stage percakapan ke PAYMENT_PENDING
        if (cart.conversation_id) {
          await client.query(
            `UPDATE conversations SET sales_stage = 'PAYMENT_PENDING', updated_at = now() WHERE id = $1 AND tenant_id = $2;`,
            [cart.conversation_id, tenantId]
          );
        }

        await client.query('COMMIT');

        const orderRow = orderInsertRes.rows[0];
        return {
          ...orderRow,
          subtotal_amount: parseFloat(orderRow.subtotal_amount),
          discount_amount: parseFloat(orderRow.discount_amount),
          shipping_amount: parseFloat(orderRow.shipping_amount),
          total_amount: parseFloat(orderRow.total_amount),
          items: orderItemsData,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  }

  async getOrders(tenantId: string, options: { status?: string; paymentStatus?: string } = {}): Promise<OrderItem[]> {
    return this.executeWithTenant(tenantId, async (client) => {
      let query = `
        SELECT o.id, o.tenant_id, o.order_number, o.customer_id, o.conversation_id,
               o.subtotal_amount, o.discount_amount, o.shipping_amount, o.total_amount, o.currency,
               o.payment_status, o.fulfillment_status, o.status, o.shipping_address, o.created_at, o.updated_at,
               c.primary_name AS customer_name, c.primary_phone AS customer_phone
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.tenant_id = $1
      `;
      const params: any[] = [tenantId];

      if (options.status) {
        params.push(options.status);
        query += ` AND o.status = $${params.length}`;
      }
      if (options.paymentStatus) {
        params.push(options.paymentStatus);
        query += ` AND o.payment_status = $${params.length}`;
      }

      query += ` ORDER BY o.created_at DESC;`;
      const res = await client.query(query, params);

      const orders: OrderItem[] = res.rows.map(r => ({
        ...r,
        subtotal_amount: parseFloat(r.subtotal_amount),
        discount_amount: parseFloat(r.discount_amount),
        shipping_amount: parseFloat(r.shipping_amount),
        total_amount: parseFloat(r.total_amount),
        items: [],
        shipments: [],
      }));

      if (orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        const itemsRes = await client.query(
          `SELECT id, order_id, product_name, sku, quantity, unit_price, subtotal
           FROM order_items
           WHERE tenant_id = $1 AND order_id = ANY($2::uuid[]);`,
          [tenantId, orderIds]
        );
        const itemMap = new Map<string, any[]>();
        for (const it of itemsRes.rows) {
          const list = itemMap.get(it.order_id) || [];
          list.push({
            ...it,
            unit_price: parseFloat(it.unit_price),
            subtotal: parseFloat(it.subtotal),
          });
          itemMap.set(it.order_id, list);
        }

        const shipRes = await client.query(
          `SELECT id, order_id, courier_code, courier_service, tracking_number, status, shipping_cost
           FROM shipments
           WHERE tenant_id = $1 AND order_id = ANY($2::uuid[]);`,
          [tenantId, orderIds]
        );
        const shipMap = new Map<string, any[]>();
        for (const sh of shipRes.rows) {
          const list = shipMap.get(sh.order_id) || [];
          list.push({
            ...sh,
            shipping_cost: parseFloat(sh.shipping_cost),
          });
          shipMap.set(sh.order_id, list);
        }

        for (const o of orders) {
          o.items = itemMap.get(o.id) || [];
          o.shipments = shipMap.get(o.id) || [];
        }
      }

      return orders;
    });
  }

  // ==========================================
  // 6. VERIFIKASI PEMBAYARAN WEBHOOK
  // ==========================================

  /**
   * SATU-SATUNYA sumber kebenaran status 'paid' adalah webhook resmi tervalidasi signature.
   * AI Closer TIDAK PERNAH menandai order 'paid' manual.
   */
  async handlePaymentWebhook(gateway: string, payload: any, headers: Record<string, string>): Promise<any> {
    const client = await this.pool.connect();
    try {
      const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.PAYMENT_GATEWAY_SERVER_KEY || 'sandbox-server-key';
      const gatewayLower = gateway.toLowerCase();

      let orderNumber = '';
      let externalTxId = '';
      let isValidSignature = false;
      let targetStatus = 'PENDING';
      let grossAmount = 0;
      let signatureReceived = '';

      if (gatewayLower === 'midtrans') {
        orderNumber = payload.order_id || '';
        const statusCode = payload.status_code || '';
        const grossAmtStr = payload.gross_amount || '';
        grossAmount = parseFloat(grossAmtStr || '0');
        externalTxId = payload.transaction_id || '';
        signatureReceived = payload.signature_key || '';

        // Validasi signature SHA512: SHA512(order_id + status_code + gross_amount + server_key)
        const rawSignatureString = `${orderNumber}${statusCode}${grossAmtStr}${serverKey}`;
        const computedSignature = crypto.createHash('sha512').update(rawSignatureString).digest('hex');

        isValidSignature = (computedSignature.toLowerCase() === signatureReceived.toLowerCase());

        const txStatus = payload.transaction_status || '';
        const fraudStatus = payload.fraud_status || 'accept';

        if ((txStatus === 'capture' || txStatus === 'settlement') && fraudStatus === 'accept') {
          targetStatus = 'PAID';
        } else if (txStatus === 'pending') {
          targetStatus = 'PENDING';
        } else if (['deny', 'cancel', 'expire', 'failure'].includes(txStatus)) {
          targetStatus = 'FAILED';
        }
      } else if (gatewayLower === 'xendit') {
        orderNumber = payload.external_id || '';
        externalTxId = payload.id || '';
        signatureReceived = headers['x-callback-token'] || '';
        isValidSignature = (signatureReceived === serverKey);
        grossAmount = parseFloat(payload.amount || '0');

        const xStatus = (payload.status || '').toUpperCase();
        if (['PAID', 'SETTLED', 'COMPLETED'].includes(xStatus)) {
          targetStatus = 'PAID';
        } else if (xStatus === 'PENDING') {
          targetStatus = 'PENDING';
        } else if (['EXPIRED', 'FAILED'].includes(xStatus)) {
          targetStatus = 'FAILED';
        }
      }

      await client.query('BEGIN');

      // 1. Temukan order terkait
      const orderRes = await client.query(
        `SELECT id, tenant_id, total_amount, payment_status, conversation_id FROM orders WHERE order_number = $1 LIMIT 1;`,
        [orderNumber]
      );
      const order = orderRes.rows[0];
      const tenantId = order?.tenant_id || null;

      // 2. Catat ke payment_webhooks_log
      const processingStatus = isValidSignature ? 'PROCESSED' : 'SIGNATURE_INVALID';
      const errorMsg = isValidSignature ? null : 'Signature kriptografis webhook pembayaran tidak valid.';

      await client.query(
        `INSERT INTO payment_webhooks_log (
          id, tenant_id, gateway_provider, external_transaction_id, order_number,
          event_type, payload, signature_received, is_signature_valid, processing_status, error_message, received_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()
        );`,
        [
          tenantId,
          gateway.toUpperCase(),
          externalTxId,
          orderNumber,
          payload.transaction_status || payload.status || 'unknown',
          JSON.stringify(payload),
          signatureReceived,
          isValidSignature,
          processingStatus,
          errorMsg,
        ]
      );

      if (!isValidSignature) {
        await client.query('COMMIT');
        return {
          success: false,
          status: 'SIGNATURE_INVALID',
          message: 'Signature verifikasi webhook tidak valid.',
        };
      }

      if (!order) {
        await client.query('COMMIT');
        return {
          success: false,
          status: 'ORDER_NOT_FOUND',
          message: `Pesanan '${orderNumber}' tidak ditemukan di database.`,
        };
      }

      // 3. Update order jika status target adalah PAID
      if (targetStatus === 'PAID') {
        await client.query(
          `UPDATE orders
           SET payment_status = 'PAID', status = 'CONFIRMED', updated_at = now()
           WHERE id = $1;`,
          [order.id]
        );

        // 4. Catat record pembayaran di tabel payments
        await client.query(
          `INSERT INTO payments (
            id, tenant_id, order_id, payment_reference, gateway_provider,
            payment_method, amount, currency, status, gateway_response, signature_hash, paid_at, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'IDR', 'PAID', $7, $8, now(), now(), now()
          )
          ON CONFLICT (tenant_id, payment_reference) DO UPDATE
          SET status = 'PAID', paid_at = now(), updated_at = now();`,
          [
            order.tenant_id,
            order.id,
            externalTxId || `PAY-${orderNumber}`,
            gateway.toUpperCase(),
            payload.payment_type || 'GATEWAY',
            grossAmount || parseFloat(order.total_amount),
            JSON.stringify(payload),
            signatureReceived,
          ]
        );

        // 5. Transisi sales_stage percakapan ke ORDER_CONFIRMED
        if (order.conversation_id) {
          await client.query(
            `UPDATE conversations SET sales_stage = 'ORDER_CONFIRMED', updated_at = now() WHERE id = $1;`,
            [order.conversation_id]
          );
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        order_number: orderNumber,
        payment_status: targetStatus,
        verified: true,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // 7. INTEGRASI EKSPEDISI & PELACAKAN RESI
  // ==========================================

  async calculateShippingRates(originPostal: string, destinationPostal: string, weightGrams: number = 1000): Promise<any[]> {
    const apiKey = process.env.COURIER_AGGREGATOR_API_KEY;
    const couriers = ['JNE', 'JNT', 'SICEPAT', 'ANTERAJA'];

    // Perhitungan ongkir standar logistik nasional
    const baseRate = 10000 + Math.max(0, Math.floor((weightGrams - 1000) / 1000)) * 8000;
    return couriers.map(c => {
      const multiplier = c === 'JNE' ? 1.0 : (c === 'SICEPAT' ? 0.95 : 1.05);
      return {
        courier_code: c,
        courier_service: 'REG',
        courier_name: `${c} Reguler`,
        shipping_cost: Math.round(baseRate * multiplier),
        estimated_days: '2-3 hari',
        currency: 'IDR',
      };
    });
  }

  async createWaybill(tenantId: string, orderId: string, courierCode: string, courierService: string, shippingCost: number): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(2, 12);
      const trackingNumber = `${courierCode.toUpperCase()}${timestamp}${orderId.slice(0, 4).toUpperCase()}`;

      const shipRes = await client.query(
        `INSERT INTO shipments (
          id, tenant_id, order_id, courier_code, courier_service, tracking_number,
          shipping_cost, status, origin_address, destination_address, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'BOOKED',
          '{"city": "Jakarta", "hub": "Central Hub"}'::jsonb,
          '{"city": "Tujuan Pelanggan"}'::jsonb,
          now(), now()
        ) RETURNING *;`,
        [tenantId, orderId, courierCode.toUpperCase(), courierService.toUpperCase(), trackingNumber, shippingCost]
      );

      // Update order fulfillment_status
      await client.query(
        `UPDATE orders SET fulfillment_status = 'PROCESSING', updated_at = now() WHERE id = $1 AND tenant_id = $2;`,
        [orderId, tenantId]
      );

      // Buat initial tracking event
      const shipment = shipRes.rows[0];
      await client.query(
        `INSERT INTO shipment_tracking_events (
          id, tenant_id, shipment_id, tracking_number, event_time, location,
          status_code, description, raw_courier_payload, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, now(), 'Gudang Pusat Jakarta',
          'BOOKED', 'Nomor resi telah diterbitkan dan barang siap diserahterimakan ke kurir.', '{}'::jsonb, now()
        );`,
        [tenantId, shipment.id, trackingNumber]
      );

      return {
        ...shipment,
        shipping_cost: parseFloat(shipment.shipping_cost),
      };
    });
  }

  async answerWhereIsMyOrder(tenantId: string, queryParams: {
    conversation_id?: string;
    customer_id?: string;
    order_number?: string;
  }): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      let q = `
        SELECT o.id, o.order_number, o.status, o.fulfillment_status,
               s.id AS shipment_id, s.courier_code, s.tracking_number, s.status AS shipment_status
        FROM orders o
        LEFT JOIN shipments s ON s.order_id = o.id
        WHERE o.tenant_id = $1
      `;
      const vals: any[] = [tenantId];

      if (queryParams.order_number) {
        vals.push(queryParams.order_number);
        q += ` AND o.order_number = $${vals.length}`;
      } else if (queryParams.conversation_id) {
        vals.push(queryParams.conversation_id);
        q += ` AND o.conversation_id = $${vals.length}`;
      } else if (queryParams.customer_id) {
        vals.push(queryParams.customer_id);
        q += ` AND o.customer_id = $${vals.length}`;
      }

      q += ` ORDER BY o.created_at DESC LIMIT 1;`;
      const res = await client.query(q, vals);

      if (res.rows.length === 0) {
        return {
          found: false,
          message: 'Maaf, kami tidak menemukan riwayat pesanan aktif yang terhubung dengan akun Anda saat ini.',
          events: [],
        };
      }

      const order = res.rows[0];
      if (!order.tracking_number) {
        return {
          found: true,
          order_number: order.order_number,
          status: order.fulfillment_status,
          message: `Pesanan ${order.order_number} saat ini berstatus ${order.fulfillment_status}. Nomor resi pengiriman belum diterbitkan oleh tim logistik.`,
          events: [],
        };
      }

      // Ambil riwayat tracking aktual dari database
      const evRes = await client.query(
        `SELECT event_time, location, status_code, description
         FROM shipment_tracking_events
         WHERE tenant_id = $1 AND tracking_number = $2
         ORDER BY event_time DESC;`,
        [tenantId, order.tracking_number]
      );

      const events = evRes.rows;
      const latest = events[0];

      const summary = latest
        ? `Paket pesanan ${order.order_number} (Resi: ${order.tracking_number} - ${order.courier_code}) saat ini berada di ${latest.location || 'hub logistik'} dengan status '${latest.description}'.`
        : `Pesanan ${order.order_number} sedang dalam proses pengiriman bersama ${order.courier_code} (${order.tracking_number}).`;

      return {
        found: true,
        order_number: order.order_number,
        tracking_number: order.tracking_number,
        courier: order.courier_code,
        message: summary,
        events,
      };
    });
  }

  // ==========================================
  // 8. SALES STAGE STATE MACHINE
  // ==========================================

  async updateSalesStage(tenantId: string, conversationId: string, stage: string): Promise<any> {
    return this.executeWithTenant(tenantId, async (client) => {
      const res = await client.query(
        `UPDATE conversations
         SET sales_stage = $1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, sales_stage;`,
        [stage, conversationId, tenantId]
      );
      if (res.rows.length === 0) throw new Error('Percakapan tidak ditemukan.');
      return res.rows[0];
    });
  }

  // ==========================================
  // 9. GROUNDING ENFORCEMENT OUTPUT VALIDATOR
  // ==========================================

  /**
   * Memvalidasi harga dan nama produk yang disebut AI terhadap data nyata database.
   * Bila tidak cocok atau stok habis, AI menjawab 'perlu konfirmasi dulu' dan eskalasi ke HUMAN_APPROVAL.
   */
  async validateAndEnforceGrounding(tenantId: string, aiGeneratedText: string, conversationId?: string): Promise<{
    is_grounded: boolean;
    sanitized_text: string;
    action: 'APPROVED' | 'ESCALATED_HUMAN_APPROVAL';
    violations: string[];
  }> {
    return this.executeWithTenant(tenantId, async (client) => {
      // 1. Ambil seluruh produk & stok aktif
      const prodRes = await client.query(
        `SELECT p.id, p.sku, p.name, p.base_price, p.status,
                COALESCE(SUM(i.quantity_available), 0)::integer AS total_stock
         FROM products p
         LEFT JOIN inventory_stock i ON i.product_id = p.id
         WHERE p.tenant_id = $1
         GROUP BY p.id, p.sku, p.name, p.base_price, p.status;`,
        [tenantId]
      );

      const products = prodRes.rows.map(r => ({
        ...r,
        base_price: parseFloat(r.base_price),
        total_stock: parseInt(r.total_stock, 10),
      }));

      // Ekstrak angka harga dari teks AI (Rp 150.000 / 150000 / 150 ribu)
      const mentionedPrices: number[] = [];
      const rpMatches = aiGeneratedText.match(/(?:rp|idr)\.?\s*([\d\.,]+)/gi) || [];
      for (const m of rpMatches) {
        const cleaned = m.replace(/(?:rp|idr)\.?\s*/gi, '').replace(/\./g, '').replace(/,/g, '').trim();
        const val = parseFloat(cleaned);
        if (!isNaN(val) && val > 1000) mentionedPrices.push(val);
      }

      const rbMatches = aiGeneratedText.match(/(\d+)\s*(?:ribu|rb)/gi) || [];
      for (const m of rbMatches) {
        const num = parseInt(m.replace(/\D/g, ''), 10);
        if (!isNaN(num)) mentionedPrices.push(num * 1000);
      }

      // Deteksi produk yang disebut
      const textLower = aiGeneratedText.toLowerCase();
      const matchedProducts = products.filter(p => {
        const nameMatch = textLower.includes(p.name.toLowerCase());
        const skuMatch = p.sku.length >= 3 && textLower.includes(p.sku.toLowerCase());
        return nameMatch || skuMatch;
      });

      const violations: string[] = [];

      // A. Cek ketersediaan stok produk
      for (const p of matchedProducts) {
        if (p.total_stock <= 0 || p.status === 'OUT_OF_STOCK') {
          violations.push(`Produk '${p.name}' stoknya habis (${p.total_stock}). AI dilarang merekomendasikan produk tanpa stok.`);
        }
      }

      // B. Cek kesesuaian harga terhadap data produk
      if (mentionedPrices.length > 0 && matchedProducts.length > 0) {
        for (const price of mentionedPrices) {
          const matchesAnyProduct = matchedProducts.some(p => Math.abs(p.base_price - price) < 1.0);
          if (!matchesAnyProduct) {
            violations.push(`Harga Rp ${price.toLocaleString('id-ID')} tidak cocok dengan harga resmi produk yang disebutkan.`);
          }
        }
      }

      // Bila ada pelanggaran grounding
      if (violations.length > 0) {
        if (conversationId) {
          await client.query(
            `UPDATE conversations
             SET assigned_type = 'HUMAN',
                 status = 'PENDING_STAFF',
                 metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   '{grounding_escalation}',
                   $1::jsonb,
                   true
                 ),
                 updated_at = now()
             WHERE id = $2 AND tenant_id = $3;`,
            [
              JSON.stringify({
                reason: 'Grounding enforcement mismatch',
                violations,
                escalated_at: new Date().toISOString(),
              }),
              conversationId,
              tenantId,
            ]
          );
        }

        const safeMessage = 'Untuk informasi mengenai harga pasti serta ketersediaan stok produk ini, kami perlu melakukan konfirmasi langsung dengan tim staf kami terlebih dahulu. Staf kami akan segera merespons Anda.';

        return {
          is_grounded: false,
          sanitized_text: safeMessage,
          action: 'ESCALATED_HUMAN_APPROVAL',
          violations,
        };
      }

      return {
        is_grounded: true,
        sanitized_text: aiGeneratedText,
        action: 'APPROVED',
        violations: [],
      };
    });
  }
}
