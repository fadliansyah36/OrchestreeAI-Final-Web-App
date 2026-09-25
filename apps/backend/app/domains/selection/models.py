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


class TriggerType(str, Enum):
    NEW_FILE_UPLOAD = "new_file_upload"
    SCHEDULED = "scheduled"
    WEBHOOK = "webhook"
    WORKFLOW_TRIGGER = "workflow_trigger"


class ExportFormat(str, Enum):
    PDF = "pdf"
    EXCEL = "excel"
    CSV = "csv"


class ReportType(str, Enum):
    EXECUTIVE_SUMMARY = "executive_summary"
    DETAILED_SELECTION = "detailed_selection"
    RANKING_ANALYTICS = "ranking_analytics"


class ReviewDecision(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    OVERRIDDEN = "overridden"


PROTECTED_HUMAN_REVIEW_DOMAINS = ["recruitment", "finance", "procurement", "supplier"]

STRUCTURAL_AI_AGENT_ROLES = [
    {"role_key": "hr_agent", "title": "HR Agent", "department": "Human Resources", "domain_categories": ["recruitment"]},
    {"role_key": "finance_agent", "title": "Finance Agent", "department": "Finance & Treasury", "domain_categories": ["finance"]},
    {"role_key": "procurement_agent", "title": "Procurement Agent", "department": "Procurement & Vendor", "domain_categories": ["supplier", "procurement"]},
    {"role_key": "sales_agent", "title": "Sales Agent", "department": "Sales & Revenue", "domain_categories": ["sales"]},
    {"role_key": "marketing_agent", "title": "Marketing Agent", "department": "Marketing & Growth", "domain_categories": ["marketing", "sales"]},
    {"role_key": "project_agent", "title": "Project Agent", "department": "Project Delivery", "domain_categories": ["general", "operations"]},
    {"role_key": "operations_agent", "title": "Mining Agent / Operations Agent", "department": "Operations", "domain_categories": ["general", "supplier"]},
    {"role_key": "research_agent", "title": "Research Agent", "department": "Market Intelligence", "domain_categories": ["general", "sales"]},
    {"role_key": "chief_of_staff", "title": "Chief of Staff Agent", "department": "Executive Leadership", "domain_categories": ["general", "recruitment", "finance"]},
]


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


class RerunSelectionJobInput(BaseModel):
    title: Optional[str] = Field(default=None, description="Judul baru untuk job rerun")
    instruction_prompt: Optional[str] = Field(default=None, description="Prompt evaluasi baru atau disesuaikan")
    criteria: Optional[List[Dict[str, Any]]] = Field(default=None, description="Kriteria baru atau disesuaikan")
    calibration_profile_id: Optional[str] = Field(default=None, description="Profil kalibrasi baru")
    initiated_by_agent_id: Optional[str] = Field(default=None, description="ID AI Agent pemicu")


class ExportSelectionReportInput(BaseModel):
    format: str = Field(default="pdf", description="Format laporan: pdf, excel, csv")
    report_type: str = Field(default="executive_summary", description="Tipe laporan: executive_summary, detailed_selection, ranking_analytics")


class ReviewResultInput(BaseModel):
    decision: str = Field(..., description="Keputusan: approved, rejected, overridden")
    override_rank: Optional[int] = Field(default=None, ge=1, description="Posisi peringkat baru jika overridden")
    override_score: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Skor override baru jika overridden")
    notes: Optional[str] = Field(default=None, max_length=2000, description="Catatan peninjau (wajib untuk rejected/overridden)")


class CreateAutomationTriggerInput(BaseModel):
    trigger_name: str = Field(..., min_length=3, max_length=200, description="Nama pemicu otomasi")
    trigger_type: TriggerType = Field(..., description="Jenis pemicu: new_file_upload, scheduled, webhook, workflow_trigger")
    trigger_config: Dict[str, Any] = Field(default_factory=dict, description="Konfigurasi pemicu (cron, folder watch, webhook secret)")
    target_agent_id: Optional[str] = Field(default=None, description="ID AI Agent pelaksana")
    criteria_template: Optional[List[Dict[str, Any]]] = Field(default=None, description="Template kriteria seleksi")
    calibration_profile_id: Optional[str] = Field(default=None, description="ID profil kalibrasi")
    is_active: bool = Field(default=True, description="Status aktif pemicu")


class ScoringResultDetail(BaseModel):
    id: str
    entity_label: str
    total_score: float
    score_breakdown: Dict[str, float]
    rank_position: Optional[int] = None
    previous_rank_position: Optional[int] = None
    priority_level: Optional[PriorityLevel] = None
    recommendation_classification: Optional[RecommendationClass] = None
    risk_score: Optional[float] = None
    confidence_score: Optional[float] = None
    decision_status: DecisionStatus = DecisionStatus.PENDING
    reviewer_notes: Optional[str] = None
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


class CalibrationItemInput(BaseModel):
    field_type_name: str = Field(..., min_length=1, max_length=200, description="Nama field tipe dari preferensi user")
    percentage: float = Field(..., ge=0.0, le=100.0, description="Persentase bobot kriteria (0-100)")
    display_order: int = Field(default=0, ge=0, description="Urutan tampilan item")


class CalibrationItemDetail(BaseModel):
    id: str
    calibration_profile_id: str
    field_type_name: str
    percentage: float
    display_order: int
    created_at: datetime


class CreateCalibrationProfileInput(BaseModel):
    profile_name: str = Field(..., min_length=1, max_length=200, description="Nama profil kalibrasi")
    domain_category: Optional[str] = Field(default=None, max_length=100, description="Kategori domain opsional")
    created_by_membership_id: Optional[str] = Field(default=None, description="UUID membership pembuat")
    items: Optional[List[CalibrationItemInput]] = Field(default=None, description="Daftar item kalibrasi awal")


class CalibrationProfileDetail(BaseModel):
    id: str
    tenant_id: str
    profile_name: str
    domain_category: Optional[str] = None
    created_by_membership_id: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    items: List[CalibrationItemDetail] = Field(default_factory=list)
    total_percentage: float = 0.0

