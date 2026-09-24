"""
OrchestreeAI Commerce API Endpoints (PRD v2.2 Bagian 12)
Katalog Produk, Promosi, Keranjang, Pesanan, Pembayaran Webhook,
Ekspedisi Kurir & Pelacakan Resi, Grounding Enforcement & Sales Stage.
"""

import uuid
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Query, Path, Header, Depends
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.core.database import get_database_engine
from app.authz.pdp import require_capability, webhook_endpoint

from app.domains.commerce.payment_webhook import handle_payment_webhook
from app.domains.commerce.sales_stage_machine import SalesStageMachine, SalesStage
from app.domains.commerce.grounding_validator import CommerceGroundingValidator
from app.domains.commerce.courier_service import CourierAggregatorService

router = APIRouter(
    prefix="",
    tags=["Commerce & Sales Engine"],
    dependencies=[Depends(require_capability("commerce.catalog.view"))]
)
webhook_router = APIRouter(
    prefix="/webhooks/payment",
    tags=["Commerce Payment Webhooks"],
    dependencies=[Depends(webhook_endpoint("commerce.payment"))]
)


# Pydantic Schemas

class CreateProductRequest(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: str = "Umum"
    base_price: float = Field(..., ge=0)
    currency: str = "IDR"
    initial_stock: int = Field(0, ge=0)
    image_url: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    variants: List[Dict[str, Any]] = Field(default_factory=list)


class UpdateProductRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    base_price: Optional[float] = None
    status: Optional[str] = None
    image_url: Optional[str] = None


class UpdateStockRequest(BaseModel):
    quantity: int = Field(..., ge=0)
    warehouse_location: str = "DEFAULT"


class CreatePromotionRequest(BaseModel):
    code: str
    name: str
    discount_type: str = "PERCENTAGE"
    discount_value: float = Field(..., ge=0)
    min_order_amount: float = 0
    max_discount_amount: Optional[float] = None
    applicable_product_ids: List[str] = Field(default_factory=list)
    start_date: str
    end_date: str


class AddCartItemRequest(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    quantity: int = Field(1, ge=1)
    notes: Optional[str] = None


class CreateQuotationRequest(BaseModel):
    notes: Optional[str] = None


class CheckoutCartRequest(BaseModel):
    cart_id: str
    customer_id: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    conversation_id: Optional[str] = None
    quotation_id: Optional[str] = None
    shipping_address: Dict[str, Any] = Field(default_factory=dict)
    billing_address: Dict[str, Any] = Field(default_factory=dict)
    shipping_amount: float = 0
    discount_amount: float = 0
    courier_code: Optional[str] = None
    courier_service: Optional[str] = None


class CreateWaybillRequest(BaseModel):
    courier_code: str
    courier_service: str
    shipping_cost: float = 0
    weight_grams: int = Field(default=1000, gt=0)
    origin_address: Dict[str, Any] = Field(default_factory=dict)
    destination_address: Dict[str, Any] = Field(default_factory=dict)


class GroundingValidateRequest(BaseModel):
    text: str
    conversation_id: Optional[str] = None


class UpdateSalesStageRequest(BaseModel):
    conversation_id: str
    stage: str
    trigger_reason: str = "Interaksi pelanggan"


# --- Endpoint Katalog Produk & Inventori ---

@router.get("/tenants/{tenant_id}/commerce/products")
@router.get("/commerce/products")
async def get_products(
    tenant_id: Optional[str] = None,
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """Mengambil katalog produk resmi bertenant dari database nyata."""
    tid = tenant_id or "default"
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tid}
        )
        sql = """
            SELECT p.id, p.tenant_id, p.sku, p.name, p.description, p.category,
                   p.base_price, p.currency, p.status, p.image_url, p.metadata,
                   COALESCE(SUM(s.quantity_available), 0) AS quantity_available,
                   COALESCE(SUM(s.quantity_reserved), 0) AS quantity_reserved,
                   p.created_at, p.updated_at
            FROM products p
            LEFT JOIN inventory_stock s ON s.product_id = p.id AND s.tenant_id = p.tenant_id
            WHERE p.tenant_id = :tenant_id
        """
        params = {"tenant_id": tid}
        if status:
            sql += " AND p.status = :status"
            params["status"] = status
        if search:
            sql += " AND (p.name ILIKE :search OR p.sku ILIKE :search)"
            params["search"] = f"%{search}%"
        sql += " GROUP BY p.id ORDER BY p.created_at DESC;"

        rows = conn.execute(sa.text(sql), params).fetchall()
        products = []
        for r in rows:
            products.append({
                "id": str(r.id),
                "tenant_id": str(r.tenant_id),
                "sku": r.sku,
                "name": r.name,
                "description": r.description,
                "category": r.category,
                "base_price": float(r.base_price),
                "currency": r.currency,
                "status": r.status,
                "image_url": r.image_url,
                "metadata": r.metadata if isinstance(r.metadata, dict) else {},
                "quantity_available": int(r.quantity_available),
                "quantity_reserved": int(r.quantity_reserved),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            })
        return {"status": "ok", "data": products, "products": products}


@router.post("/tenants/{tenant_id}/commerce/products")
@router.post("/commerce/products")
async def create_product(
    tenant_id: Optional[str] = None,
    payload: CreateProductRequest = None,
):
    """Menambahkan produk baru ke katalog resmi."""
    tid = tenant_id or "default"
    if not payload:
        raise HTTPException(status_code=400, detail="Payload produk harus disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tid}
            )
            prod_id = str(uuid.uuid4())
            stock_qty = payload.initial_stock if payload.initial_stock is not None else 10
            prod_status = "ACTIVE" if stock_qty > 0 else "OUT_OF_STOCK"
            conn.execute(
                sa.text("""
                    INSERT INTO products (
                        id, tenant_id, sku, name, description, category,
                        base_price, currency, status, image_url, metadata, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :sku, :name, :description, :category,
                        :base_price, :currency, :status, :image_url, :metadata::jsonb, now(), now()
                    );
                """),
                {
                    "id": prod_id,
                    "tenant_id": tid,
                    "sku": payload.sku,
                    "name": payload.name,
                    "description": payload.description,
                    "category": payload.category or "Umum",
                    "base_price": payload.base_price,
                    "currency": payload.currency or "IDR",
                    "status": prod_status,
                    "image_url": payload.image_url,
                    "metadata": json.dumps(payload.metadata or {}),
                }
            )
            conn.execute(
                sa.text("""
                    INSERT INTO inventory_stock (
                        id, tenant_id, product_id, warehouse_location, quantity_available, quantity_reserved, updated_at
                    ) VALUES (
                        :id, :tenant_id, :prod_id, 'DEFAULT', :quantity, 0, now()
                    );
                """),
                {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tid,
                    "prod_id": prod_id,
                    "quantity": stock_qty
                }
            )
            return {"status": "ok", "product_id": prod_id}


@router.put("/tenants/{tenant_id}/commerce/products/{product_id}")
@router.put("/commerce/products/{product_id}")
async def update_product(
    product_id: str = Path(...),
    tenant_id: Optional[str] = None,
    payload: UpdateProductRequest = None,
):
    """Memperbarui metadata produk di katalog."""
    tid = tenant_id or "default"
    if not payload:
        raise HTTPException(status_code=400, detail="Payload produk harus disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tid}
            )
            updates = []
            params = {"id": product_id, "tenant_id": tid}
            if payload.name is not None:
                updates.append("name = :name")
                params["name"] = payload.name
            if payload.base_price is not None:
                updates.append("base_price = :base_price")
                params["base_price"] = payload.base_price
            if payload.status is not None:
                updates.append("status = :status")
                params["status"] = payload.status
            if payload.description is not None:
                updates.append("description = :description")
                params["description"] = payload.description
            if payload.category is not None:
                updates.append("category = :category")
                params["category"] = payload.category
            if payload.image_url is not None:
                updates.append("image_url = :image_url")
                params["image_url"] = payload.image_url

            if updates:
                updates.append("updated_at = now()")
                sql = f"UPDATE products SET {', '.join(updates)} WHERE id = :id AND tenant_id = :tenant_id"
                conn.execute(sa.text(sql), params)
            return {"status": "ok", "updated": True}


@router.put("/tenants/{tenant_id}/commerce/products/{product_id}/stock")
@router.post("/tenants/{tenant_id}/commerce/products/{product_id}/stock")
@router.post("/commerce/products/{product_id}/stock")
async def update_stock(
    product_id: str = Path(...),
    tenant_id: Optional[str] = None,
    payload: UpdateStockRequest = None,
):
    """Memperbarui tingkat stok gudang aktual produk."""
    tid = tenant_id or "default"
    if not payload:
        raise HTTPException(status_code=400, detail="Payload stok harus disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tid}
            )
            conn.execute(
                sa.text("""
                    INSERT INTO inventory_stock (
                        id, tenant_id, product_id, warehouse_location, quantity_available, quantity_reserved, updated_at
                    ) VALUES (
                        :id, :tenant_id, :product_id, :location, :quantity, 0, now()
                    )
                    ON CONFLICT (tenant_id, product_id, variant_id, warehouse_location)
                    DO UPDATE SET quantity_available = :quantity, updated_at = now();
                """),
                {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tid,
                    "product_id": product_id,
                    "location": payload.warehouse_location or "DEFAULT",
                    "quantity": payload.quantity
                }
            )
            new_status = "ACTIVE" if payload.quantity > 0 else "OUT_OF_STOCK"
            conn.execute(
                sa.text("UPDATE products SET status = :status, updated_at = now() WHERE id = :id AND tenant_id = :tenant_id;"),
                {"status": new_status, "id": product_id, "tenant_id": tid}
            )
            return {"status": "ok", "product_id": product_id, "quantity_available": payload.quantity}


# --- Endpoint Promosi & Kupon Diskon ---

@router.get("/tenants/{tenant_id}/commerce/promotions")
@router.get("/commerce/promotions")
async def get_promotions(tenant_id: Optional[str] = None):
    """Mengambil daftar promosi aktif tenant dari basis data nyata."""
    tid = tenant_id or "default"
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": tid}
        )
        rows = conn.execute(
            sa.text("""
                SELECT id, tenant_id, code, name, discount_type, discount_value,
                       min_order_amount, max_discount_amount, applicable_product_ids,
                       start_date, end_date, is_active, created_at, updated_at
                FROM promotions
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC;
            """),
            {"tenant_id": tid}
        ).fetchall()
        promos = []
        for r in rows:
            promos.append({
                "id": str(r.id),
                "tenant_id": str(r.tenant_id),
                "code": r.code,
                "name": r.name,
                "discount_type": r.discount_type,
                "discount_value": float(r.discount_value),
                "min_order_amount": float(r.min_order_amount or 0),
                "max_discount_amount": float(r.max_discount_amount) if r.max_discount_amount else None,
                "applicable_product_ids": r.applicable_product_ids if isinstance(r.applicable_product_ids, list) else [],
                "start_date": r.start_date.isoformat() if r.start_date else None,
                "end_date": r.end_date.isoformat() if r.end_date else None,
                "is_active": r.is_active,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })
        return {"status": "ok", "data": promos, "promotions": promos}


@router.post("/tenants/{tenant_id}/commerce/promotions")
@router.post("/commerce/promotions")
async def create_promotion(
    tenant_id: Optional[str] = None,
    payload: CreatePromotionRequest = None,
):
    """Menerbitkan aturan promosi diskon baru."""
    tid = tenant_id or "default"
    if not payload:
        raise HTTPException(status_code=400, detail="Payload promosi harus disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tid}
            )
            promo_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO promotions (
                        id, tenant_id, code, name, discount_type, discount_value,
                        min_order_amount, max_discount_amount, applicable_product_ids,
                        start_date, end_date, is_active, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :code, :name, :discount_type, :discount_value,
                        :min_order_amount, :max_discount_amount, :applicable_product_ids::jsonb,
                        :start_date, :end_date, true, now(), now()
                    );
                """),
                {
                    "id": promo_id,
                    "tenant_id": tid,
                    "code": payload.code.upper(),
                    "name": payload.name,
                    "discount_type": payload.discount_type,
                    "discount_value": payload.discount_value,
                    "min_order_amount": payload.min_order_amount,
                    "max_discount_amount": payload.max_discount_amount,
                    "applicable_product_ids": json.dumps(payload.applicable_product_ids or []),
                    "start_date": payload.start_date,
                    "end_date": payload.end_date,
                }
            )
            return {"status": "ok", "promotion_id": promo_id}


# --- Endpoint Keranjang Belanja & Penawaran (Quotation) ---

@router.get("/cart/{customer_id}")
async def get_or_create_cart(
    customer_id: str = Path(...),
    tenant_id: str = Query(...),
    conversation_id: Optional[str] = Query(None),
):
    """Mengambil atau menginisiasi keranjang belanja aktif pelanggan dari data nyata."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            cart_row = conn.execute(
                sa.text("""
                    SELECT id, customer_id, conversation_id, currency, status, created_at, updated_at
                    FROM carts
                    WHERE tenant_id = :tenant_id AND customer_id = :customer_id AND status = 'ACTIVE'
                    ORDER BY created_at DESC
                    LIMIT 1;
                """),
                {"tenant_id": tenant_id, "customer_id": customer_id}
            ).fetchone()

            if not cart_row:
                cart_id = str(uuid.uuid4())
                conn.execute(
                    sa.text("""
                        INSERT INTO carts (id, tenant_id, customer_id, conversation_id, currency, status, created_at, updated_at)
                        VALUES (:id, :tenant_id, :customer_id, :conversation_id, 'IDR', 'ACTIVE', now(), now());
                    """),
                    {"id": cart_id, "tenant_id": tenant_id, "customer_id": customer_id, "conversation_id": conversation_id}
                )
                cart_data = {
                    "id": cart_id,
                    "customer_id": customer_id,
                    "conversation_id": conversation_id,
                    "status": "ACTIVE",
                    "items": []
                }
            else:
                cart_id = str(cart_row.id)
                item_rows = conn.execute(
                    sa.text("""
                        SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity, ci.unit_price, ci.notes,
                               p.name as product_name, p.sku, p.image_url
                        FROM cart_items ci
                        JOIN products p ON p.id = ci.product_id
                        WHERE ci.cart_id = :cart_id AND ci.tenant_id = :tenant_id
                        ORDER BY ci.created_at ASC;
                    """),
                    {"cart_id": cart_id, "tenant_id": tenant_id}
                ).fetchall()
                items = [
                    {
                        "id": str(it.id),
                        "product_id": str(it.product_id),
                        "variant_id": str(it.variant_id) if it.variant_id else None,
                        "product_name": it.product_name,
                        "sku": it.sku,
                        "quantity": it.quantity,
                        "unit_price": float(it.unit_price),
                        "notes": it.notes,
                        "image_url": it.image_url,
                    }
                    for it in item_rows
                ]
                cart_data = {
                    "id": cart_id,
                    "customer_id": str(cart_row.customer_id),
                    "conversation_id": str(cart_row.conversation_id) if cart_row.conversation_id else None,
                    "status": cart_row.status,
                    "items": items,
                }
            return {"status": "ok", "cart": cart_data}


@router.post("/cart/{cart_id}/items")
async def add_cart_item(
    cart_id: str = Path(...),
    tenant_id: str = Query(...),
    payload: AddCartItemRequest = None,
):
    """Menambahkan produk ke keranjang belanja."""
    if not payload:
        raise HTTPException(status_code=400, detail="Payload item harus disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            prod = conn.execute(
                sa.text("SELECT base_price FROM products WHERE id = :id AND tenant_id = :tenant_id"),
                {"id": payload.product_id, "tenant_id": tenant_id}
            ).fetchone()
            if not prod:
                raise HTTPException(status_code=404, detail="Produk tidak ditemukan.")

            unit_price = float(prod.base_price)
            item_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO cart_items (
                        id, tenant_id, cart_id, product_id, variant_id, quantity, unit_price, notes, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :cart_id, :product_id, :variant_id, :quantity, :unit_price, :notes, now(), now()
                    )
                    ON CONFLICT (cart_id, product_id, variant_id)
                    DO UPDATE SET quantity = cart_items.quantity + :quantity, updated_at = now();
                """),
                {
                    "id": item_id,
                    "tenant_id": tenant_id,
                    "cart_id": cart_id,
                    "product_id": payload.product_id,
                    "variant_id": payload.variant_id,
                    "quantity": payload.quantity,
                    "unit_price": unit_price,
                    "notes": payload.notes,
                }
            )
            conn.execute(
                sa.text("UPDATE carts SET updated_at = now() WHERE id = :cart_id AND tenant_id = :tenant_id;"),
                {"cart_id": cart_id, "tenant_id": tenant_id}
            )
            return {"status": "ok", "cart_id": cart_id, "item_id": item_id}


@router.delete("/cart/{cart_id}/items/{item_id}")
async def remove_cart_item(
    cart_id: str = Path(...),
    item_id: str = Path(...),
    tenant_id: str = Query(...),
):
    """Menghapus item dari keranjang belanja."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            conn.execute(
                sa.text("DELETE FROM cart_items WHERE id = :item_id AND cart_id = :cart_id AND tenant_id = :tenant_id;"),
                {"item_id": item_id, "cart_id": cart_id, "tenant_id": tenant_id}
            )
            conn.execute(
                sa.text("UPDATE carts SET updated_at = now() WHERE id = :cart_id AND tenant_id = :tenant_id;"),
                {"cart_id": cart_id, "tenant_id": tenant_id}
            )
            return {"status": "ok", "removed": True}


@router.post("/cart/{cart_id}/quotation")
async def create_quotation(
    cart_id: str = Path(...),
    tenant_id: str = Query(...),
    payload: CreateQuotationRequest = None,
):
    """Menerbitkan quotation (penawaran harga resmi) berbatas waktu dari keranjang belanja."""
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            cart_res = conn.execute(
                sa.text("SELECT customer_id, conversation_id, currency FROM carts WHERE id = :id AND tenant_id = :tenant_id"),
                {"id": cart_id, "tenant_id": tenant_id}
            ).fetchone()
            if not cart_res:
                raise HTTPException(status_code=404, detail="Keranjang belanja tidak ditemukan.")

            items = conn.execute(
                sa.text("""
                    SELECT ci.product_id, ci.variant_id, ci.quantity, ci.unit_price, p.name AS product_name, p.sku
                    FROM cart_items ci
                    JOIN products p ON p.id = ci.product_id
                    WHERE ci.cart_id = :cart_id AND ci.tenant_id = :tenant_id
                """),
                {"cart_id": cart_id, "tenant_id": tenant_id}
            ).fetchall()
            if not items:
                raise HTTPException(status_code=400, detail="Keranjang belanja masih kosong.")

            subtotal = sum(float(it.unit_price) * it.quantity for it in items)
            quo_id = str(uuid.uuid4())
            quo_num = f"QUO-{int(datetime.now().timestamp())}-{uuid.uuid4().hex[:4].upper()}"

            conn.execute(
                sa.text("""
                    INSERT INTO quotations (
                        id, tenant_id, quotation_number, customer_id, conversation_id, cart_id,
                        subtotal_amount, discount_amount, shipping_amount, total_amount, currency,
                        valid_until, status, notes, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :quo_num, :cust_id, :conv_id, :cart_id,
                        :subtotal, 0, 0, :total, 'IDR',
                        now() + interval '3 days', 'SENT', :notes, now(), now()
                    );
                """),
                {
                    "id": quo_id,
                    "tenant_id": tenant_id,
                    "quo_num": quo_num,
                    "cust_id": cart_res.customer_id,
                    "conv_id": cart_res.conversation_id,
                    "cart_id": cart_id,
                    "subtotal": subtotal,
                    "total": subtotal,
                    "notes": payload.notes if payload else None,
                }
            )
            conn.execute(
                sa.text("UPDATE carts SET status = 'CONVERTED_QUOTATION', updated_at = now() WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": cart_id, "tenant_id": tenant_id}
            )
            return {
                "status": "ok",
                "quotation": {
                    "id": quo_id,
                    "quotation_number": quo_num,
                    "total_amount": subtotal,
                    "status": "SENT"
                }
            }


@router.post("/cart/checkout")
async def checkout_cart(
    tenant_id: str = Query(...),
    payload: CheckoutCartRequest = None,
):
    """Mengonversi keranjang belanja aktif menjadi pesanan (order) resmi."""
    if not payload:
        raise HTTPException(status_code=400, detail="Payload checkout harus disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": tenant_id}
            )
            cart = conn.execute(
                sa.text("SELECT id, customer_id, conversation_id FROM carts WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": payload.cart_id, "tenant_id": tenant_id}
            ).fetchone()
            if not cart:
                raise HTTPException(status_code=404, detail="Keranjang belanja tidak ditemukan.")

            items = conn.execute(
                sa.text("""
                    SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity, ci.unit_price, p.name AS product_name, p.sku
                    FROM cart_items ci
                    JOIN products p ON p.id = ci.product_id
                    WHERE ci.cart_id = :cart_id AND ci.tenant_id = :tenant_id;
                """),
                {"cart_id": payload.cart_id, "tenant_id": tenant_id}
            ).fetchall()
            if not items:
                raise HTTPException(status_code=400, detail="Keranjang belanja masih kosong.")

            subtotal = sum(float(it.unit_price) * it.quantity for it in items)
            order_id = str(uuid.uuid4())
            order_num = f"ORD-{int(datetime.now().timestamp())}-{uuid.uuid4().hex[:4].upper()}"
            total = subtotal + payload.shipping_amount - payload.discount_amount

            conn.execute(
                sa.text("""
                    INSERT INTO orders (
                        id, tenant_id, order_number, customer_id, conversation_id,
                        subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, currency,
                        payment_status, fulfillment_status, status, shipping_address, billing_address,
                        metadata, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :order_num, :cust_id, :conv_id,
                        :subtotal, :discount, :shipping, 0, :total, 'IDR',
                        'UNPAID', 'UNFULFILLED', 'PENDING', :ship_addr::jsonb, :bill_addr::jsonb,
                        '{}'::jsonb, now(), now()
                    );
                """),
                {
                    "id": order_id,
                    "tenant_id": tenant_id,
                    "order_num": order_num,
                    "cust_id": payload.customer_id,
                    "conv_id": cart.conversation_id,
                    "subtotal": subtotal,
                    "discount": payload.discount_amount,
                    "shipping": payload.shipping_amount,
                    "total": max(0, total),
                    "ship_addr": json.dumps(payload.shipping_address),
                    "bill_addr": json.dumps(payload.billing_address),
                }
            )
            for it in items:
                conn.execute(
                    sa.text("""
                        INSERT INTO order_items (
                            id, tenant_id, order_id, product_id, variant_id, product_name, sku, quantity, unit_price, subtotal, created_at
                        ) VALUES (
                            :id, :tenant_id, :order_id, :product_id, :variant_id, :pname, :sku, :qty, :uprice, :subtotal, now()
                        );
                    """),
                    {
                        "id": str(uuid.uuid4()),
                        "tenant_id": tenant_id,
                        "order_id": order_id,
                        "product_id": it.product_id,
                        "variant_id": it.variant_id,
                        "pname": it.product_name,
                        "sku": it.sku,
                        "qty": it.quantity,
                        "uprice": it.unit_price,
                        "subtotal": float(it.unit_price) * it.quantity,
                    }
                )
            conn.execute(
                sa.text("UPDATE carts SET status = 'CHECKED_OUT', updated_at = now() WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": payload.cart_id, "tenant_id": tenant_id}
            )
            return {
                "status": "ok",
                "order": {
                    "id": order_id,
                    "order_number": order_num,
                    "total_amount": max(0, total),
                    "payment_status": "UNPAID",
                }
            }


# --- Endpoint Manajemen Pesanan ---

@router.get("/orders")
@router.get("/tenants/{tenant_id}/commerce/orders")
async def get_orders(
    tenant_id: Optional[str] = None,
    status: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """Mengambil daftar pesanan pelanggan resmi dari database nyata."""
    eff_tenant = tenant_id or x_tenant_id
    if not eff_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": eff_tenant}
        )
        sql = """
            SELECT o.id, o.tenant_id, o.order_number, o.customer_id, o.conversation_id,
                   o.subtotal_amount, o.discount_amount, o.shipping_amount, o.total_amount, o.currency,
                   o.payment_status, o.fulfillment_status, o.status, o.shipping_address, o.created_at, o.updated_at,
                   c.primary_name AS customer_name, c.primary_phone AS customer_phone
            FROM orders o
            LEFT JOIN customers c ON c.id = o.customer_id
            WHERE o.tenant_id = :tenant_id
        """
        params = {"tenant_id": eff_tenant}
        if status:
            sql += " AND o.status = :status"
            params["status"] = status
        if payment_status:
            sql += " AND o.payment_status = :payment_status"
            params["payment_status"] = payment_status
        sql += " ORDER BY o.created_at DESC;"

        rows = conn.execute(sa.text(sql), params).fetchall()
        orders = []
        for r in rows:
            orders.append({
                "id": str(r.id),
                "tenant_id": str(r.tenant_id),
                "order_number": r.order_number,
                "customer_id": str(r.customer_id),
                "customer_name": r.customer_name,
                "customer_phone": r.customer_phone,
                "conversation_id": str(r.conversation_id) if r.conversation_id else None,
                "subtotal_amount": float(r.subtotal_amount),
                "discount_amount": float(r.discount_amount),
                "shipping_amount": float(r.shipping_amount),
                "total_amount": float(r.total_amount),
                "currency": r.currency,
                "payment_status": r.payment_status,
                "fulfillment_status": r.fulfillment_status,
                "status": r.status,
                "shipping_address": r.shipping_address if isinstance(r.shipping_address, dict) else {},
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            })
        return {"status": "ok", "orders": orders}


@router.post("/orders/{order_id}/waybill")
@router.post("/tenants/{tenant_id}/commerce/orders/{order_id}/waybill")
async def create_waybill(
    order_id: str = Path(...),
    tenant_id: Optional[str] = None,
    payload: CreateWaybillRequest = None,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """Menerbitkan resi pengiriman (AWB) dari ekspedisi resmi."""
    eff_tenant = tenant_id or x_tenant_id
    if not eff_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")
    if not payload:
        raise HTTPException(status_code=400, detail="Payload waybill harus disertakan.")
    courier_svc = CourierAggregatorService()
    awb = await courier_svc.generate_waybill(
        courier_code=payload.courier_code,
        service_type=payload.courier_service,
        order_id=order_id,
        shipper_details={},
        recipient_details=payload.destination_address,
        parcel_details={"weight_grams": payload.weight_grams},
    )
    engine = get_database_engine()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
                {"tenant_id": eff_tenant}
            )
            shipment_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO shipments (
                        id, tenant_id, order_id, tracking_number, courier_code, service_type,
                        shipping_cost, status, destination_address, created_at, updated_at
                    ) VALUES (
                        :id, :tenant_id, :order_id, :tracking_number, :courier_code, :service_type,
                        :shipping_cost, 'SHIPPED', :dest::jsonb, now(), now()
                    );
                """),
                {
                    "id": shipment_id,
                    "tenant_id": tenant_id,
                    "order_id": order_id,
                    "tracking_number": awb.get("tracking_number"),
                    "courier_code": payload.courier_code,
                    "service_type": payload.courier_service,
                    "shipping_cost": payload.shipping_cost,
                    "dest": json.dumps(payload.destination_address),
                }
            )
            conn.execute(
                sa.text("UPDATE orders SET fulfillment_status = 'SHIPPED', status = 'PROCESSING', updated_at = now() WHERE id = :id AND tenant_id = :tenant_id;"),
                {"id": order_id, "tenant_id": tenant_id}
            )
    return {"status": "ok", "shipment": awb}


# --- Endpoint Ekspedisi & Tracking Resi ---

@router.get("/shipping/rates")
async def get_shipping_rates(
    tenant_id: str = Query(...),
    origin_postal: str = Query("10110"),
    destination_postal: str = Query("12345"),
    weight_grams: int = Query(1000),
):
    """Mengecek tarif ongkir resmi kurir (JNE, J&T, SiCepat, AnterAja)."""
    courier_svc = CourierAggregatorService()
    rates = await courier_svc.calculate_shipping_rates(
        origin_postal_code=origin_postal,
        destination_postal_code=destination_postal,
        weight_grams=weight_grams,
    )
    return {"status": "ok", "rates": rates}


@router.get("/shipping/tracking")
@router.get("/tenants/{tenant_id}/commerce/shipping/tracking")
async def get_shipping_tracking(
    tenant_id: Optional[str] = None,
    order_number: Optional[str] = Query(None),
    tracking_number: Optional[str] = Query(None),
    conversation_id: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """Menjawab pertanyaan pelacakan 'sudah sampai mana' HANYA berbasis event tracking nyata."""
    eff_tenant = tenant_id or x_tenant_id
    if not eff_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")
    engine = get_database_engine()
    with engine.connect() as conn:
        conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
        conn.execute(
            sa.text("SELECT set_config('app.tenant_id', :tenant_id, true);"),
            {"tenant_id": eff_tenant}
        )
        sql = """
            SELECT s.id, s.order_id, s.tracking_number, s.courier_code, s.service_type,
                   s.status, s.shipping_cost, s.created_at, s.updated_at,
                   o.order_number
            FROM shipments s
            JOIN orders o ON o.id = s.order_id
            WHERE s.tenant_id = :tenant_id
        """
        params = {"tenant_id": eff_tenant}
        if tracking_number:
            sql += " AND s.tracking_number = :tn"
            params["tn"] = tracking_number
        elif order_number:
            sql += " AND o.order_number = :on"
            params["on"] = order_number
        sql += " ORDER BY s.created_at DESC LIMIT 1;"

        shipment = conn.execute(sa.text(sql), params).fetchone()
        if not shipment:
            return {"status": "ok", "tracking": None, "message": "Belum ada resi tercatat untuk pesanan ini."}

        courier_svc = CourierAggregatorService()
        events = await courier_svc.track_shipment(shipment.courier_code, shipment.tracking_number)
        return {
            "status": "ok",
            "tracking": {
                "order_number": shipment.order_number,
                "courier_code": shipment.courier_code,
                "tracking_number": shipment.tracking_number,
                "current_status": shipment.status,
                "events": events.get("events", []),
            }
        }


# --- Endpoint Penegakan Grounding AI Commerce ---

@router.post("/grounding/validate")
@router.post("/tenants/{tenant_id}/commerce/validate-grounding")
async def validate_grounding(
    tenant_id: Optional[str] = None,
    payload: GroundingValidateRequest = None,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-Id"),
):
    """Penegakan Grounding Output Validator harga & stok sebelum AI mengirim jawaban."""
    eff_tenant = tenant_id or x_tenant_id
    if not eff_tenant:
        raise HTTPException(status_code=400, detail="Tenant ID wajib disertakan.")
    if not payload:
        raise HTTPException(status_code=400, detail="Payload validasi harus disertakan.")
    validator = CommerceGroundingValidator(eff_tenant)
    validation = await validator.validate_response(payload.text, payload.conversation_id)
    return {"status": "ok", "grounding": validation}


class WebhookSignatureIn(BaseModel):
    order_id: Optional[str] = None
    status_code: Optional[str] = "200"
    gross_amount: Optional[str] = "0"
    server_key: Optional[str] = None


@router.post("/commerce/webhook-signature")
async def generate_webhook_signature_endpoint(payload: WebhookSignatureIn):
    """Menghasilkan signature SHA512 untuk verifikasi webhook payment gateway."""
    import hashlib
    raw = f"{payload.order_id or ''}{payload.status_code or '200'}{payload.gross_amount or '0'}{payload.server_key or ''}"
    sig = hashlib.sha512(raw.encode("utf-8")).hexdigest()
    return {"status": "ok", "signature_key": sig}


@router.put("/conversations/sales-stage")
async def update_sales_stage(
    tenant_id: str = Query(...),
    payload: UpdateSalesStageRequest = None,
):
    """Transisi state machine SalesStage percakapan."""
    if not payload:
        raise HTTPException(status_code=400, detail="Payload sales stage harus disertakan.")
    machine = SalesStageMachine(tenant_id)
    new_stage = await machine.transition_stage(
        conversation_id=payload.conversation_id,
        target_stage=payload.stage,
        trigger_reason=payload.trigger_reason,
    )
    return {"status": "ok", "stage": new_stage}


# --- Webhook Router: Pembayaran Resmi Gateway (Midtrans / Xendit) ---

@webhook_router.post("/{gateway}")
async def receive_payment_webhook(
    gateway: str = Path(..., description="Gateway pembayaran: midtrans atau xendit"),
    request: Request = None,
):
    """
    SATU-SATUNYA sumber kebenaran status 'paid' adalah webhook resmi yang tervalidasi signature.
    AI Closer TIDAK PERNAH menandai pesanan 'paid' secara manual.
    """
    payload = await request.json() if request else {}
    headers = dict(request.headers) if request else {}
    res = await handle_payment_webhook(gateway, payload, headers)
    return res
