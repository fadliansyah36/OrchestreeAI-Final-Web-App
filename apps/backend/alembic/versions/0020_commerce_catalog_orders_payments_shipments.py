"""Commerce Catalog, Inventori, Promosi, Keranjang, Pesanan, Pembayaran Webhook, Ekspedisi & Tracking (PRD v2.2 Bagian 12)

Revision ID: 0020_commerce_catalog_orders_payments_shipments
Revises: 0019_persona_handoff_and_leads
Create Date: 2026-09-24 00:00:00.000000

Skema:
- Perluasan conversations dengan kolom sales_stage
- Tabel products, product_variants, inventory_stock, product_relations
- Tabel promotions, carts, cart_items, quotations
- Tabel orders, order_items, payments, payment_webhooks_log
- Tabel shipments, shipment_tracking_events
- RLS FORCE bertenant pada seluruh 14 tabel
- Registrasi capabilities di feature_capabilities
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0020_commerce_catalog_orders_payments_shipments"
down_revision: Union[str, None] = "0019_persona_handoff_and_leads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. State machine sales_stage pada conversations
    op.execute("""
    ALTER TABLE conversations 
    ADD COLUMN IF NOT EXISTS sales_stage text NOT NULL DEFAULT 'GREETING'
    CHECK (sales_stage IN (
        'GREETING', 'DISCOVERY', 'RECOMMENDATION', 'OBJECTION_HANDLING', 
        'CLOSING', 'CART_CHECKOUT', 'PAYMENT_PENDING', 'ORDER_CONFIRMED', 
        'POST_SALE', 'RETENTION'
    ));

    CREATE INDEX IF NOT EXISTS idx_conversations_tenant_sales_stage 
    ON conversations(tenant_id, sales_stage);
    """)

    # 2. Products
    op.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        sku text NOT NULL,
        name text NOT NULL,
        description text,
        category text NOT NULL DEFAULT 'Umum',
        base_price numeric(15, 2) NOT NULL CHECK (base_price >= 0),
        currency text NOT NULL DEFAULT 'IDR',
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'OUT_OF_STOCK')),
        image_url text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_products_tenant_sku UNIQUE (tenant_id, sku)
    );

    CREATE INDEX IF NOT EXISTS idx_products_tenant_status ON products(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_products_tenant_name ON products(tenant_id, name);
    """)

    # 3. Product Variants
    op.execute("""
    CREATE TABLE IF NOT EXISTS product_variants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_sku text NOT NULL,
        variant_name text NOT NULL,
        attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
        price_override numeric(15, 2),
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'OUT_OF_STOCK')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_variants_tenant_sku UNIQUE (tenant_id, variant_sku)
    );

    CREATE INDEX IF NOT EXISTS idx_variants_tenant_product ON product_variants(tenant_id, product_id);
    """)

    # 4. Inventory Stock
    op.execute("""
    CREATE TABLE IF NOT EXISTS inventory_stock (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
        warehouse_location text NOT NULL DEFAULT 'DEFAULT',
        quantity_available integer NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
        quantity_reserved integer NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
        low_stock_threshold integer NOT NULL DEFAULT 5,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_inventory_tenant_prod_var_wh UNIQUE (tenant_id, product_id, variant_id, warehouse_location)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_tenant_product ON inventory_stock(tenant_id, product_id);
    """)

    # 5. Product Relations
    op.execute("""
    CREATE TABLE IF NOT EXISTS product_relations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        related_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        relation_type text NOT NULL CHECK (relation_type IN ('UPSELL', 'CROSS_SELL', 'BUNDLE', 'ALTERNATIVE', 'COMPLEMENTARY')),
        priority integer NOT NULL DEFAULT 10,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_product_relations UNIQUE (tenant_id, product_id, related_product_id, relation_type)
    );

    CREATE INDEX IF NOT EXISTS idx_product_relations_lookup ON product_relations(tenant_id, product_id, relation_type);
    """)

    # 6. Promotions
    op.execute("""
    CREATE TABLE IF NOT EXISTS promotions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        code text NOT NULL,
        name text NOT NULL,
        discount_type text NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING')),
        discount_value numeric(15, 2) NOT NULL CHECK (discount_value >= 0),
        min_order_amount numeric(15, 2) DEFAULT 0,
        max_discount_amount numeric(15, 2),
        applicable_product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        start_date timestamptz NOT NULL,
        end_date timestamptz NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_promotions_tenant_code UNIQUE (tenant_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_promotions_tenant_active ON promotions(tenant_id, is_active, start_date, end_date);
    """)

    # 7. Carts
    op.execute("""
    CREATE TABLE IF NOT EXISTS carts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
        currency text NOT NULL DEFAULT 'IDR',
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CHECKED_OUT', 'ABANDONED', 'CONVERTED_QUOTATION')),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_carts_tenant_customer ON carts(tenant_id, customer_id, status);
    CREATE INDEX IF NOT EXISTS idx_carts_conversation ON carts(tenant_id, conversation_id);
    """)

    # 8. Cart Items
    op.execute("""
    CREATE TABLE IF NOT EXISTS cart_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
        quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
        unit_price numeric(15, 2) NOT NULL CHECK (unit_price >= 0),
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_cart_items_item UNIQUE (cart_id, product_id, variant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(tenant_id, cart_id);
    """)

    # 9. Quotations
    op.execute("""
    CREATE TABLE IF NOT EXISTS quotations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        quotation_number text NOT NULL,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
        cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
        subtotal_amount numeric(15, 2) NOT NULL CHECK (subtotal_amount >= 0),
        discount_amount numeric(15, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
        shipping_amount numeric(15, 2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
        total_amount numeric(15, 2) NOT NULL CHECK (total_amount >= 0),
        currency text NOT NULL DEFAULT 'IDR',
        valid_until timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED_ORDER')),
        items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_quotations_tenant_number UNIQUE (tenant_id, quotation_number)
    );

    CREATE INDEX IF NOT EXISTS idx_quotations_tenant_cust ON quotations(tenant_id, customer_id, status);
    """)

    # 10. Orders
    op.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_number text NOT NULL,
        customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
        quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
        subtotal_amount numeric(15, 2) NOT NULL CHECK (subtotal_amount >= 0),
        discount_amount numeric(15, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
        shipping_amount numeric(15, 2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
        tax_amount numeric(15, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
        total_amount numeric(15, 2) NOT NULL CHECK (total_amount >= 0),
        currency text NOT NULL DEFAULT 'IDR',
        payment_status text NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED')),
        fulfillment_status text NOT NULL DEFAULT 'UNFULFILLED' CHECK (fulfillment_status IN ('UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED')),
        status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
        shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
        billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_orders_tenant_number UNIQUE (tenant_id, order_number)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, payment_status);
    CREATE INDEX IF NOT EXISTS idx_orders_tenant_customer ON orders(tenant_id, customer_id);
    """)

    # 11. Order Items
    op.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
        product_name text NOT NULL,
        sku text NOT NULL,
        quantity integer NOT NULL CHECK (quantity > 0),
        unit_price numeric(15, 2) NOT NULL CHECK (unit_price >= 0),
        subtotal numeric(15, 2) NOT NULL CHECK (subtotal >= 0),
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(tenant_id, order_id);
    """)

    # 12. Payments
    op.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        payment_reference text NOT NULL,
        gateway_provider text NOT NULL DEFAULT 'MIDTRANS' CHECK (gateway_provider IN ('MIDTRANS', 'XENDIT', 'BANK_TRANSFER', 'MANUAL')),
        payment_method text,
        amount numeric(15, 2) NOT NULL CHECK (amount >= 0),
        currency text NOT NULL DEFAULT 'IDR',
        status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SETTLEMENT', 'PAID', 'EXPIRE', 'CANCEL', 'DENY', 'REFUND')),
        gateway_response jsonb NOT NULL DEFAULT '{}'::jsonb,
        signature_hash text,
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_payments_tenant_ref UNIQUE (tenant_id, payment_reference)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(tenant_id, order_id, status);
    """)

    # 13. Payment Webhooks Log
    op.execute("""
    CREATE TABLE IF NOT EXISTS payment_webhooks_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
        gateway_provider text NOT NULL,
        external_transaction_id text,
        order_number text,
        event_type text,
        payload jsonb NOT NULL,
        signature_received text,
        is_signature_valid boolean NOT NULL DEFAULT false,
        processing_status text NOT NULL DEFAULT 'PROCESSED' CHECK (processing_status IN ('PROCESSED', 'IGNORED', 'FAILED', 'SIGNATURE_INVALID')),
        error_message text,
        received_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_payment_webhooks_order ON payment_webhooks_log(order_number);
    """)

    # 14. Shipments
    op.execute("""
    CREATE TABLE IF NOT EXISTS shipments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        courier_code text NOT NULL,
        courier_service text NOT NULL,
        tracking_number text NOT NULL,
        shipping_cost numeric(15, 2) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED')),
        origin_address jsonb NOT NULL DEFAULT '{}'::jsonb,
        destination_address jsonb NOT NULL DEFAULT '{}'::jsonb,
        shipped_at timestamptz,
        delivered_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_shipments_tenant_tracking UNIQUE (tenant_id, tracking_number)
    );

    CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(tenant_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tenant_id, tracking_number);
    """)

    # 15. Shipment Tracking Events
    op.execute("""
    CREATE TABLE IF NOT EXISTS shipment_tracking_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
        tracking_number text NOT NULL,
        event_time timestamptz NOT NULL,
        location text,
        status_code text NOT NULL,
        description text NOT NULL,
        raw_courier_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment ON shipment_tracking_events(tenant_id, shipment_id, event_time DESC);
    """)

    # 16. RLS FORCE bertenant pada 14 tabel
    commerce_tables = [
        "products",
        "product_variants",
        "inventory_stock",
        "product_relations",
        "promotions",
        "carts",
        "cart_items",
        "quotations",
        "orders",
        "order_items",
        "payments",
        "payment_webhooks_log",
        "shipments",
        "shipment_tracking_events",
    ]

    for table in commerce_tables:
        op.execute(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_{table} ON {table};
        CREATE POLICY tenant_isolation_{table} ON {table}
            FOR ALL
            USING (
                tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                OR
                tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
                OR
                tenant_id IS NULL
            )
            WITH CHECK (
                tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
                OR
                tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
                OR
                tenant_id IS NULL
            );
        """)

    # 17. Grant privileges
    op.execute(f"""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orchestree_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON {", ".join(commerce_tables)} TO orchestree_app;
        END IF;
    END $$;
    """)

    # 18. Registrasi feature_capabilities
    op.execute("""
    INSERT INTO feature_capabilities (capability_key, min_tier_level, description)
    VALUES 
        ('commerce.catalog', 1, 'Katalog Produk & Inventori - Pengelolaan SKU produk, varian, tingkat stok gudang, dan relasi upsell/cross-sell.'),
        ('commerce.order_management', 1, 'Manajemen Pesanan & Quotation - Siklus transaksi dari keranjang, penawaran resmi, hingga pembuatan order.'),
        ('commerce.payment_webhook', 1, 'Verifikasi Webhook Pembayaran - Sumber kebenaran mutlak status pembayaran terverifikasi signature kriptografis.'),
        ('commerce.courier_tracking', 1, 'Integrasi Ekspedisi & Pelacakan Resi - Pengecekan ongkos kirim resmi, penerbitan AWB, dan pelacakan riwayat paket real-time.'),
        ('commerce.grounding_enforcement', 1, 'Penegakan Grounding AI Commerce - Validasi otomatis harga dan ketersediaan stok produk sebelum AI menjawab customer.')
    ON CONFLICT (capability_key) DO UPDATE 
    SET description = EXCLUDED.description;
    """)


def downgrade() -> None:
    commerce_tables = [
        "shipment_tracking_events",
        "shipments",
        "payment_webhooks_log",
        "payments",
        "order_items",
        "orders",
        "quotations",
        "cart_items",
        "carts",
        "promotions",
        "product_relations",
        "inventory_stock",
        "product_variants",
        "products",
    ]
    for table in commerce_tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
    
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS sales_stage;")
    op.execute("""
    DELETE FROM feature_capabilities 
    WHERE capability_key IN (
        'commerce.catalog', 'commerce.order_management', 'commerce.payment_webhook', 
        'commerce.courier_tracking', 'commerce.grounding_enforcement'
    );
    """)
