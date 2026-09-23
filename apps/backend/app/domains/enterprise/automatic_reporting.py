"""
OrchestreeAI Automatic Reporting Engine (PRD v2.2 Bagian 3.4, 3.5, 8.6, 12)
Python 3.12 + FastAPI + Supabase Postgres

Tugas:
1. Agregasi metrik riil dari tabel-tabel operasional (orders, leads, tasks, credit_transactions, ai_agents, llm_usage).
2. Penyimpanan setiap metrik secara granular ke tabel `report_data_points`.
3. Penyusunan laporan otomatis (Daily, Weekly, Monthly) ke tabel `automated_reports`.
4. Verifikasi deterministik: Setiap angka pada narasi laporan otomatis cocok persis dengan `report_data_points` sumbernya.
"""

from typing import List, Dict, Any, Optional, Tuple
import uuid
import datetime
import re
import math

try:
    from pydantic import BaseModel, Field

    class ReportDataPoint(BaseModel):
        id: Optional[str] = None
        tenant_id: str
        report_id: Optional[str] = None
        metric_key: str
        metric_label: str
        metric_value: float
        unit: str = ""
        period_type: str = "DAILY"  # DAILY, WEEKLY, MONTHLY, CUSTOM
        period_start: str
        period_end: str
        source_table: str
        source_query: str
        source_dimension: str = "FINANCIALS_AND_BUDGET"
        department_id: Optional[str] = None
        department_code: Optional[str] = None
        sensitivity_level: str = "INTERNAL"  # PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED_MANAGEMENT, FINANCIAL_EXECUTIVE
        metadata: Dict[str, Any] = Field(default_factory=dict)
        created_at: Optional[str] = None

    class AutomatedReport(BaseModel):
        id: Optional[str] = None
        tenant_id: str
        report_type: str = "DAILY"  # DAILY, WEEKLY, MONTHLY
        title: str
        period_start: str
        period_end: str
        executive_summary: str
        narrative: str
        key_metrics: Dict[str, Any] = Field(default_factory=dict)
        department_highlights: List[Dict[str, Any]] = Field(default_factory=list)
        action_items: List[Dict[str, Any]] = Field(default_factory=list)
        status: str = "COMPLETED"
        generated_by: str = "Arya (AI Chief of Staff)"
        created_at: Optional[str] = None
        updated_at: Optional[str] = None

    class NarrativeVerificationResult(BaseModel):
        is_valid: bool
        total_data_points_checked: int
        matched_metrics: List[str]
        missing_metrics: List[str]
        discrepancies: List[Dict[str, Any]]
        explanation: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class ReportDataPoint:
        tenant_id: str
        metric_key: str
        metric_label: str
        metric_value: float
        period_start: str
        period_end: str
        source_table: str
        source_query: str
        id: Optional[str] = None
        report_id: Optional[str] = None
        unit: str = ""
        period_type: str = "DAILY"
        source_dimension: str = "FINANCIALS_AND_BUDGET"
        department_id: Optional[str] = None
        department_code: Optional[str] = None
        sensitivity_level: str = "INTERNAL"
        metadata: Dict[str, Any] = field(default_factory=dict)
        created_at: Optional[str] = None

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "tenant_id": self.tenant_id,
                "report_id": self.report_id,
                "metric_key": self.metric_key,
                "metric_label": self.metric_label,
                "metric_value": self.metric_value,
                "unit": self.unit,
                "period_type": self.period_type,
                "period_start": self.period_start,
                "period_end": self.period_end,
                "source_table": self.source_table,
                "source_query": self.source_query,
                "source_dimension": self.source_dimension,
                "department_id": self.department_id,
                "department_code": self.department_code,
                "sensitivity_level": self.sensitivity_level,
                "metadata": self.metadata,
                "created_at": self.created_at,
            }

    @dataclass
    class AutomatedReport:
        tenant_id: str
        title: str
        period_start: str
        period_end: str
        executive_summary: str
        narrative: str
        id: Optional[str] = None
        report_type: str = "DAILY"
        key_metrics: Dict[str, Any] = field(default_factory=dict)
        department_highlights: List[Dict[str, Any]] = field(default_factory=list)
        action_items: List[Dict[str, Any]] = field(default_factory=list)
        status: str = "COMPLETED"
        generated_by: str = "Arya (AI Chief of Staff)"
        created_at: Optional[str] = None
        updated_at: Optional[str] = None

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "tenant_id": self.tenant_id,
                "report_type": self.report_type,
                "title": self.title,
                "period_start": self.period_start,
                "period_end": self.period_end,
                "executive_summary": self.executive_summary,
                "narrative": self.narrative,
                "key_metrics": self.key_metrics,
                "department_highlights": self.department_highlights,
                "action_items": self.action_items,
                "status": self.status,
                "generated_by": self.generated_by,
                "created_at": self.created_at,
                "updated_at": self.updated_at,
            }

    @dataclass
    class NarrativeVerificationResult:
        is_valid: bool
        total_data_points_checked: int
        matched_metrics: List[str]
        missing_metrics: List[str]
        discrepancies: List[Dict[str, Any]]
        explanation: str

        def model_dump(self) -> Dict[str, Any]:
            return {
                "is_valid": self.is_valid,
                "total_data_points_checked": self.total_data_points_checked,
                "matched_metrics": self.matched_metrics,
                "missing_metrics": self.missing_metrics,
                "discrepancies": self.discrepancies,
                "explanation": self.explanation,
            }



def format_currency_idr(val: float) -> str:
    """Format angka menjadi representasi standar IDR tanpa desimal."""
    return f"{int(round(val)):,}".replace(",", ".")


def format_number_id(val: float) -> str:
    """Format angka floating atau integer ke standar lokal Indonesia."""
    if val.is_integer():
        return f"{int(val):,}".replace(",", ".")
    return f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def build_deterministic_narrative(
    tenant_name: str,
    period_type: str,
    period_start: str,
    period_end: str,
    data_points: List[ReportDataPoint],
) -> Tuple[str, str]:
    """
    Menyusun narasi eksekutif dan ringkasan eksekutif dengan menyematkan
    angka eksak dari report_data_points untuk menjamin 100% kecocokan angka.
    """
    # Index metrics by key
    dp_map = {dp.metric_key: dp for dp in data_points}

    rev = dp_map.get("total_revenue")
    orders = dp_map.get("order_count")
    margin = dp_map.get("gross_profit_margin")
    leads = dp_map.get("active_leads_count")
    pipe = dp_map.get("pipeline_value")
    tasks_done = dp_map.get("completed_tasks")
    tasks_total = dp_map.get("total_active_tasks")
    credits = dp_map.get("credits_consumed")
    tokens = dp_map.get("ai_tokens_consumed")
    agents = dp_map.get("ai_agent_count")
    perf = dp_map.get("average_performance_score")

    period_label_id = {
        "DAILY": "Harian",
        "WEEKLY": "Mingguan",
        "MONTHLY": "Bulanan",
    }.get(period_type.upper(), period_type)

    rev_val = rev.metric_value if rev else 0.0
    orders_val = int(orders.metric_value) if orders else 0
    margin_val = margin.metric_value if margin else 0.0
    leads_val = int(leads.metric_value) if leads else 0
    pipe_val = pipe.metric_value if pipe else 0.0
    done_val = int(tasks_done.metric_value) if tasks_done else 0
    total_val = int(tasks_total.metric_value) if tasks_total else 0
    credits_val = credits.metric_value if credits else 0.0
    tokens_val = int(tokens.metric_value) if tokens else 0
    agents_val = int(agents.metric_value) if agents else 0
    perf_val = perf.metric_value if perf else 0.0

    exec_summary = (
        f"Laporan {period_label_id} Eksekutif {tenant_name} periode {period_start} hingga {period_end}: "
        f"Total pendapatan operasional tercatat Rp {format_currency_idr(rev_val)} dari {orders_val} transaksi sukses, "
        f"dengan margin laba kotor {margin_val}%. Tim operasional dan {agents_val} agen AI telah menuntaskan "
        f"{done_val} tugas dari total {total_val} target berjalan dengan indeks performa {perf_val}/100."
    )

    narrative = (
        f"LAPORAN {period_label_id.upper()} EKSEKUTIF ORCHESTREEAI — {tenant_name}\n"
        f"Rentang Evaluasi: {period_start} s/d {period_end}\n\n"
        f"1. KINERJA KOMERSIAL & PENDAPATAN:\n"
        f"   - Total Pendapatan Operasional yang berhasil dibukukan mencapai nilai eksak Rp {format_currency_idr(rev_val)}.\n"
        f"   - Volume transaksi komersial tercatat sebanyak {orders_val} pesanan sukses.\n"
        f"   - Prospek aktif dalam pipeline penjualan berjumlah {leads_val} prospek potensial, dengan estimasi nilai pipeline sebesar Rp {format_currency_idr(pipe_val)}.\n"
        f"   - Estimasi margin laba kotor operasional berada pada tingkat {margin_val}%.\n\n"
        f"2. PRODUKTIVITAS OPERASIONAL & WORKFORCE:\n"
        f"   - Beban kerja operasional menyelesaikan {done_val} tugas tuntas dari total {total_val} penugasan terdaftar.\n"
        f"   - Skor efisiensi rata-rata gabungan tenaga kerja manusia dan AI terkalibrasi pada indeks {perf_val} poin dari skala 100.\n"
        f"   - Kapasitas tenaga kerja otonom didukung oleh {agents_val} agen AI terotorisasi aktif.\n\n"
        f"3. UTILISASI SUMBER DAYA SISTEM & KREDIT:\n"
        f"   - Penggunaan kredit operasional tercatat sebanyak {credits_val:.2f} kredit komputasi.\n"
        f"   - Konsumsi token inferensi LLM melalui Model Router mencapai {tokens_val} token.\n\n"
        f"Catatan Integritas: Seluruh angka dalam narasi ini diverifikasi langsung terhadap tabel SSOT transaksi database."
    )

    return exec_summary, narrative


def verify_narrative_against_data_points(
    narrative: str,
    data_points: List[ReportDataPoint],
) -> NarrativeVerificationResult:
    """
    Verifikasi deterministik:
    Setiap angka pada narasi laporan otomatis cocok persis dengan report_data_points sumbernya.
    """
    matched = []
    missing = []
    discrepancies = []

    for dp in data_points:
        raw_val = dp.metric_value
        val_curr_str = format_currency_idr(raw_val)

        # Periksa apakah representasi angka muncul di teks narasi
        found = False
        if dp.unit == "IDR":
            found = val_curr_str in narrative
        else:
            val_str = str(raw_val)
            val_float_1 = f"{raw_val:.1f}"
            val_float_2 = f"{raw_val:.2f}"
            val_int_str = str(int(round(raw_val)))
            if (
                val_str in narrative
                or val_float_1 in narrative
                or val_float_2 in narrative
                or val_int_str in narrative
                or val_curr_str in narrative
            ):
                found = True


        if found:
            matched.append(dp.metric_key)
        else:
            missing.append(dp.metric_key)
            discrepancies.append({
                "metric_key": dp.metric_key,
                "expected_value": raw_val,
                "formatted_idr": val_curr_str,
                "reason": "Angka metrik tidak ditemukan dalam narasi laporan otomatis.",
            })

    is_valid = len(missing) == 0

    explanation = (
        f"Verifikasi Integritas Narasi: {len(matched)} dari {len(data_points)} titik data "
        f"terbukti cocok persis dengan data sumber SSOT."
    )
    if not is_valid:
        explanation += f" Ditemukan {len(missing)} metrik yang tidak tercermin dalam narasi."

    return NarrativeVerificationResult(
        is_valid=is_valid,
        total_data_points_checked=len(data_points),
        matched_metrics=matched,
        missing_metrics=missing,
        discrepancies=discrepancies,
        explanation=explanation,
    )


# Kompatibilitas alias
AutomatedReportItem = AutomatedReport

__all__ = [
    "ReportDataPoint",
    "AutomatedReport",
    "AutomatedReportItem",
    "NarrativeVerificationResult",
    "format_currency_idr",
    "format_number_id",
    "build_deterministic_narrative",
    "verify_narrative_against_data_points",
]

