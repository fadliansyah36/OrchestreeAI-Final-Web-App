"""
Universal AI Selection & Intelligence Domain Models (PRD v2.2 Bagian 13.1 & 17.5)
Mendefinisikan tipe data, enum, dan skema kontrak untuk 10 tahap pipeline seleksi kognitif.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


SELECTION_PIPELINE_NODES = [
    "SELECTION_READ",          # baca sumber data multi-kanal (poin 2)
    "SELECTION_UNDERSTAND",    # schema detection, classification, normalization
    "SELECTION_VALIDATE",      # duplicate & invalid detection, quality score
    "SELECTION_SELECT",        # terapkan kriteria (poin 3) + kalibrasi
    "SELECTION_SCORE",         # scoring berbobot per kriteria
    "SELECTION_RANK",          # urutkan, tetapkan rank_position
    "SELECTION_ANALYZE",       # Dynamic Analytics (poin 6)
    "SELECTION_VISUALIZE",     # Automatic Diagram Selection (poin 7)
    "SELECTION_RECOMMEND",     # Insight & Recommendation (poin 5)
    "SELECTION_RESULT",        # finalisasi, update selection_jobs.pipeline_stage='completed'
]


class PipelineStage(str, Enum):
    UPLOADED = "uploaded"
    READING = "reading"
    UNDERSTANDING = "understanding"
    VALIDATING = "validating"
    SELECTING = "selecting"
    SCORING = "scoring"
    RANKING = "ranking"
    ANALYZING = "analyzing"
    VISUALIZING = "visualizing"
    RECOMMENDING = "recommending"
    COMPLETED = "completed"
    FAILED = "failed"


class SourceChannel(str, Enum):
    FILE_UPLOAD = "file_upload"
    PROMPT_TEXT = "prompt_text"
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    API = "api"
    DATABASE_QUERY = "database_query"
    WORKFLOW_TRIGGER = "workflow_trigger"
    INTEGRATION_FABRIC = "integration_fabric"


class CriteriaSourceType(str, Enum):
    USER_PROMPT = "user_prompt"
    COMPANY_BRAIN = "company_brain"
    USER_CUSTOM = "user_custom"
    AI_GENERATED = "ai_generated"
    CALIBRATION_PROFILE = "calibration_profile"


class PriorityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RecommendationClass(str, Enum):
    SELECT = "select"
    REJECT = "reject"
    REVIEW = "review"


class DecisionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    OVERRIDDEN = "overridden"


class InsightType(str, Enum):
    RANKING_REASON = "ranking_reason"
    STRENGTH = "strength"
    WEAKNESS = "weakness"
    RISK = "risk"
    ANOMALY = "anomaly"
    OPPORTUNITY = "opportunity"
    ACTION_RECOMMENDATION = "action_recommendation"


class AnalyticsType(str, Enum):
    KPI = "kpi"
    STATISTIC = "statistic"
    DISTRIBUTION = "distribution"
    COMPARISON = "comparison"
    TREND = "trend"
    CORRELATION = "correlation"
    PERFORMANCE = "performance"
    ANOMALY_DETECTION = "anomaly_detection"


class ChartType(str, Enum):
    BAR = "bar"
    LINE = "line"
    PIE = "pie"
    DONUT = "donut"
    AREA = "area"
    SCATTER = "scatter"
    FUNNEL = "funnel"
    HEATMAP = "heatmap"
    RANKING_CHART = "ranking_chart"


# ---------------------------------------------------------------------------
# Pydantic Request / DTO Schemas
# ---------------------------------------------------------------------------

class SelectionCriterionInput(BaseModel):
    key: str = Field(..., description="Kunci kriteria evaluasi (cth: skill_match, experience, price_score)")
    label: str = Field(..., description="Label yang mudah dibaca")
    weight: float = Field(..., ge=0.0, le=1.0, description="Bobot kriteria (0..1)")
    source_type: CriteriaSourceType = Field(default=CriteriaSourceType.USER_PROMPT)


class SourceDocumentInput(BaseModel):
    source_channel: SourceChannel = Field(default=SourceChannel.FILE_UPLOAD)
    raw_text: Optional[str] = Field(default=None, description="Teks mentah dokumen atau konten prompt")
    file_artifact_id: Optional[str] = Field(default=None, description="ID berkas di file_artifacts jika berkas telah diunggah")
    document_name: Optional[str] = Field(default=None, description="Nama berkas atau label dokumen")
    entity_label: Optional[str] = Field(default=None, description="Label awal kandidat/vendor jika diketahui")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Metadata saluran tambahan")


class CreateSelectionJobInput(BaseModel):
    title: str = Field(..., min_length=3, description="Judul pekerjaan seleksi cerdas")
    domain_category: Optional[str] = Field(default="general", description="Kategori domain: recruitment, supplier, finance, sales, general")
    instruction_prompt: str = Field(..., min_length=5, description="Perintah instruksi evaluasi seleksi")
    calibration_profile_id: Optional[str] = Field(default=None, description="ID profil kalibrasi (jika ada)")
    criteria: Optional[List[SelectionCriterionInput]] = Field(default=None, description="Daftar kriteria awal")
    source_documents: Optional[List[SourceDocumentInput]] = Field(default=None, description="Dokumen awal yang disertakan")
    initiated_by_agent_id: Optional[str] = Field(default=None, description="ID AI Agent pemicu jika dari otomasi")


class ScoringResultDetail(BaseModel):
    id: str
    entity_label: str
    total_score: float
    score_breakdown: Dict[str, float]
    rank_position: Optional[int] = None
    priority_level: Optional[PriorityLevel] = None
    recommendation_classification: Optional[RecommendationClass] = None
    risk_score: Optional[float] = None
    confidence_score: Optional[float] = None
    decision_status: DecisionStatus = DecisionStatus.PENDING
    source_document_id: Optional[str] = None


class SelectionJobDetail(BaseModel):
    id: str
    tenant_id: str
    title: str
    domain_category: Optional[str]
    instruction_prompt: str
    calibration_profile_id: Optional[str] = None
    pipeline_stage: PipelineStage
    stage_progress_pct: float
    initiated_by_membership_id: Optional[str] = None
    initiated_by_agent_id: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    criteria: List[Dict[str, Any]] = Field(default_factory=list)
    total_documents: int = 0
    results: List[ScoringResultDetail] = Field(default_factory=list)
