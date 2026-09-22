"""
OrchestreeAI Commerce Grounding Enforcement & Output Validator (PRD v2.2 Bagian 8.6 & 12.4)
Memastikan integritas jawaban AI Agent sebelum dikirim ke pelanggan:
1. Memindai penyebutan nama produk / SKU dan angka harga dalam teks keluaran AI
2. Mencocokkan terhadap basis data nyata `products`, `product_variants`, `promotions`, dan `inventory_stock`
3. Jika harga tidak sesuai dengan harga resmi di database atau produk tidak ditemukan:
   - AI menahan respons dan menggantinya dengan pernyataan 'perlu konfirmasi dulu'
   - Memicu eskalasi ke HUMAN_APPROVAL (status PENDING_STAFF pada percakapan)
4. Memastikan AI TIDAK PERNAH merekomendasikan produk yang stoknya habis (quantity_available <= 0)
"""

import re
import logging
from typing import Dict, Any, List, Optional, Tuple

try:
    import sqlalchemy as sa
    from sqlalchemy.orm import Session
except ImportError:  # allowlist: sqlalchemy shim
    class _SafeSA:
        @staticmethod
        def text(sql: str):
            return sql
    sa = _SafeSA()
    Session = Any  # type: ignore

logger = logging.getLogger("orchestree.commerce.grounding")


class CommerceGroundingValidator:
    def __init__(self, db_session: Session, tenant_id: str):
        self.db = db_session
        self.tenant_id = tenant_id

    def extract_price_mentions(self, text: str) -> List[float]:
        """
        Mengekstrak penyebutan angka harga dari teks (misal: 'Rp 150.000', 'Rp150000', '150 ribu', 'Rp 25.000').
        """
        prices = []
        # Pola Rp 150.000 / Rp150000 / Rp 150,000
        rp_patterns = re.findall(r'(?:rp|idr)\.?\s*([\d\.,]+)', text, flags=re.IGNORECASE)
        for p_str in rp_patterns:
            cleaned = p_str.replace(".", "").replace(",", "").strip()
            if cleaned.isdigit():
                val = float(cleaned)
                if val > 1000:  # Ambang batas wajar rupiah
                    prices.append(val)

        # Pola 'XXX ribu'
        k_patterns = re.findall(r'(\d+)\s*(?:ribu|rb)', text, flags=re.IGNORECASE)
        for k_str in k_patterns:
            if k_str.isdigit():
                prices.append(float(k_str) * 1000)

        return prices

    def find_mentioned_products(self, text: str) -> List[Dict[str, Any]]:
        """
        Mencari produk aktif dalam database yang namanya atau SKU-nya disebut dalam teks AI.
        """
        query = sa.text("""
            SELECT p.id, p.sku, p.name, p.base_price, p.status,
                   COALESCE(SUM(i.quantity_available), 0) AS total_stock
            FROM products p
            LEFT JOIN inventory_stock i ON i.product_id = p.id
            WHERE p.tenant_id = :tenant_id
            GROUP BY p.id, p.sku, p.name, p.base_price, p.status;
        """)
        products = self.db.execute(query, {"tenant_id": self.tenant_id}).mappings().all()

        text_lower = text.lower()
        matched = []
        for p in products:
            p_name = p["name"].lower()
            p_sku = p["sku"].lower()
            if p_name in text_lower or (len(p_sku) >= 3 and p_sku in text_lower):
                matched.append({
                    "id": str(p["id"]),
                    "sku": p["sku"],
                    "name": p["name"],
                    "base_price": float(p["base_price"]),
                    "status": p["status"],
                    "total_stock": int(p["total_stock"]),
                })
        return matched

    def validate_and_enforce_grounding(
        self,
        ai_generated_text: str,
        conversation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mengevaluasi output AI:
        - Bila harga yang disebut tidak sesuai dengan data resmi di database: GAGAL
        - Bila merekomendasikan produk dengan stok 0 / habis: GAGAL
        - Mengembalikan teks yang aman atau hasil eskalasi ke HUMAN_APPROVAL
        """
        mentioned_products = self.find_mentioned_products(ai_generated_text)
        mentioned_prices = self.extract_price_mentions(ai_generated_text)

        violations = []

        # 1. Cek Ketersediaan Stok Produk yang Disebutkan
        for prod in mentioned_products:
            if prod["total_stock"] <= 0 or prod["status"] == "OUT_OF_STOCK":
                violations.append(
                    f"Produk '{prod['name']}' (SKU: {prod['sku']}) stoknya habis (stok: {prod['total_stock']}). AI dilarang merekomendasikan produk habis."
                )

        # 2. Cek Kesesuaian Harga
        # Ambil seluruh promo aktif untuk tenant
        promo_query = sa.text("""
            SELECT code, discount_type, discount_value, applicable_product_ids
            FROM promotions
            WHERE tenant_id = :tenant_id 
              AND is_active = true 
              AND start_date <= now() 
              AND end_date >= now();
        """)
        promos = self.db.execute(promo_query, {"tenant_id": self.tenant_id}).mappings().all()

        for price in mentioned_prices:
            # Verifikasi apakah angka harga cocok dengan produk manapun yang terdaftar (termasuk diskon promo)
            price_matched = False
            for prod in mentioned_products:
                base = prod["base_price"]
                # Cek harga normal
                if abs(price - base) < 1.0:
                    price_matched = True
                    break
                # Cek kemungkinan harga setelah diskon
                for promo in promos:
                    app_ids = promo["applicable_product_ids"] or []
                    if not app_ids or prod["id"] in app_ids:
                        disc_val = float(promo["discount_value"])
                        if promo["discount_type"] == "PERCENTAGE":
                            calc_price = base * (1.0 - (disc_val / 100.0))
                        else:
                            calc_price = max(0.0, base - disc_val)
                        if abs(price - calc_price) < 1.0:
                            price_matched = True
                            break
                if price_matched:
                    break

            # Jika ada produk yang disebut tapi harga yang disebut tidak cocok dengan harga resmi
            if mentioned_products and not price_matched:
                violations.append(
                    f"Harga yang disebut (Rp {price:,.0f}) tidak cocok dengan harga katalog resmi produk yang bersangkutan."
                )

        if violations:
            logger.warning(
                f"[GroundingEnforcement] Pelanggaran validasi output AI terdeteksi: {'; '.join(violations)}"
            )

            # Eskalasi ke HUMAN_APPROVAL (PENDING_STAFF) bila percakapan tersedia
            if conversation_id:
                try:
                    self.db.execute(
                        sa.text("""
                            UPDATE conversations
                            SET assigned_type = 'HUMAN',
                                status = 'PENDING_STAFF',
                                metadata = jsonb_set(
                                    COALESCE(metadata, '{}'::jsonb),
                                    '{grounding_escalation}',
                                    :escalation_data::jsonb,
                                    true
                                ),
                                updated_at = now()
                            WHERE id = :conv_id AND tenant_id = :tenant_id;
                        """),
                        {
                            "conv_id": conversation_id,
                            "tenant_id": self.tenant_id,
                            "escalation_data": f'{{"reason": "Grounding enforcement mismatch", "violations": {len(violations)}}}',
                        },
                    )
                    self.db.commit()
                except Exception as e:
                    logger.error(f"Gagal mencatat eskalasi grounding ke percakapan: {e}")

            # Ganti teks AI dengan jawaban aman (tidak mengarang harga/produk)
            safe_message = (
                "Untuk informasi mengenai harga pasti serta ketersediaan stok produk ini, "
                "kami perlu melakukan konfirmasi langsung dengan tim penjualan kami terlebih dahulu. "
                "Staf kami akan segera menindaklanjuti pesan Anda."
            )

            return {
                "is_grounded": False,
                "sanitized_text": safe_message,
                "action": "ESCALATED_HUMAN_APPROVAL",
                "violations": violations,
                "mentioned_products": mentioned_products,
            }

        return {
            "is_grounded": True,
            "sanitized_text": ai_generated_text,
            "action": "APPROVED",
            "violations": [],
            "mentioned_products": mentioned_products,
        }
