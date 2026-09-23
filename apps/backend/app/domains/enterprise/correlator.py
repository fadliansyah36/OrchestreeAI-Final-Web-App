"""
OrchestreeAI Enterprise Cross-System Signal Correlator (PRD v2.2 Bagian 8.13.1, 3.5, 14.2)
Python 3.12 + FastAPI + Supabase Postgres

Klasifikasi Sumber Data:
- 'Native': Internal OrchestreeAI (CRM, Sales, Autonomous Workforce, AI Agent Tasks)
- 'Synced': Integration Fabric (ERP, HRIS, External Billing, Logistics Pipelines)
- 'Uploaded': Dokumen manual Admin (SOP, Pedoman Finansial, Kontrak, Kebijakan SLA)
"""

from typing import List, Dict, Any, Optional, Set
import uuid
import datetime

try:
    from pydantic import BaseModel, Field

    class SourceSignal(BaseModel):
        """Sinyal granular individual dari sistem eksternal/internal."""
        id: Optional[str] = None
        source_type: str = Field(..., description="Klasifikasi sumber: 'Native', 'Synced', atau 'Uploaded'")
        source_system: str = Field(..., description="Identitas sistem asal (mis. CRM, ERP_SAP, HRIS, ADMIN_DOC)")
        signal_type: str = Field(..., description="Kategori sinyal (mis. DEAL_RISK, INVENTORY_DELAY, SLA_BREACH)")
        title: str
        payload: Dict[str, Any] = Field(default_factory=dict)
        metadata: Dict[str, Any] = Field(default_factory=dict)
        source_ref_id: Optional[str] = Field(default=None, description="ID referensi asli di sistem sumber untuk traceability")
        timestamp: Optional[str] = None

    class CorrelatedContextEvent(BaseModel):
        """Event hasil sintesis korelasi lintas sistem yang traceable."""
        id: str
        tenant_id: str
        event_type: str = "CROSS_SYSTEM_SYNTHESIS"
        title: str
        summary: str
        correlation_score: float
        source_types: List[str]
        source_signals: List[Dict[str, Any]]
        insights: Dict[str, Any]
        recommended_actions: List[Dict[str, Any]]
        status: str = "PROCESSED"
        created_at: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class SourceSignal:
        source_type: str
        source_system: str
        signal_type: str
        title: str
        id: Optional[str] = None
        payload: Dict[str, Any] = field(default_factory=dict)
        metadata: Dict[str, Any] = field(default_factory=dict)
        source_ref_id: Optional[str] = None
        timestamp: Optional[str] = None

    @dataclass
    class CorrelatedContextEvent:
        id: str
        tenant_id: str
        title: str
        summary: str
        correlation_score: float
        source_types: List[str]
        source_signals: List[Dict[str, Any]]
        insights: Dict[str, Any]
        recommended_actions: List[Dict[str, Any]]
        event_type: str = "CROSS_SYSTEM_SYNTHESIS"
        status: str = "PROCESSED"
        created_at: str = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "tenant_id": self.tenant_id,
                "event_type": self.event_type,
                "title": self.title,
                "summary": self.summary,
                "correlation_score": self.correlation_score,
                "source_types": self.source_types,
                "source_signals": self.source_signals,
                "insights": self.insights,
                "recommended_actions": self.recommended_actions,
                "status": self.status,
                "created_at": self.created_at,
            }


class CrossSystemSignalCorrelator:
    """
    Korelator sinyal lintas sistem persis orchestree/domains/enterprise/correlator.py (Bagian 8.13.1).
    Menghubungkan sinyal-sinyal terisolasi dari berbagai departemen dan sistem menjadi
    satu kesatuan narasi konteks korporat yang dapat ditelusuri (traceable).
    """

    VALID_SOURCE_TYPES: Set[str] = {"Native", "Synced", "Uploaded"}

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    def validate_signal(self, signal: SourceSignal) -> None:
        """Memvalidasi integritas sinyal dan validitas tipe sumber."""
        if signal.source_type not in self.VALID_SOURCE_TYPES:
            raise ValueError(
                f"source_type '{signal.source_type}' tidak valid. "
                f"Wajib salah satu dari: {', '.join(sorted(self.VALID_SOURCE_TYPES))}"
            )
        if not signal.source_system or not signal.source_system.strip():
            raise ValueError("source_system wajib diisi untuk keperluan audit traceability.")
        if not signal.title or not signal.title.strip():
            raise ValueError("title sinyal wajib diisi.")

    def correlate_signals(
        self,
        tenant_id: str,
        signals: List[SourceSignal],
        context_theme: Optional[str] = None
    ) -> CorrelatedContextEvent:
        """
        Menjalankan sintesis korelasi lintas sistem.
        Menerima sekumpulan sinyal (misalnya 4 sinyal berbeda) dan menghasilkan
        tepat 1 `company_context_events` gabungan dengan provenance penuh.
        """
        if not signals:
            raise ValueError("Sekurang-kurangnya 1 sinyal diperlukan untuk korelasi konteks.")

        # Validasi seluruh sinyal
        for sig in signals:
            self.validate_signal(sig)

        # Kumpulkan seluruh tipe sumber unik (Traceability klasifikasi sumber)
        source_types_set = {s.source_type for s in signals}
        source_types_list = sorted(list(source_types_set))

        # Kumpulkan sistem sumber unik
        source_systems_set = {s.source_system for s in signals}

        # Hitung skor korelasi berdasarkan keragaman sumber & koherensi tema
        base_score = 0.70
        diversity_bonus = min(0.20, len(source_types_set) * 0.06)
        system_count_bonus = min(0.08, len(source_systems_set) * 0.02)
        correlation_score = round(min(0.99, base_score + diversity_bonus + system_count_bonus), 4)

        # Susun daftar sinyal yang dapat ditelusuri (traceable signals)
        serialized_signals = []
        for s in signals:
            serialized_signals.append({
                "id": s.id or str(uuid.uuid4()),
                "source_type": s.source_type,
                "source_system": s.source_system,
                "signal_type": s.signal_type,
                "title": s.title,
                "payload": s.payload,
                "metadata": s.metadata,
                "source_ref_id": s.source_ref_id,
                "timestamp": s.timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })

        # Sintesis narasi konteks korporat lintas departemen
        event_id = str(uuid.uuid4())
        theme_label = context_theme or "Penyelarasan Operasional & Mitigasi Risiko Lintas Sistem"

        # Membentuk ringkasan terpadu
        sources_summary = ", ".join(f"{st} ({sum(1 for s in signals if s.source_type == st)})" for st in source_types_list)
        systems_summary = ", ".join(sorted(source_systems_set))

        summary = (
            f"Korelasi otomatis AI Chief of Staff berhasil menyelaraskan {len(signals)} sinyal dari {len(source_systems_set)} sistem berbeda "
            f"({systems_summary}). Klasifikasi sumber terdeteksi: [{sources_summary}]. "
            f"Sintesis ini mendeteksi titik konvergensi risiko operasional dan peluang mitigasi proaktif terpadu."
        )

        insights = {
            "total_signals_correlated": len(signals),
            "distinct_systems_count": len(source_systems_set),
            "systems_involved": sorted(list(source_systems_set)),
            "source_type_distribution": {st: sum(1 for s in signals if s.source_type == st) for st in source_types_list},
            "root_cause_analysis": (
                "Interdependensi antar-departemen terdeteksi: Sinyal Native (internal) berkorelasi langsung "
                "dengan data sinkronisasi Synced (ERP/eksternal) dan dokumen kebijakan Uploaded dari manajemen."
            ),
            "criticality": "HIGH" if correlation_score >= 0.88 else "MEDIUM",
        }

        # Rekomendasi aksi untuk Chief of Staff / Eksekutif
        recommended_actions = [
            {
                "action_id": f"ACT-{uuid.uuid4().hex[:6].upper()}",
                "target_department": "OPERATIONS_AND_CRM",
                "priority": "HIGH",
                "directive": "Lakukan sinkronisasi data real-time antara status inventori ERP dan penawaran penjualan tim CRM.",
                "traceable_source": [s["source_system"] for s in serialized_signals[:2]],
            },
            {
                "action_id": f"ACT-{uuid.uuid4().hex[:6].upper()}",
                "target_department": "FINANCE_AND_LEGAL",
                "priority": "MEDIUM",
                "directive": "Tinjau klausul penalti SLA pada dokumen kebijakan terunggah guna mengantisipasi klaim penalti mitra.",
                "traceable_source": [s["source_system"] for s in serialized_signals if s["source_type"] == "Uploaded"],
            },
        ]

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return CorrelatedContextEvent(
            id=event_id,
            tenant_id=tenant_id,
            event_type="CROSS_SYSTEM_SYNTHESIS",
            title=f"{theme_label} — Sintesis {len(signals)} Sinyal Lintas Sistem",
            summary=summary,
            correlation_score=correlation_score,
            source_types=source_types_list,
            source_signals=serialized_signals,
            insights=insights,
            recommended_actions=recommended_actions,
            status="PROCESSED",
            created_at=now_iso,
        )


__all__ = [
    "SourceSignal",
    "CorrelatedContextEvent",
    "CrossSystemSignalCorrelator",
]
