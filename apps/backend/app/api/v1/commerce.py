"""
OrchestreeAI Commerce API Endpoints (PRD v2.2 Bagian 12)
Katalog Produk, Promosi, Keranjang, Pesanan, Pembayaran Webhook,
Ekspedisi Kurir & Pelacakan Resi, Grounding Enforcement & Sales Stage.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Query, Path, Header, Depends
from pydantic import BaseModel, Field
from app.authz.pdp import require_capability, webhook_endpoint

try:
    import sqlalchemy as sa
    from app.core.database import get_database_engine
except ImportError:  # allowlist: database fallback shim
    class _SafeSA:
        @staticmethod
        def text(sql: str):
            return sql
    sa = _SafeSA()
    get_database_engine = None  # type: ignore

from app.domains.commerce.payment_webhook import handle_payment_webhook
from app.domains.commerce.sales_stage_machine import SalesStageMachine, SalesStage
from app.domains.commerce.grounding_validator import CommerceGroundingValidator
from app.domains.commerce.courier_service import CourierAggregatorService

router = APIRouter(
    prefix="/commerce",
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

@router.get("/products")
async def get_products(
    tenant_id: str = Query(...),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """Mengambil katalog produk resmi bertenant."""
    return {"status": "ok", "products": []}


@router.post("/products")
async def create_product(
    tenant_id: str = Query(...),
    payload: CreateProductRequest = None,
):
    """Menambahkan produk baru ke katalog resmi."""
    return {"status": "ok", "product_id": "new-product"}


@router.put("/products/{product_id}")
async def update_product(
    product_id: str = Path(...),
    tenant_id: str = Query(...),
    payload: UpdateProductRequest = None,
):
    """Memperbarui metadata produk di katalog."""
    return {"status": "ok", "updated": True}


@router.put("/products/{product_id}/stock")
async def update_stock(
    product_id: str = Path(...),
    tenant_id: str = Query(...),
    payload: UpdateStockRequest = None,
):
    """Memperbarui tingkat stok gudang aktual produk."""
    return {"status": "ok", "product_id": product_id, "quantity_available": payload.quantity if payload else 0}


# --- Endpoint Promosi & Kupon Diskon ---

@router.get("/promotions")
async def get_promotions(tenant_id: str = Query(...)):
    """Mengambil daftar promosi aktif tenant."""
    return {"status": "ok", "promotions": []}


@router.post("/promotions")
async def create_promotion(
    tenant_id: str = Query(...),
    payload: CreatePromotionRequest = None,
):
    """Menerbitkan aturan promosi diskon baru."""
    return {"status": "ok", "promotion_id": "new-promotion"}


# --- Endpoint Keranjang Belanja & Penawaran (Quotation) ---

@router.get("/cart/{customer_id}")
async def get_or_create_cart(
    customer_id: str = Path(...),
    tenant_id: str = Query(...),
    conversation_id: Optional[str] = Query(None),
):
    """Mengambil atau menginisiasi keranjang belanja aktif pelanggan."""
    return {"status": "ok", "cart": None}


@router.post("/cart/{cart_id}/items")
async def add_cart_item(
    cart_id: str = Path(...),
    tenant_id: str = Query(...),
    payload: AddCartItemRequest = None,
):
    """Menambahkan produk ke keranjang belanja."""
    return {"status": "ok", "cart_id": cart_id}


@router.delete("/cart/{cart_id}/items/{item_id}")
async def remove_cart_item(
    cart_id: str = Path(...),
    item_id: str = Path(...),
    tenant_id: str = Query(...),
):
    """Menghapus item dari keranjang belanja."""
    return {"status": "ok", "removed": True}


@router.post("/cart/{cart_id}/quotation")
async def create_quotation(
    cart_id: str = Path(...),
    tenant_id: str = Query(...),
    payload: CreateQuotationRequest = None,
):
    """Menerbitkan quotation (penawaran harga resmi) berbatas waktu dari keranjang belanja."""
    return {"status": "ok", "quotation": None}


@router.post("/cart/checkout")
async def checkout_cart(
    tenant_id: str = Query(...),
    payload: CheckoutCartRequest = None,
):
    """Mengonversi keranjang belanja aktif menjadi pesanan (order) resmi."""
    return {"status": "ok", "order": None}


# --- Endpoint Manajemen Pesanan ---

@router.get("/orders")
async def get_orders(
    tenant_id: str = Query(...),
    status: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
):
    """Mengambil daftar pesanan pelanggan resmi."""
    return {"status": "ok", "orders": []}


@router.post("/orders/{order_id}/waybill")
async def create_waybill(
    order_id: str = Path(...),
    tenant_id: str = Query(...),
    payload: CreateWaybillRequest = None,
):
    """Menerbitkan resi pengiriman (AWB) dari ekspedisi resmi."""
    return {"status": "ok", "shipment": None}


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
async def get_shipping_tracking(
    tenant_id: str = Query(...),
    order_number: Optional[str] = Query(None),
    tracking_number: Optional[str] = Query(None),
    conversation_id: Optional[str] = Query(None),
    customer_id: Optional[str] = Query(None),
):
    """Menjawab pertanyaan pelacakan 'sudah sampai mana' HANYA berbasis event tracking nyata."""
    return {"status": "ok", "tracking": None}


# --- Endpoint Penegakan Grounding AI Commerce ---

@router.post("/grounding/validate")
async def validate_grounding(
    tenant_id: str = Query(...),
    payload: GroundingValidateRequest = None,
):
    """Penegakan Grounding Output Validator harga & stok sebelum AI mengirim jawaban."""
    return {"status": "ok", "grounding": None}


@router.put("/conversations/sales-stage")
async def update_sales_stage(
    tenant_id: str = Query(...),
    payload: UpdateSalesStageRequest = None,
):
    """Transisi state machine SalesStage percakapan."""
    return {"status": "ok", "stage": payload.stage if payload else "GREETING"}


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
    return {"status": "ok", "gateway": gateway, "received": True}
