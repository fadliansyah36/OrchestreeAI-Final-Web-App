"""
OrchestreeAI Cash Flow Analytics Engine (PRD v2.2 Bagian 8.13.6, 8.13.8)
Python 3.12 + FastAPI + Supabase Postgres

Karakteristik Sumber Data:
- Sumber Internal (All-Tier: Starter, Growth, Pro):
  Menggunakan data transaksi internal SSOT (orders status PAID/COMPLETED, payments, billing ledger).
- Sumber ERP Eksternal (Enterprise Tier - Fase 24):
  Menyinkronkan dan mengharmonisasi data arus kas langsung dari sistem ERP korporat (SAP / NetSuite / Oracle).
"""

from typing import List, Dict, Any, Optional
import uuid
import datetime
import logging

try:
    from pydantic import BaseModel, Field

    class CashFlowItem(BaseModel):
        id: str
        date: str
        description: str
        amount: float
        direction: str  # "INFLOW" atau "OUTFLOW"
        category: str   # REVENUE, REFUND, OPERATIONAL_EXPENSE, VENDOR_PAYMENT, PAYROLL, INFRASTRUCTURE
        source_system: str
        source_reference: Optional[str] = None

    class CashFlowSummary(BaseModel):
        tenant_id: str
        tier_code: str
        period_start: str
        period_end: str
        total_inflows: float
        total_outflows: float
        net_cash_flow: float
        average_daily_burn: float
        estimated_runway_days: Optional[int] = None
        data_source: str  # "INTERNAL_NATIVE_ALL_TIER" atau "EXTERNAL_ERP_ENTERPRISE"
        is_external_erp: bool
        items: List[CashFlowItem] = Field(default_factory=list)
        generated_at: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class CashFlowItem:
        id: str
        date: str
        description: str
        amount: float
        direction: str
        category: str
        source_system: str
        source_reference: Optional[str] = None

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "date": self.date,
                "description": self.description,
                "amount": self.amount,
                "direction": self.direction,
                "category": self.category,
                "source_system": self.source_system,
                "source_reference": self.source_reference,
            }

    @dataclass
    class CashFlowSummary:
        tenant_id: str
        tier_code: str
        period_start: str
        period_end: str
        total_inflows: float
        total_outflows: float
        net_cash_flow: float
        average_daily_burn: float
        data_source: str
        is_external_erp: bool
        estimated_runway_days: Optional[int] = None
        items: List[CashFlowItem] = field(default_factory=list)
        generated_at: str = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

        def model_dump(self) -> Dict[str, Any]:
            return {
                "tenant_id": self.tenant_id,
                "tier_code": self.tier_code,
                "period_start": self.period_start,
                "period_end": self.period_end,
                "total_inflows": self.total_inflows,
                "total_outflows": self.total_outflows,
                "net_cash_flow": self.net_cash_flow,
                "average_daily_burn": self.average_daily_burn,
                "estimated_runway_days": self.estimated_runway_days,
                "data_source": self.data_source,
                "is_external_erp": self.is_external_erp,
                "items": [i.model_dump() if hasattr(i, "model_dump") else i.__dict__ for i in self.items],
                "generated_at": self.generated_at,
            }

logger = logging.getLogger(__name__)


class FinanceCashFlowEngine:
    """
    Mesin Kalkulasi dan Harmonisasi Arus Kas (PRD v2.2 Bagian 8.13.6).
    Memilih sumber data secara sadar hierarki tier:
    - Tier Starter, Growth, Pro -> HANYA sumber internal native.
    - Tier Enterprise -> Mendukung sumber ERP eksternal terintegrasi.
    """

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    async def calculate_cash_flow(
        self,
        tenant_id: str,
        period_start: str,
        period_end: str,
        tier_code: str = "STARTER",
        current_cash_balance: float = 0.0,
        db_connection=None,
        simulated_internal_records: Optional[List[Dict[str, Any]]] = None,
        simulated_erp_records: Optional[List[Dict[str, Any]]] = None,
    ) -> CashFlowSummary:
        """
        Menghitung ringkasan arus kas berdasarkan rentang waktu dan tier langganan.
        """
        conn = db_connection or self.db_pool
        normalized_tier = (tier_code or "STARTER").upper()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Hitung durasi hari untuk kalkulasi burn rate
        try:
            d_start = datetime.date.fromisoformat(period_start[:10])
            d_end = datetime.date.fromisoformat(period_end[:10])
            delta_days = max(1, (d_end - d_start).days)
        except Exception:
            delta_days = 30

        is_enterprise = normalized_tier == "ENTERPRISE"
        items: List[CashFlowItem] = []
        data_source = "INTERNAL_NATIVE_ALL_TIER"
        is_external_erp = False

        # 1. EVALUASI JIKA TIER ENTERPRISE: Cek apakah ada integrasi ERP eksternal aktif
        if is_enterprise:
            erp_data_found = False

            if simulated_erp_records is not None:
                # Mode data ERP simulasi/harness
                for rec in simulated_erp_records:
                    items.append(
                        CashFlowItem(
                            id=rec.get("id") or str(uuid.uuid4()),
                            date=rec.get("date", now_iso[:10]),
                            description=rec.get("description", "Sinkronisasi Ledger ERP"),
                            amount=float(rec.get("amount", 0.0)),
                            direction=rec.get("direction", "INFLOW"),
                            category=rec.get("category", "OPERATIONAL"),
                            source_system=rec.get("source_system", "ERP_SAP_FINANCE"),
                            source_reference=rec.get("source_reference"),
                        )
                    )
                erp_data_found = len(items) > 0

            elif conn:
                # Periksa apakah ada sync logs dari konektor ERP eksternal
                try:
                    erp_rows = await conn.fetch(
                        """
                        SELECT id, source_system, payload, created_at
                        FROM integration_fabric_sync_logs
                        WHERE tenant_id = $1 
                          AND source_system ILIKE ANY(ARRAY['%SAP%', '%NETSUITE%', '%ORACLE%', '%ERP%'])
                          AND created_at >= $2::timestamptz AND created_at <= $3::timestamptz
                        ORDER BY created_at ASC
                        LIMIT 200
                        """,
                        uuid.UUID(tenant_id),
                        period_start,
                        period_end
                    )
                    if erp_rows:
                        import json
                        for r in erp_rows:
                            p = r["payload"]
                            if isinstance(p, str):
                                p = json.loads(p)
                            amount = float(p.get("amount", 0.0))
                            direction = p.get("direction", "INFLOW" if amount >= 0 else "OUTFLOW")
                            items.append(
                                CashFlowItem(
                                    id=str(r["id"]),
                                    date=r["created_at"].strftime("%Y-%m-%d"),
                                    description=p.get("description", f"ERP Sync: {r['source_system']}"),
                                    amount=abs(amount),
                                    direction=direction.upper(),
                                    category=p.get("category", "ERP_FINANCIAL_STREAM"),
                                    source_system=r["source_system"],
                                    source_reference=p.get("gl_account_code"),
                                )
                            )
                        erp_data_found = len(items) > 0
                except Exception as exc:
                    logger.warning("Gagal query ERP logs: %s", exc)

            if erp_data_found:
                data_source = "EXTERNAL_ERP_ENTERPRISE"
                is_external_erp = True

        # 2. EVALUASI JIKA NON-ENTERPRISE ATAU BELUM ADA ERP TERHUBUNG: Gunakan sumber internal
        if not is_external_erp:
            data_source = "INTERNAL_NATIVE_ALL_TIER"
            is_external_erp = False

            if simulated_internal_records is not None:
                for rec in simulated_internal_records:
                    items.append(
                        CashFlowItem(
                            id=rec.get("id") or str(uuid.uuid4()),
                            date=rec.get("date", now_iso[:10]),
                            description=rec.get("description", "Transaksi Penjualan Native"),
                            amount=float(rec.get("amount", 0.0)),
                            direction=rec.get("direction", "INFLOW"),
                            category=rec.get("category", "COMMERCE_REVENUE"),
                            source_system="ORCHESTREE_NATIVE_COMMERCE",
                            source_reference=rec.get("source_reference"),
                        )
                    )
            elif conn:
                try:
                    # Ambil Inflow dari Orders yang PAID / COMPLETED
                    order_rows = await conn.fetch(
                        """
                        SELECT id, total_amount, created_at, order_number
                        FROM orders
                        WHERE tenant_id = $1 
                          AND status IN ('PAID', 'COMPLETED', 'DELIVERED')
                          AND created_at >= $2::timestamptz AND created_at <= $3::timestamptz
                        ORDER BY created_at ASC
                        LIMIT 500
                        """,
                        uuid.UUID(tenant_id),
                        period_start,
                        period_end
                    )
                    for o in order_rows:
                        items.append(
                            CashFlowItem(
                                id=str(o["id"]),
                                date=o["created_at"].strftime("%Y-%m-%d"),
                                description=f"Pendapatan Pesanan #{o.get('order_number') or str(o['id'])[:8]}",
                                amount=float(o["total_amount"]),
                                direction="INFLOW",
                                category="REVENUE",
                                source_system="ORCHESTREE_COMMERCE_ORDERS",
                                source_reference=str(o["id"]),
                            )
                        )

                    # Ambil Outflow dari Refund atau beban operasional
                    refund_rows = await conn.fetch(
                        """
                        SELECT id, amount, created_at, reason
                        FROM payments
                        WHERE tenant_id = $1
                          AND status IN ('REFUNDED', 'CHARGED_BACK')
                          AND created_at >= $2::timestamptz AND created_at <= $3::timestamptz
                        ORDER BY created_at ASC
                        LIMIT 100
                        """,
                        uuid.UUID(tenant_id),
                        period_start,
                        period_end
                    )
                    for rf in refund_rows:
                        items.append(
                            CashFlowItem(
                                id=str(rf["id"]),
                                date=rf["created_at"].strftime("%Y-%m-%d"),
                                description=f"Refund Pembayaran: {rf.get('reason') or 'Retur Pelanggan'}",
                                amount=float(rf["amount"]),
                                direction="OUTFLOW",
                                category="REFUND",
                                source_system="ORCHESTREE_PAYMENTS",
                                source_reference=str(rf["id"]),
                            )
                        )
                except Exception as exc:
                    logger.warning("Gagal query transaksi internal: %s", exc)

        # 3. KALKULASI ARUS KAS AGREGAT
        total_inflows = sum(i.amount for i in items if i.direction == "INFLOW")
        total_outflows = sum(i.amount for i in items if i.direction == "OUTFLOW")
        net_cash_flow = total_inflows - total_outflows

        average_daily_burn = round(total_outflows / delta_days, 2) if delta_days > 0 else 0.0

        estimated_runway_days = None
        if average_daily_burn > 0:
            usable_balance = max(0.0, current_cash_balance + (net_cash_flow if net_cash_flow > 0 else 0))
            estimated_runway_days = int(usable_balance / average_daily_burn)

        return CashFlowSummary(
            tenant_id=tenant_id,
            tier_code=normalized_tier,
            period_start=period_start,
            period_end=period_end,
            total_inflows=round(total_inflows, 2),
            total_outflows=round(total_outflows, 2),
            net_cash_flow=round(net_cash_flow, 2),
            average_daily_burn=average_daily_burn,
            estimated_runway_days=estimated_runway_days,
            data_source=data_source,
            is_external_erp=is_external_erp,
            items=items,
            generated_at=now_iso,
        )


__all__ = [
    "CashFlowItem",
    "CashFlowSummary",
    "FinanceCashFlowEngine",
]
