"""
OrchestreeAI Enterprise AI Research Agent (PRD v2.2 Bagian 8.6, 8.13.1, 3.5)
Python 3.12 + FastAPI + Supabase Postgres

6 Tingkat Knowledge Priority Hierarchy:
- Tingkat 1 (Level 1): Verified Internal Ground Truth (SOP resmi terverifikasi, kepatuhan hukum, kebijakan primer)
- Tingkat 2 (Level 2): Operational & Transactional Real Data (Data transaksi CRM, ERP, Commerce, HRIS real-time)
- Tingkat 3 (Level 3): Domain Specialist Knowledge Base (8 Dimensi Company Context Fabric, knowledge graph)
- Tingkat 4 (Level 4): Historical Interactions & Continuous Learning (Memori percakapan, scoring audit, keputusan masa lalu)
- Tingkat 5 (Level 5): Curated Industry & Benchmark Intelligence (Dataset terkurasi, standar industri, data mitra)
- Tingkat 6 (Level 6): Public Web Search & Open Intelligence (Pencarian web terbuka)

PENEGAKAN MUTLAK ATURAN KORPORAT:
Riset web publik (Tingkat 6) HANYA dapat diakses jika diizinkan eksplisit oleh tenant
(tenant_research_policies.allow_public_web_search = true).
Jika tidak diizinkan, akses web publik diblokir total (DENIED_BY_TENANT_POLICY) dan jawaban
AI Research Agent tetap wajib traceable dengan menyebutkan hierarki sumber yang digunakan.
"""

from typing import List, Dict, Any, Optional, Tuple, Set
import uuid
import datetime
import time

try:
    from pydantic import BaseModel, Field

    class KnowledgeSourceItem(BaseModel):
        id: Optional[str] = None
        level: int = Field(..., ge=1, le=6, description="1: Ground Truth, 2: Ops, 3: Domain, 4: History, 5: Curated, 6: Web")
        title: str
        content: str
        source_ref: Optional[str] = None
        source_classification: str = Field(default="Native", description="'Native', 'Synced', 'Uploaded', 'External'")
        dimension_code: Optional[str] = None
        confidence_weight: float = 1.0
        is_verified: bool = True

    class ResearchPolicy(BaseModel):
        allow_public_web_search: bool = False
        max_research_depth: int = 3
        require_traceability_citations: bool = True
        allowed_domains: List[str] = Field(default_factory=list)
        blocked_domains: List[str] = Field(default_factory=list)

    class ResearchQueryResult(BaseModel):
        id: str
        tenant_id: str
        query_text: str
        research_objective: Optional[str] = None
        knowledge_levels_consulted: List[int]
        sources_used: List[Dict[str, Any]]
        public_web_search_attempted: bool
        public_web_search_allowed: bool
        public_web_status: str  # PERMITTED / DENIED_BY_TENANT_POLICY
        answer_text: str
        traceability_report: Dict[str, Any]
        confidence_score: float
        latency_ms: int
        created_at: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class KnowledgeSourceItem:
        level: int
        title: str
        content: str
        id: Optional[str] = None
        source_ref: Optional[str] = None
        source_classification: str = "Native"
        dimension_code: Optional[str] = None
        confidence_weight: float = 1.0
        is_verified: bool = True

        def model_dump(self):
            return {
                "id": self.id,
                "level": self.level,
                "title": self.title,
                "content": self.content,
                "source_ref": self.source_ref,
                "source_classification": self.source_classification,
                "dimension_code": self.dimension_code,
                "confidence_weight": self.confidence_weight,
                "is_verified": self.is_verified,
            }

    @dataclass
    class ResearchPolicy:
        allow_public_web_search: bool = False
        max_research_depth: int = 3
        require_traceability_citations: bool = True
        allowed_domains: List[str] = field(default_factory=list)
        blocked_domains: List[str] = field(default_factory=list)

        def model_dump(self):
            return {
                "allow_public_web_search": self.allow_public_web_search,
                "max_research_depth": self.max_research_depth,
                "require_traceability_citations": self.require_traceability_citations,
                "allowed_domains": self.allowed_domains,
                "blocked_domains": self.blocked_domains,
            }

    @dataclass
    class ResearchQueryResult:
        id: str
        tenant_id: str
        query_text: str
        knowledge_levels_consulted: List[int]
        sources_used: List[Dict[str, Any]]
        public_web_search_attempted: bool
        public_web_search_allowed: bool
        public_web_status: str
        answer_text: str
        traceability_report: Dict[str, Any]
        confidence_score: float
        latency_ms: int
        created_at: str
        research_objective: Optional[str] = None

        def model_dump(self):
            return {
                "id": self.id,
                "tenant_id": self.tenant_id,
                "query_text": self.query_text,
                "research_objective": self.research_objective,
                "knowledge_levels_consulted": self.knowledge_levels_consulted,
                "sources_used": self.sources_used,
                "public_web_search_attempted": self.public_web_search_attempted,
                "public_web_search_allowed": self.public_web_search_allowed,
                "public_web_status": self.public_web_status,
                "answer_text": self.answer_text,
                "traceability_report": self.traceability_report,
                "confidence_score": self.confidence_score,
                "latency_ms": self.latency_ms,
                "created_at": self.created_at,
            }


KNOWLEDGE_LEVEL_METADATA = {
    1: {
        "name": "Tingkat 1: Verified Internal Ground Truth",
        "description": "SOP baku, kepatuhan regulasi, dokumen primer korporat terverifikasi",
        "base_weight": 1.00,
        "classification": "Ground Truth"
    },
    2: {
        "name": "Tingkat 2: Operational & Transactional Data",
        "description": "Data transaksi riil, sinkronisasi ERP/CRM/Commerce/HRIS, sinyal konteks aktif",
        "base_weight": 0.88,
        "classification": "Operational"
    },
    3: {
        "name": "Tingkat 3: Domain Specialist Knowledge Base",
        "description": "Node 8 Dimensi Company Context Fabric, knowledge graph ontologi korporat",
        "base_weight": 0.75,
        "classification": "Domain Knowledge"
    },
    4: {
        "name": "Tingkat 4: Historical Interactions & Continuous Learning",
        "description": "Memori percakapan terdahulu, audit scoring, ringkasan keputusan manajerial",
        "base_weight": 0.62,
        "classification": "Historical Learning"
    },
    5: {
        "name": "Tingkat 5: Curated Industry & Benchmark Intelligence",
        "description": "Data tolok ukur industri terkurasi, standar kepatuhan nasional/internasional",
        "base_weight": 0.50,
        "classification": "Curated Benchmark"
    },
    6: {
        "name": "Tingkat 6: Public Web Search & Open Intelligence",
        "description": "Pencarian web publik, tren berita industri eksternal (wajib izin eksplisit tenant)",
        "base_weight": 0.35,
        "classification": "External Open Web"
    }
}


class EnterpriseResearchAgent:
    """
    Autonomous Enterprise AI Research Agent (PRD v2.2 Bagian 8.6)
    Mengeksekusi penelusuran fakta dengan 6 tingkat hierarki prioritas,
    menegakkan izin riset web publik, dan memproduksi jawaban yang 100% traceable.
    """

    def __init__(self, db_conn=None):
        self.db_conn = db_conn

    def execute_research(
        self,
        tenant_id: str,
        query: str,
        research_objective: Optional[str] = None,
        sources: Optional[List[KnowledgeSourceItem]] = None,
        policy: Optional[ResearchPolicy] = None,
        allow_web_override: Optional[bool] = None,
    ) -> ResearchQueryResult:
        """
        Menjalankan riset korporat terstruktur:
        1. Evaluasi izin pencarian web publik tenant.
        2. Filter dan sort sumber data berdasarkan 6 tingkat Knowledge Priority Hierarchy.
        3. Tolak akses web publik (Tingkat 6) jika izin tenant = False.
        4. Sintesis jawaban dengan sitasi traceable eksplisit untuk setiap sumber.
        """
        start_time = time.time()
        query_id = str(uuid.uuid4())

        # 1. Evaluasi Kebijakan Izin Riset Web
        effective_policy = policy or ResearchPolicy(allow_public_web_search=False)
        web_search_allowed = (
            allow_web_override if allow_web_override is not None else effective_policy.allow_public_web_search
        )

        all_candidate_sources = sources or []
        web_search_attempted = any(s.level == 6 for s in all_candidate_sources)

        # 2. Filter & Prioritas Sumber Berdasarkan Hierarki 6 Tingkat
        admissible_sources: List[KnowledgeSourceItem] = []
        rejected_web_sources: List[KnowledgeSourceItem] = []

        for item in all_candidate_sources:
            if item.level == 6:
                if web_search_allowed:
                    admissible_sources.append(item)
                else:
                    rejected_web_sources.append(item)
            else:
                admissible_sources.append(item)

        # Urutkan berdasarkan prioritas tingkat (Level 1 tertinggi hingga Level 6)
        admissible_sources.sort(key=lambda x: (x.level, -x.confidence_weight))

        # Tentukan status riset web
        if not web_search_allowed and web_search_attempted:
            public_web_status = "DENIED_BY_TENANT_POLICY"
        elif web_search_allowed and web_search_attempted:
            public_web_status = "PERMITTED"
        elif web_search_allowed and not web_search_attempted:
            public_web_status = "PERMITTED_NOT_REQUIRED"
        else:
            public_web_status = "DENIED_BY_TENANT_POLICY"

        # 3. Hitung level yang dikonsultasikan
        consulted_levels: List[int] = sorted(list(set(s.level for s in admissible_sources)))

        # 4. Sintesis Jawaban Terverifikasi dengan Traceability Penuh
        answer_text, traceability_report, confidence_score = self._synthesize_traceable_response(
            query=query,
            objective=research_objective,
            admissible_sources=admissible_sources,
            consulted_levels=consulted_levels,
            web_search_allowed=web_search_allowed,
            web_search_attempted=web_search_attempted,
            public_web_status=public_web_status,
            rejected_web_count=len(rejected_web_sources),
        )

        latency_ms = int((time.time() - start_time) * 1000)

        sources_payload = [
            {
                "id": s.id,
                "level": s.level,
                "level_name": KNOWLEDGE_LEVEL_METADATA.get(s.level, {}).get("name", f"Level {s.level}"),
                "title": s.title,
                "source_ref": s.source_ref,
                "source_classification": s.source_classification,
                "dimension_code": s.dimension_code,
                "confidence_weight": s.confidence_weight,
                "is_verified": s.is_verified,
            }
            for s in admissible_sources
        ]

        result = ResearchQueryResult(
            id=query_id,
            tenant_id=tenant_id,
            query_text=query,
            research_objective=research_objective,
            knowledge_levels_consulted=consulted_levels,
            sources_used=sources_payload,
            public_web_search_attempted=web_search_attempted,
            public_web_search_allowed=web_search_allowed,
            public_web_status=public_web_status,
            answer_text=answer_text,
            traceability_report=traceability_report,
            confidence_score=confidence_score,
            latency_ms=latency_ms,
            created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )

        return result

    def _synthesize_traceable_response(
        self,
        query: str,
        objective: Optional[str],
        admissible_sources: List[KnowledgeSourceItem],
        consulted_levels: List[int],
        web_search_allowed: bool,
        web_search_attempted: bool,
        public_web_status: str,
        rejected_web_count: int,
    ) -> Tuple[str, Dict[str, Any], float]:
        """
        Membentuk narasi laporan riset yang menyebutkan secara eksplisit
        setiap tingkat sumber yang dipakai dan status kepatuhan web publik.
        """
        lines: List[str] = []

        # Header Laporan Riset
        lines.append("### LAPORAN RISET ENTERPRISE (AI RESEARCH AGENT)")
        lines.append(f"**Pertanyaan Kueri:** {query}")
        if objective:
            lines.append(f"**Sasaran Strategis:** {objective}")
        lines.append("")

        # Bagian 1: Deklarasi Hierarki Sumber Pengetahuan (Traceable Declaration)
        lines.append("#### [HIERARKI SUMBER PENGETAHUAN TERPAKAI]")
        if not consulted_levels:
            lines.append("• *Tidak ada sumber terverifikasi yang memenuhi kriteria kueri saat ini.*")
        else:
            for lvl in consulted_levels:
                meta = KNOWLEDGE_LEVEL_METADATA.get(lvl, {})
                count = sum(1 for s in admissible_sources if s.level == lvl)
                lines.append(
                    f"• **{meta.get('name', f'Tingkat {lvl}')}** — {count} rujukan "
                    f"({meta.get('description', '')})"
                )

        lines.append("")

        # Bagian 2: Status Izin Penelusuran Web Publik (PRD 8.6 Enforcement)
        lines.append("#### [STATUS AKSES WEB PUBLIK]")
        if web_search_allowed:
            lines.append(
                "• **Status Izin Tenant:** DIIZINKAN (Tingkat 6 Aktif) — "
                "Pencarian web publik diotorisasi secara eksplisit oleh kebijakan korporat."
            )
        else:
            if web_search_attempted or rejected_web_count > 0:
                lines.append(
                    "• **Status Izin Tenant:** DITOLAK / TIDAK DIIZINKAN (DENIED_BY_TENANT_POLICY) — "
                    "Akses pencarian web publik (Tingkat 6) diblokir demi kerahasiaan data korporat. "
                    f"{rejected_web_count} rujukan web eksternal dikesampingkan dari sintesis."
                )
            else:
                lines.append(
                    "• **Status Izin Tenant:** DINONAKTIFKAN (Default Keamanan) — "
                    "Penyelidikan terbatas secara ketat pada data internal dan domain terkurasi (Tingkat 1 - 5)."
                )

        lines.append("")

        # Bagian 3: Sintesis Fakta & Temuan Inti dengan Sitasi Eksplisit
        lines.append("#### [RINGKASAN TEMUAN & ANALISIS TERVERIFIKASI]")
        citations: List[Dict[str, Any]] = []
        total_weight = 0.0

        for idx, src in enumerate(admissible_sources, start=1):
            meta = KNOWLEDGE_LEVEL_METADATA.get(src.level, {})
            tag = f"[Tingkat {src.level}: {meta.get('classification', 'Source')}]"
            ref_info = f" (Ref: {src.source_ref})" if src.source_ref else ""
            dim_info = f" [Dimensi: {src.dimension_code}]" if src.dimension_code else ""

            lines.append(f"{idx}. {tag}{dim_info} **{src.title}**{ref_info}:")
            lines.append(f"   {src.content}")

            weight = meta.get("base_weight", 0.5) * src.confidence_weight
            total_weight += weight

            citations.append({
                "citation_index": idx,
                "knowledge_level": src.level,
                "level_name": meta.get("name", f"Level {src.level}"),
                "title": src.title,
                "source_ref": src.source_ref,
                "dimension_code": src.dimension_code,
                "source_classification": src.source_classification,
                "confidence_weight": src.confidence_weight,
            })

        lines.append("")

        # Bagian 4: Kesimpulan Eksekutif AI Research Agent
        lines.append("#### [KESIMPULAN EKSEKUTIF]")
        highest_level = min(consulted_levels) if consulted_levels else 6
        highest_meta = KNOWLEDGE_LEVEL_METADATA.get(highest_level, {})
        lines.append(
            f"Berdasarkan hierarki prioritas pengetahuan, kesimpulan ini didasarkan pada data otoritatif "
            f"tertinggi dari **{highest_meta.get('name', 'Basis Pengetahuan Internal')}** "
            f"dengan rantai audit provenance lengkap."
        )

        # Hitung skor keyakinan terbobot
        if admissible_sources:
            highest_lvl = min(consulted_levels) if consulted_levels else 6
            if highest_lvl == 1:
                base_conf = 0.92
            elif highest_lvl == 2:
                base_conf = 0.85
            elif highest_lvl == 3:
                base_conf = 0.78
            elif highest_lvl == 4:
                base_conf = 0.70
            elif highest_lvl == 5:
                base_conf = 0.62
            else:
                base_conf = 0.50

            verified_ratio = sum(1 for s in admissible_sources if s.is_verified) / len(admissible_sources)
            confidence_score = min(0.9990, round(base_conf + (verified_ratio * 0.06), 4))
        else:
            confidence_score = 0.5000

        full_answer = "\n".join(lines)

        traceability_report = {
            "levels_consulted": consulted_levels,
            "level_names": [
                KNOWLEDGE_LEVEL_METADATA.get(lvl, {}).get("name", f"Level {lvl}")
                for lvl in consulted_levels
            ],
            "highest_priority_level": highest_level,
            "public_web_search_allowed": web_search_allowed,
            "public_web_search_attempted": web_search_attempted,
            "public_web_status": public_web_status,
            "rejected_web_sources_count": rejected_web_count,
            "citations": citations,
            "total_sources_cited": len(citations),
            "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

        return full_answer, traceability_report, confidence_score
