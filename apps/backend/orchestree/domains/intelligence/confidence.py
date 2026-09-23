"""
OrchestreeAI Intelligence - 5-State Data Availability & Confidence Engine
PRD v2.2 Bagian 8.12 & 8.13.5

Menyediakan:
1. 5-State Data Availability: AVAILABLE, STALE, CONFLICTING, PARTIAL, NOT_AVAILABLE.
2. Perhitungan skor kepercayaan (confidence score) berbasis multi-faktor matematis.
3. Output Validator yang secara tegas MENOLAK klaim AVAILABLE palsu dari LLM/agen.
"""

from enum import Enum
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field, asdict

try:
    from pydantic import BaseModel, Field
    HAS_PYDANTIC = True
except ImportError:
    HAS_PYDANTIC = False


class DataAvailabilityState(str, Enum):
    AVAILABLE = "AVAILABLE"          # Data lengkap, segar, dan terverifikasi dari sumber terpercaya
    STALE = "STALE"                  # Data tersedia namun telah melampaui batas waktu kesegaran (TTL expired)
    CONFLICTING = "CONFLICTING"      # Sumber eksternal memberikan nilai saling bertentangan (butuh resolusi manusia)
    PARTIAL = "PARTIAL"              # Sebagian atribut tersedia, namun bidang esensial tertentu hilang
    NOT_AVAILABLE = "NOT_AVAILABLE"  # Data kosong, sumber tidak terjangkau, atau tidak ditemukan


class FalseDataAvailabilityClaimError(ValueError):
    """Exception yang dilempar ketika LLM/agen membuat klaim AVAILABLE palsu padahal data kosong/tidak sah."""
    def __init__(self, message: str, corrected_state: DataAvailabilityState, details: Dict[str, Any]):
        super().__init__(message)
        self.message = message
        self.corrected_state = corrected_state
        self.details = details


@dataclass
class ConfidenceBreakdown:
    freshness_score: float
    completeness_score: float
    source_reliability_score: float
    consistency_score: float
    overall_confidence: float
    availability_state: DataAvailabilityState
    reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class OutputValidationResult:
    is_valid: bool
    claimed_state: DataAvailabilityState
    validated_state: DataAvailabilityState
    was_false_claim_rejected: bool = False
    rejection_reason: Optional[str] = None
    confidence_score: float = 0.0
    breakdown: Optional[ConfidenceBreakdown] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        res = asdict(self)
        if self.breakdown:
            res["breakdown"] = self.breakdown.to_dict()
        return res

    def model_dump(self) -> Dict[str, Any]:
        return self.to_dict()


class IntelligenceConfidenceEngine:
    """
    Engine terpusat untuk kalkulasi kepercayaan data dan validasi ketat keluaran AI.
    """

    DEFAULT_TTL_HOURS = 24.0

    @classmethod
    def evaluate_availability_and_confidence(
        cls,
        data: Optional[Dict[str, Any]],
        required_fields: Optional[List[str]] = None,
        sources: Optional[List[Dict[str, Any]]] = None,
        data_timestamp: Optional[datetime] = None,
        ttl_hours: float = DEFAULT_TTL_HOURS,
    ) -> Tuple[DataAvailabilityState, ConfidenceBreakdown]:
        """
        Mengevaluasi kondisi ketersediaan data dan menghitung rincian skor kepercayaan.
        """
        reasons: List[str] = []

        # 1. Evaluasi Ketiadaan Data (NOT_AVAILABLE)
        if data is None or not data or (isinstance(data, dict) and all(v is None or v == "" for v in data.values())):
            breakdown = ConfidenceBreakdown(
                freshness_score=0.0,
                completeness_score=0.0,
                source_reliability_score=0.0,
                consistency_score=0.0,
                overall_confidence=0.0,
                availability_state=DataAvailabilityState.NOT_AVAILABLE,
                reasons=["Data tidak tersedia atau kosong total dari sumber primer."],
            )
            return DataAvailabilityState.NOT_AVAILABLE, breakdown

        # 2. Evaluasi Konflik Antar Sumber Eksternal (CONFLICTING)
        # Aturan PRD: Bila ada 2+ sumber dengan nilai berbeda pada bidang kunci, status CONFLICTING
        if sources and len(sources) > 1:
            # Periksa apakah ada perbedaan nilai pada data yang sama
            conflict_detected, conflict_reason = cls._detect_source_conflicts(sources)
            if conflict_detected:
                reasons.append(f"Konflik nilai terdeteksi: {conflict_reason}")
                breakdown = ConfidenceBreakdown(
                    freshness_score=0.7,
                    completeness_score=0.8,
                    source_reliability_score=0.5,
                    consistency_score=0.0,
                    overall_confidence=0.35,
                    availability_state=DataAvailabilityState.CONFLICTING,
                    reasons=reasons,
                )
                return DataAvailabilityState.CONFLICTING, breakdown

        # 3. Evaluasi Kesegaran Data (STALE)
        freshness_score = 1.0
        now = datetime.now(timezone.utc)
        if data_timestamp:
            if data_timestamp.tzinfo is None:
                data_timestamp = data_timestamp.replace(tzinfo=timezone.utc)
            age = now - data_timestamp
            age_hours = age.total_seconds() / 3600.0
            if age_hours > ttl_hours:
                reasons.append(f"Data melampaui ambang batas kesegaran ({age_hours:.1f} jam > TTL {ttl_hours:.1f} jam).")
                freshness_score = max(0.1, 1.0 - (age_hours - ttl_hours) / ttl_hours)
                breakdown = ConfidenceBreakdown(
                    freshness_score=round(freshness_score, 4),
                    completeness_score=0.9,
                    source_reliability_score=0.8,
                    consistency_score=0.8,
                    overall_confidence=round(0.4 * freshness_score + 0.3, 4),
                    availability_state=DataAvailabilityState.STALE,
                    reasons=reasons,
                )
                return DataAvailabilityState.STALE, breakdown

        # 4. Evaluasi Kelengkapan Bidang Kunci (PARTIAL)
        completeness_score = 1.0
        if required_fields:
            present_fields = [f for f in required_fields if data.get(f) is not None and data.get(f) != ""]
            completeness_score = len(present_fields) / len(required_fields)
            if completeness_score < 1.0:
                missing = [f for f in required_fields if f not in present_fields]
                reasons.append(f"Atribut penting tidak lengkap: {', '.join(missing)}.")
                if completeness_score < 0.5:
                    breakdown = ConfidenceBreakdown(
                        freshness_score=freshness_score,
                        completeness_score=round(completeness_score, 4),
                        source_reliability_score=0.6,
                        consistency_score=0.6,
                        overall_confidence=round(0.3 * completeness_score + 0.2, 4),
                        availability_state=DataAvailabilityState.PARTIAL,
                        reasons=reasons,
                    )
                    return DataAvailabilityState.PARTIAL, breakdown

        # 5. Data Sah dan Tersedia Penuh (AVAILABLE)
        source_score = 0.95 if sources and len(sources) >= 1 else 0.85
        overall = round(
            0.35 * completeness_score +
            0.30 * freshness_score +
            0.20 * source_score +
            0.15 * 1.0,
            4
        )
        reasons.append("Data lengkap, segar, dan konsisten dari sumber terverifikasi.")
        breakdown = ConfidenceBreakdown(
            freshness_score=freshness_score,
            completeness_score=round(completeness_score, 4),
            source_reliability_score=source_score,
            consistency_score=1.0,
            overall_confidence=overall,
            availability_state=DataAvailabilityState.AVAILABLE,
            reasons=reasons,
        )
        return DataAvailabilityState.AVAILABLE, breakdown

    @classmethod
    def validate_output_claim(
        cls,
        claimed_state: DataAvailabilityState,
        actual_data: Optional[Dict[str, Any]],
        required_fields: Optional[List[str]] = None,
        sources: Optional[List[Dict[str, Any]]] = None,
        data_timestamp: Optional[datetime] = None,
        ttl_hours: float = DEFAULT_TTL_HOURS,
        raise_on_false_claim: bool = False,
    ) -> OutputValidationResult:
        """
        Output Validator:
        Memeriksa apakah klaim ketersediaan data dari LLM/agen selaras dengan fakta riil data.
        Bila LLM mengklaim AVAILABLE padahal data kosong/tidak lengkap/konflik/stale,
        Output Validator SECARA TEGAS MENOLAK klaim tersebut!
        """
        fact_state, breakdown = cls.evaluate_availability_and_confidence(
            data=actual_data,
            required_fields=required_fields,
            sources=sources,
            data_timestamp=data_timestamp,
            ttl_hours=ttl_hours,
        )

        # Cek klaim AVAILABLE palsu
        if claimed_state == DataAvailabilityState.AVAILABLE and fact_state != DataAvailabilityState.AVAILABLE:
            rejection_msg = (
                f"Klaim AVAILABLE palsu ditolak oleh Output Validator. "
                f"Fakta data berstatus '{fact_state.value}' dengan skor kepercayaan {breakdown.overall_confidence:.2%}. "
                f"Alasan: {'; '.join(breakdown.reasons)}"
            )
            
            if raise_on_false_claim:
                raise FalseDataAvailabilityClaimError(
                    message=rejection_msg,
                    corrected_state=fact_state,
                    details={
                        "claimed": claimed_state.value,
                        "validated": fact_state.value,
                        "breakdown": breakdown.model_dump(),
                    }
                )

            return OutputValidationResult(
                is_valid=False,
                claimed_state=claimed_state,
                validated_state=fact_state,
                was_false_claim_rejected=True,
                rejection_reason=rejection_msg,
                confidence_score=breakdown.overall_confidence,
                breakdown=breakdown,
            )

        # Bila klaim sesuai fakta
        return OutputValidationResult(
            is_valid=True,
            claimed_state=claimed_state,
            validated_state=fact_state,
            was_false_claim_rejected=False,
            rejection_reason=None,
            confidence_score=breakdown.overall_confidence,
            breakdown=breakdown,
        )

    @classmethod
    def _detect_source_conflicts(cls, sources: List[Dict[str, Any]]) -> Tuple[bool, str]:
        """Mendeteksi apakah terdapat inkonsistensi nilai lintas sumber data eksternal."""
        values_by_field: Dict[str, Dict[str, Any]] = {}
        for src in sources:
            src_name = src.get("source_name") or src.get("source") or "unknown"
            data_points = src.get("data", {})
            if isinstance(data_points, dict):
                for k, v in data_points.items():
                    if k not in values_by_field:
                        values_by_field[k] = {}
                    values_by_field[k][src_name] = v

        for field, src_map in values_by_field.items():
            distinct_values = set(str(v).strip().lower() for v in src_map.values() if v is not None)
            if len(distinct_values) > 1:
                details = ", ".join(f"{s}: '{v}'" for s, v in src_map.items())
                return True, f"Bidang '{field}' bertentangan antar sumber ({details})"

        return False, ""
