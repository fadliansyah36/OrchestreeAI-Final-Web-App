"""
OrchestreeAI Courier Aggregator & Shipment Tracking Service (PRD v2.2 Bagian 12.6)
Integrasi API kurir resmi dengan COURIER_AGGREGATOR_API_KEY dari .env.
Mendukung:
1. Pengecekan ongkos kirim (shipping rates) antar kota/kecamatan
2. Pembuatan airway bill (resi / tracking number)
3. Polling riwayat pengiriman aktual ke tabel shipment_tracking_events
4. Menjawab pertanyaan pelanggan 'sudah sampai mana' berbasis data event tracking nyata, BUKAN karangan AI.
"""

from app.domains.commerce.courier_service import (
    CourierAggregatorService,
)

__all__ = [
    "CourierAggregatorService",
]
