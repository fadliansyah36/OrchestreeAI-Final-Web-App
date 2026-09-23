"""
OrchestreeAI Project Health & Multi-Agent Parallel Collaboration Engine (PRD v2.2 Bagian 8.13.7)
Python 3.12 + FastAPI + Supabase Postgres

PENEGAKAN DEFINITION OF DONE:
- Satu Executive Recommendation dihasilkan dari kontribusi paralel beberapa Specialist Agent yang berbeda,
  dapat ditelusuri kontribusi masing-masing (traceability).
"""

from typing import List, Dict, Any, Optional
import uuid
import datetime
import asyncio
import logging

try:
    from pydantic import BaseModel, Field

    class SpecialistAgentProfile(BaseModel):
        agent_code: str
        specialization_domain: str
        display_name: str
        description: str
        persona_type: str = "SPECIALIST_ANALYST"
        system_prompt_framework: str
        capabilities: List[str] = Field(default_factory=list)

    class ProjectHealthDiagnostic(BaseModel):
        project_ref_id: str
        project_name: str
        overall_health_score: float
        health_status: str  # CRITICAL, AT_RISK, MODERATE, HEALTHY, EXCELLENT
        schedule_adherence_score: float
        budget_burn_score: float
        resource_allocation_score: float
        risk_factors: List[str] = Field(default_factory=list)
        metrics_snapshot: Dict[str, Any] = Field(default_factory=dict)
        last_assessed_at: str

    class SpecialistAgentContribution(BaseModel):
        agent_code: str
        agent_name: str
        domain: str
        perspective_analysis: str
        identified_risks: List[str] = Field(default_factory=list)
        recommended_interventions: List[str] = Field(default_factory=list)
        confidence_score: float
        contributed_at: str
        trace_id: str

    class ContributingSpecialistTrace(BaseModel):
        agent_code: str
        agent_name: str
        domain: str
        trace_id: str
        key_contribution: str
        confidence_score: float

    class ExecutiveRecommendation(BaseModel):
        session_id: str
        project_ref_id: str
        project_name: str
        recommendation_title: str
        synthesized_strategy: str
        immediate_action_items: List[Dict[str, Any]] = Field(default_factory=list)
        contributing_specialists_traces: List[ContributingSpecialistTrace] = Field(default_factory=list)
        consensus_score: float
        overall_health_verdict: str
        synthesized_by: str
        synthesized_at: str

    class MultiAgentCollaborationSession(BaseModel):
        id: str
        tenant_id: str
        project_ref_id: str
        session_topic: str
        status: str
        participating_agent_codes: List[str] = Field(default_factory=list)
        agent_contributions: List[SpecialistAgentContribution] = Field(default_factory=list)
        executive_recommendation: Optional[ExecutiveRecommendation] = None
        created_at: str
        updated_at: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class SpecialistAgentProfile:
        agent_code: str
        specialization_domain: str
        display_name: str
        description: str
        system_prompt_framework: str
        persona_type: str = "SPECIALIST_ANALYST"
        capabilities: List[str] = field(default_factory=list)

        def model_dump(self) -> Dict[str, Any]:
            return {
                "agent_code": self.agent_code,
                "specialization_domain": self.specialization_domain,
                "display_name": self.display_name,
                "description": self.description,
                "persona_type": self.persona_type,
                "system_prompt_framework": self.system_prompt_framework,
                "capabilities": self.capabilities,
            }

    @dataclass
    class ProjectHealthDiagnostic:
        project_ref_id: str
        project_name: str
        overall_health_score: float
        health_status: str
        schedule_adherence_score: float
        budget_burn_score: float
        resource_allocation_score: float
        last_assessed_at: str
        risk_factors: List[str] = field(default_factory=list)
        metrics_snapshot: Dict[str, Any] = field(default_factory=dict)

        def model_dump(self) -> Dict[str, Any]:
            return {
                "project_ref_id": self.project_ref_id,
                "project_name": self.project_name,
                "overall_health_score": self.overall_health_score,
                "health_status": self.health_status,
                "schedule_adherence_score": self.schedule_adherence_score,
                "budget_burn_score": self.budget_burn_score,
                "resource_allocation_score": self.resource_allocation_score,
                "risk_factors": self.risk_factors,
                "metrics_snapshot": self.metrics_snapshot,
                "last_assessed_at": self.last_assessed_at,
            }

    @dataclass
    class SpecialistAgentContribution:
        agent_code: str
        agent_name: str
        domain: str
        perspective_analysis: str
        confidence_score: float
        contributed_at: str
        trace_id: str
        identified_risks: List[str] = field(default_factory=list)
        recommended_interventions: List[str] = field(default_factory=list)

        def model_dump(self) -> Dict[str, Any]:
            return {
                "agent_code": self.agent_code,
                "agent_name": self.agent_name,
                "domain": self.domain,
                "perspective_analysis": self.perspective_analysis,
                "identified_risks": self.identified_risks,
                "recommended_interventions": self.recommended_interventions,
                "confidence_score": self.confidence_score,
                "contributed_at": self.contributed_at,
                "trace_id": self.trace_id,
            }

    @dataclass
    class ContributingSpecialistTrace:
        agent_code: str
        agent_name: str
        domain: str
        trace_id: str
        key_contribution: str
        confidence_score: float

        def model_dump(self) -> Dict[str, Any]:
            return {
                "agent_code": self.agent_code,
                "agent_name": self.agent_name,
                "domain": self.domain,
                "trace_id": self.trace_id,
                "key_contribution": self.key_contribution,
                "confidence_score": self.confidence_score,
            }

    @dataclass
    class ExecutiveRecommendation:
        session_id: str
        project_ref_id: str
        project_name: str
        recommendation_title: str
        synthesized_strategy: str
        consensus_score: float
        overall_health_verdict: str
        synthesized_by: str
        synthesized_at: str
        immediate_action_items: List[Dict[str, Any]] = field(default_factory=list)
        contributing_specialists_traces: List[ContributingSpecialistTrace] = field(default_factory=list)

        def model_dump(self) -> Dict[str, Any]:
            return {
                "session_id": self.session_id,
                "project_ref_id": self.project_ref_id,
                "project_name": self.project_name,
                "recommendation_title": self.recommendation_title,
                "synthesized_strategy": self.synthesized_strategy,
                "immediate_action_items": self.immediate_action_items,
                "contributing_specialists_traces": [
                    t.model_dump() if hasattr(t, "model_dump") else t.__dict__
                    for t in self.contributing_specialists_traces
                ],
                "consensus_score": self.consensus_score,
                "overall_health_verdict": self.overall_health_verdict,
                "synthesized_by": self.synthesized_by,
                "synthesized_at": self.synthesized_at,
            }

    @dataclass
    class MultiAgentCollaborationSession:
        id: str
        tenant_id: str
        project_ref_id: str
        session_topic: str
        status: str
        created_at: str
        updated_at: str
        participating_agent_codes: List[str] = field(default_factory=list)
        agent_contributions: List[SpecialistAgentContribution] = field(default_factory=list)
        executive_recommendation: Optional[ExecutiveRecommendation] = None

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "tenant_id": self.tenant_id,
                "project_ref_id": self.project_ref_id,
                "session_topic": self.session_topic,
                "status": self.status,
                "participating_agent_codes": self.participating_agent_codes,
                "agent_contributions": [
                    c.model_dump() if hasattr(c, "model_dump") else c.__dict__
                    for c in self.agent_contributions
                ],
                "executive_recommendation": (
                    self.executive_recommendation.model_dump()
                    if hasattr(self.executive_recommendation, "model_dump")
                    else self.executive_recommendation.__dict__
                    if self.executive_recommendation
                    else None
                ),
                "created_at": self.created_at,
                "updated_at": self.updated_at,
            }

logger = logging.getLogger(__name__)


# Katalog Bawaan Specialist Agents
DEFAULT_SPECIALIST_AGENTS: Dict[str, SpecialistAgentProfile] = {
    "SPECIALIST_FINANCIAL_ANALYST": SpecialistAgentProfile(
        agent_code="SPECIALIST_FINANCIAL_ANALYST",
        specialization_domain="FINANCE",
        display_name="Financial & Runway Specialist Agent",
        description="Analisis deviasi anggaran, burn rate operasional, dan proteksi arus kas proyek.",
        system_prompt_framework="Bertindak sebagai Analis Keuangan Eksekutif. Identifikasi risiko pembengkakan biaya dan cadangan modal.",
        capabilities=["budget_variance_analysis", "cash_burn_projection", "cost_containment"]
    ),
    "SPECIALIST_SUPPLY_CHAIN": SpecialistAgentProfile(
        agent_code="SPECIALIST_SUPPLY_CHAIN",
        specialization_domain="SUPPLY_CHAIN",
        display_name="Supply Chain & Procurement Specialist Agent",
        description="Analisis rantai pasok material, bottleneck vendor, dan lead time pengadaan.",
        system_prompt_framework="Bertindak sebagai Manajer Rantai Pasok Korporat. Evaluasi ketersediaan stok vendor dan risiko pengiriman.",
        capabilities=["lead_time_optimization", "inventory_safety_stock", "supplier_sla_monitoring"]
    ),
    "SPECIALIST_LEGAL_COMPLIANCE": SpecialistAgentProfile(
        agent_code="SPECIALIST_LEGAL_COMPLIANCE",
        specialization_domain="LEGAL",
        display_name="Legal & Regulatory Compliance Specialist Agent",
        description="Analisis kepatuhan klausul kontrak, regulasi data PDP, dan mitigasi sanksi hukum.",
        system_prompt_framework="Bertindak sebagai Penasihat Hukum Korporat. Deteksi pelanggaran SLA klausul kontrak dan risiko liabilitas.",
        capabilities=["contractual_sla_compliance", "pdp_data_protection", "regulatory_audit_trail"]
    ),
    "SPECIALIST_COMMERCIAL_GROWTH": SpecialistAgentProfile(
        agent_code="SPECIALIST_COMMERCIAL_GROWTH",
        specialization_domain="COMMERCIAL",
        display_name="Commercial & Stakeholder Retention Specialist Agent",
        description="Analisis kepuasan stakeholder, risiko churn klien strategis, dan pencapaian target komersial.",
        system_prompt_framework="Bertindak sebagai Direktur Hubungan Klien & Komersial. Jaga kepercayaan klien korporat dan retensi nilai akun.",
        capabilities=["client_satisfaction_guardrails", "revenue_retention", "stakeholder_communication"]
    ),
    "SPECIALIST_WORKFORCE_PRODUCTIVITY": SpecialistAgentProfile(
        agent_code="SPECIALIST_WORKFORCE_PRODUCTIVITY",
        specialization_domain="WORKFORCE",
        display_name="Workforce & Capacity Allocation Specialist Agent",
        description="Analisis pemanfaatan kapasitas tenaga kerja tim, bottleneck ketergantungan task, dan beban kerja.",
        system_prompt_framework="Bertindak sebagai Perencana Tenaga Kerja Otonom. Optimalkan beban tugas dan hindari keterlambatan jalur kritis.",
        capabilities=["critical_path_scheduling", "workload_rebalancing", "autonomous_task_reassignment"]
    )
}


class EnterpriseProjectHealthEngine:
    """
    Mesin Diagnostik Kesehatan Proyek & Kolaborasi Paralel Multi-Agent (PRD v2.2 Bagian 8.13.7).
    Menghasilkan satu Executive Recommendation yang dapat ditelusuri kontribusinya dari masing-masing agen spesialis.
    """

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    def calculate_health_diagnostic(
        self,
        project_ref_id: str,
        project_name: str,
        metrics: Dict[str, Any],
    ) -> ProjectHealthDiagnostic:
        """
        Menghitung diagnostik kesehatan inisiatif proyek komprehensif.
        Bobot: Jadwal (35%), Anggaran (35%), Alokasi Sumber Daya (30%).
        """
        # 1. Schedule Adherence (0-100)
        # default jika tidak ada metrik keterlambatan: 100
        completed_tasks = metrics.get("completed_tasks", 10)
        total_tasks = max(1, metrics.get("total_tasks", 10))
        delayed_tasks = metrics.get("delayed_tasks", 0)

        task_completion_ratio = min(1.0, completed_tasks / total_tasks)
        delay_penalty = min(60.0, (delayed_tasks / total_tasks) * 100.0)
        schedule_score = max(0.0, min(100.0, (task_completion_ratio * 100.0) - delay_penalty + (30 if delayed_tasks == 0 else 0)))
        schedule_score = round(schedule_score, 2)

        # 2. Budget Burn Score (0-100)
        allocated_budget = max(1.0, float(metrics.get("allocated_budget", 100000000.0)))
        actual_spend = float(metrics.get("actual_spend", 50000000.0))
        burn_ratio = actual_spend / allocated_budget
        if burn_ratio <= 1.0:
            budget_score = round(100.0 - (burn_ratio * 30.0), 2)  # 70-100 jika dalam batas anggaran
        else:
            overspend_penalty = (burn_ratio - 1.0) * 100.0
            budget_score = max(0.0, round(70.0 - overspend_penalty, 2))

        # 3. Resource Allocation Score (0-100)
        resource_utilization_pct = float(metrics.get("resource_utilization_pct", 80.0))
        if 60.0 <= resource_utilization_pct <= 90.0:
            resource_score = 95.0
        elif resource_utilization_pct > 90.0:
            # Overloaded
            resource_score = max(20.0, round(100.0 - (resource_utilization_pct - 90.0) * 4.0, 2))
        else:
            # Underutilized
            resource_score = max(30.0, round(utilization_penalty := 60.0 - (60.0 - resource_utilization_pct) * 2.0, 2))

        # Overall Score
        overall = round(
            (schedule_score * 0.35) +
            (budget_score * 0.35) +
            (resource_score * 0.30),
            2
        )

        # Status Triage
        if overall < 40.0:
            status = "CRITICAL"
        elif overall < 65.0:
            status = "AT_RISK"
        elif overall < 80.0:
            status = "MODERATE"
        elif overall < 90.0:
            status = "HEALTHY"
        else:
            status = "EXCELLENT"

        # Deteksi Risk Factors
        risk_factors = []
        if delayed_tasks > 0:
            risk_factors.append(f"Terdapat {delayed_tasks} tugas krusial mengalami deviasi jadwal.")
        if burn_ratio > 1.0:
            risk_factors.append(f"Pembengkakan anggaran sebesar {(burn_ratio - 1.0) * 100:.1f}% di atas alokasi awal.")
        if resource_utilization_pct > 90.0:
            risk_factors.append(f"Beban kerja tenaga kerja berada di zona merah ({resource_utilization_pct:.1f}%).")
        if metrics.get("supplier_delay_days", 0) > 0:
            risk_factors.append(f"Keterlambatan pengiriman material supplier sebesar {metrics['supplier_delay_days']} hari.")

        return ProjectHealthDiagnostic(
            project_ref_id=project_ref_id,
            project_name=project_name,
            overall_health_score=overall,
            health_status=status,
            schedule_adherence_score=schedule_score,
            budget_burn_score=budget_score,
            resource_allocation_score=resource_score,
            risk_factors=risk_factors,
            metrics_snapshot=metrics,
            last_assessed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )

    async def _execute_single_specialist_analysis(
        self,
        specialist: SpecialistAgentProfile,
        health: ProjectHealthDiagnostic,
    ) -> SpecialistAgentContribution:
        """
        Menjalankan penalaran analisis dari sudut pandang agen spesialis domain tertentu.
        Simulasi inferensi terfokus pada domain keahlian agen.
        """
        # Memberikan latensi minimal untuk mensimulasikan inferensi model paralel
        await asyncio.sleep(0.005)

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        trace_id = f"TRACE-{specialist.agent_code[:12]}-{uuid.uuid4().hex[:8].upper()}"

        identified_risks = []
        recommended_interventions = []

        if specialist.specialization_domain == "FINANCE":
            analysis = (
                f"Analisis Keuangan [{specialist.display_name}]: Skor anggaran {health.budget_burn_score}/100. "
                f"Deviasi pengeluaran aktual terhadap pagu proyek memerlukan pengetatan alokasi cadangan kontingensi."
            )
            identified_risks.append("Potensi penipisan runway jika laju burn rate dipertahankan tanpa intervensi.")
            recommended_interventions.append("Bekukan pengeluaran non-esensial dan terapkan approval tier 2 untuk PO di atas Rp 25.000.000.")
            confidence = 0.94

        elif specialist.specialization_domain == "SUPPLY_CHAIN":
            supplier_days = health.metrics_snapshot.get("supplier_delay_days", 0)
            analysis = (
                f"Analisis Rantai Pasok [{specialist.display_name}]: Keterlambatan supplier terdeteksi ({supplier_days} hari). "
                f"Dibutuhkan re-routing pesanan komponen kritis ke vendor sekunder terverifikasi."
            )
            identified_risks.append(f"Lead time supplier menambah penundaan delivery hingga {supplier_days + 3} hari kerja.")
            recommended_interventions.append("Alihkan 40% volume pengadaan ke vendor cadangan (dual-sourcing agreement).")
            confidence = 0.91

        elif specialist.specialization_domain == "LEGAL":
            analysis = (
                f"Analisis Kepatuhan Legal [{specialist.display_name}]: Memeriksa klausul pinalti keterlambatan kontrak utama. "
                f"Keterlambatan penyelesaian berisiko memicu denda likuiditas 0.1% per hari."
            )
            identified_risks.append("Klausul pinalti kontrak klien tier Enterprise aktif jika keterlambatan melampaui toleransi 7 hari.")
            recommended_interventions.append("Kirimkan surat permohonan addendum penyesuaian milestone sebelum batas waktu denda terlewati.")
            confidence = 0.89

        elif specialist.specialization_domain == "COMMERCIAL":
            analysis = (
                f"Analisis Pertumbuhan Komersial [{specialist.display_name}]: Menjaga ekspektasi klien dan kepuasan akun. "
                f"Status kesehatan proyek '{health.health_status}' memerlukan komunikasi proaktif transparan."
            )
            identified_risks.append("Penurunan indeks kepuasan stakeholder dapat mempengaruhi negosiasi perpanjangan kontrak tahunan.")
            recommended_interventions.append("Jadwalkan rapat rekonsiliasi eksekutif dengan sponsor proyek dalam 48 jam.")
            confidence = 0.93

        else:  # WORKFORCE / OPERATIONS
            analysis = (
                f"Analisis Produktivitas Tenaga Kerja [{specialist.display_name}]: Utilisasi kapasitas {health.resource_allocation_score}/100. "
                f"Perlu penataan ulang backlog task kritis agar tidak terjadi bottleneck pada engineer senior."
            )
            identified_risks.append("Kelelahan tim inti berpotensi meningkatkan tingkat kesalahan delivery.")
            recommended_interventions.append("Tugaskan AI Specialist Agent untuk mengotomatiskan pengujian regresi dan verifikasi dokumen.")
            confidence = 0.90

        return SpecialistAgentContribution(
            agent_code=specialist.agent_code,
            agent_name=specialist.display_name,
            domain=specialist.specialization_domain,
            perspective_analysis=analysis,
            identified_risks=identified_risks,
            recommended_interventions=recommended_interventions,
            confidence_score=confidence,
            contributed_at=now_iso,
            trace_id=trace_id,
        )

    async def run_parallel_multi_agent_collaboration(
        self,
        tenant_id: str,
        project_ref_id: str,
        project_name: str,
        health: ProjectHealthDiagnostic,
        specialist_agent_codes: Optional[List[str]] = None,
        db_connection=None,
    ) -> MultiAgentCollaborationSession:
        """
        Menjalankan kolaborasi paralel multi-agent (PRD v2.2 Bagian 8.13.7)
        dan mensintesis hasilnya menjadi SATU Executive Recommendation
        dengan bukti penelusuran (traceability) kontribusi masing-masing agen.
        """
        session_id = str(uuid.uuid4())
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Tentukan spesialis yang berpartisipasi
        codes_to_run = specialist_agent_codes or [
            "SPECIALIST_FINANCIAL_ANALYST",
            "SPECIALIST_SUPPLY_CHAIN",
            "SPECIALIST_LEGAL_COMPLIANCE",
            "SPECIALIST_COMMERCIAL_GROWTH",
        ]

        active_specialists = [
            DEFAULT_SPECIALIST_AGENTS[c] for c in codes_to_run if c in DEFAULT_SPECIALIST_AGENTS
        ]
        if not active_specialists:
            active_specialists = list(DEFAULT_SPECIALIST_AGENTS.values())[:3]

        # 1. EKSEKUSI PARALEL SEMUA SPECIALIST AGENTS MENGGUNAKAN asyncio.gather
        tasks = [
            self._execute_single_specialist_analysis(spec, health)
            for spec in active_specialists
        ]
        contributions: List[SpecialistAgentContribution] = await asyncio.gather(*tasks)

        # 2. SINTESIS MENJADI SATU EXECUTIVE RECOMMENDATION (PENEGAKAN DEFINITION OF DONE)
        traces: List[ContributingSpecialistTrace] = []
        all_action_items = []
        strategy_points = []

        for contrib in contributions:
            # Catat jejak penelusuran kontribusi masing-masing agen
            key_contrib = contrib.recommended_interventions[0] if contrib.recommended_interventions else contrib.perspective_analysis
            traces.append(
                ContributingSpecialistTrace(
                    agent_code=contrib.agent_code,
                    agent_name=contrib.agent_name,
                    domain=contrib.domain,
                    trace_id=contrib.trace_id,
                    key_contribution=key_contrib,
                    confidence_score=contrib.confidence_score,
                )
            )

            # Rangkai rencana tindakan eksekutif
            for intervention in contrib.recommended_interventions:
                all_action_items.append({
                    "originating_agent_code": contrib.agent_code,
                    "domain": contrib.domain,
                    "action": intervention,
                    "trace_id": contrib.trace_id,
                    "priority": "HIGH" if health.health_status in ("CRITICAL", "AT_RISK") else "MEDIUM",
                })

            strategy_points.append(f"[{contrib.domain} - {contrib.agent_name}]: {contrib.perspective_analysis}")

        # Rata-rata skor konsensus
        avg_confidence = round(sum(c.confidence_score for c in contributions) / max(1, len(contributions)), 2)

        synthesized_strategy_text = (
            f"Strategi Penyelamatan & Stabilisasi Proyek '{project_name}' (Status: {health.health_status}, Skor: {health.overall_health_score}/100):\n"
            + "\n".join(strategy_points)
        )

        exec_rec = ExecutiveRecommendation(
            session_id=session_id,
            project_ref_id=project_ref_id,
            project_name=project_name,
            recommendation_title=f"Executive Stabilization Directive: {project_name}",
            synthesized_strategy=synthesized_strategy_text,
            immediate_action_items=all_action_items,
            contributing_specialists_traces=traces,  # DoD: Bukti penelusuran kontribusi masing-masing agen
            consensus_score=avg_confidence,
            overall_health_verdict=health.health_status,
            synthesized_by="CHIEF_OF_STAFF_SYNTHESIZER",
            synthesized_at=now_iso,
        )

        session = MultiAgentCollaborationSession(
            id=session_id,
            tenant_id=tenant_id,
            project_ref_id=project_ref_id,
            session_topic=f"Diagnostik & Stabilisasi Multi-Agent: {project_name}",
            status="COMPLETED",
            participating_agent_codes=[s.agent_code for s in active_specialists],
            agent_contributions=contributions,
            executive_recommendation=exec_rec,
            created_at=now_iso,
            updated_at=now_iso,
        )

        # 3. Simpan ke database jika koneksi tersedia
        conn = db_connection or self.db_pool
        if conn:
            try:
                import json
                # Simpan skor kesehatan proyek
                await conn.execute(
                    """
                    INSERT INTO project_health_scores (
                        tenant_id, project_ref_id, project_name, overall_health_score,
                        health_status, schedule_adherence_score, budget_burn_score,
                        resource_allocation_score, risk_factors, metrics_snapshot,
                        last_assessed_at, updated_at
                    ) VALUES (
                        $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, now(), now()
                    )
                    ON CONFLICT (tenant_id, project_ref_id) DO UPDATE SET
                        overall_health_score = EXCLUDED.overall_health_score,
                        health_status = EXCLUDED.health_status,
                        schedule_adherence_score = EXCLUDED.schedule_adherence_score,
                        budget_burn_score = EXCLUDED.budget_burn_score,
                        resource_allocation_score = EXCLUDED.resource_allocation_score,
                        risk_factors = EXCLUDED.risk_factors,
                        metrics_snapshot = EXCLUDED.metrics_snapshot,
                        last_assessed_at = now(),
                        updated_at = now();
                    """,
                    uuid.UUID(tenant_id),
                    project_ref_id,
                    project_name,
                    health.overall_health_score,
                    health.health_status,
                    health.schedule_adherence_score,
                    health.budget_burn_score,
                    health.resource_allocation_score,
                    json.dumps(health.risk_factors),
                    json.dumps(health.metrics_snapshot),
                )

                # Simpan sesi kolaborasi multi-agent
                await conn.execute(
                    """
                    INSERT INTO multi_agent_collaboration_sessions (
                        id, tenant_id, project_ref_id, session_topic, status,
                        participating_agent_codes, agent_contributions,
                        executive_recommendation, created_at, updated_at
                    ) VALUES (
                        $1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now(), now()
                    )
                    """,
                    uuid.UUID(session_id),
                    uuid.UUID(tenant_id),
                    project_ref_id,
                    session.session_topic,
                    session.status,
                    session.participating_agent_codes,
                    json.dumps([c.model_dump() if hasattr(c, "model_dump") else c.__dict__ for c in session.agent_contributions]),
                    json.dumps(exec_rec.model_dump() if hasattr(exec_rec, "model_dump") else exec_rec.__dict__),
                )
            except Exception as exc:
                logger.warning("Gagal persist project health and session to database: %s", exc)

        return session


__all__ = [
    "SpecialistAgentProfile",
    "ProjectHealthDiagnostic",
    "SpecialistAgentContribution",
    "ContributingSpecialistTrace",
    "ExecutiveRecommendation",
    "MultiAgentCollaborationSession",
    "DEFAULT_SPECIALIST_AGENTS",
    "EnterpriseProjectHealthEngine",
]
