"""
OrchestreeAI Commerce Grounding Enforcement & Output Validator (PRD v2.2 Bagian 8.6 & 12.4)
Memastikan integritas jawaban AI Agent sebelum dikirim ke pelanggan:
1. Memindai penyebutan nama produk / SKU dan angka harga dalam teks keluaran AI
2. Mencocokkan terhadap basis data nyata products, product_variants, promotions, dan inventory_stock
3. Jika harga tidak sesuai dengan harga resmi di database atau produk tidak ditemukan:
   - AI menahan respons dan menggantinya dengan pernyataan 'perlu konfirmasi dulu'
   - Memicu eskalasi ke HUMAN_APPROVAL (status PENDING_STAFF pada percakapan)
4. Memastikan AI TIDAK PERNAH merekomendasikan produk yang stoknya habis (quantity_available <= 0)
"""

from app.domains.commerce.grounding_validator import (
    CommerceGroundingValidator,
)

__all__ = [
    "CommerceGroundingValidator",
]
