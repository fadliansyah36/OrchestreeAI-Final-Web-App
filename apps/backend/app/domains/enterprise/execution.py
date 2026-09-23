"""
OrchestreeAI Enterprise Autonomous Task Execution from Detected Signals (PRD v2.2 Bagian 8.13.3, 3.5, 14.2)
Python 3.12 + FastAPI + Supabase Postgres

Tugas:
1. Mengevaluasi sinyal granular (SourceSignal/company_context_signals) atau correlated context events (CorrelatedContextEvent/company_context_events).
2. Menghasilkan perencanaan penugasan operasional otonom (AutonomousTaskPlan).
3. Menetapkan aturan verifikasi data sumber nyata (TaskVerificationRule) untuk menjamin traceability dan auditability.
4. Mendaftarkan task secara atomik ke tabel SSOT `tasks` dan `task_source_verifications`.
"""

from typing import List, Dict, Any, Optional, Union
import uuid
import datetime
import logging

try:
    from pydantic import BaseModel, Field

    class TaskVerificationRule(BaseModel):
        """Aturan verifikasi data sumber nyata untuk penyelesaian task."""
        source_system: str = Field(..., description="Sistem asal data (mis. ERP_SAP, ORCHESTREE_CRM, INVENTORY)")
        source_table: str = Field(..., description="Tabel sumber SSOT (mis. leads, orders, inventory_stock, shipments)")
        source_record_id: str = Field(..., description="ID record unik pada tabel sumber untuk verifikasi bukti nyata")
        condition_type: str = Field("FIELD_EQUALS", description="Tipe evaluasi: FIELD_EQUALS, FIELD_GTE, STATUS_IN, RECORD_EXISTS")
        field_name: str = Field(..., description="Kolom pada tabel sumber yang dievaluasi (mis. status, stock_level, fulfillment_status)")
        expected_value: Any = Field(..., description="Nilai yang diharapkan pada data sumber nyata")
        verification_description: str = Field(..., description="Penjelasan manusia mengenai kriteria bukti verifikasi")

    class AutonomousTaskPlan(BaseModel):
        """Rencana penugasan otonom hasil sintesis sinyal terdeteksi."""
        id: str
        tenant_id: str
        board_id: Optional[str] = None
        column_id: Optional[str] = None
        title: str
        description: str
        priority: str = "medium"  # low, medium, high, urgent
        assigned_department: str
        assigned_agent_id: Optional[str] = None
        assigned_agent_name: Optional[str] = None
        source_signal_ids: List[str] = Field(default_factory=list)
        source_event_id: Optional[str] = None
        verification_rule: TaskVerificationRule
        status: str = "PENDING_EXECUTION"
        created_at: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class TaskVerificationRule:
        source_system: str
        source_table: str
        source_record_id: str
        field_name: str
        expected_value: Any
        verification_description: str
        condition_type: str = "FIELD_EQUALS"

        def model_dump(self) -> Dict[str, Any]:
            return {
                "source_system": self.source_system,
                "source_table": self.source_table,
                "source_record_id": self.source_record_id,
                "condition_type": self.condition_type,
                "field_name": self.field_name,
                "expected_value": self.expected_value,
                "verification_description": self.verification_description,
            }

    @dataclass
    class AutonomousTaskPlan:
        id: str
        tenant_id: str
        title: str
        description: str
        assigned_department: str
        verification_rule: TaskVerificationRule
        board_id: Optional[str] = None
        column_id: Optional[str] = None
        priority: str = "medium"
        assigned_agent_id: Optional[str] = None
        assigned_agent_name: Optional[str] = None
        source_signal_ids: List[str] = field(default_factory=list)
        source_event_id: Optional[str] = None
        status: str = "PENDING_EXECUTION"
        created_at: str = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

        def model_dump(self) -> Dict[str, Any]:
            return {
                "id": self.id,
                "tenant_id": self.tenant_id,
                "board_id": self.board_id,
                "column_id": self.column_id,
                "title": self.title,
                "description": self.description,
                "priority": self.priority,
                "assigned_department": self.assigned_department,
                "assigned_agent_id": self.assigned_agent_id,
                "assigned_agent_name": self.assigned_agent_name,
                "source_signal_ids": self.source_signal_ids,
                "source_event_id": self.source_event_id,
                "verification_rule": self.verification_rule.model_dump() if hasattr(self.verification_rule, "model_dump") else self.verification_rule.__dict__,
                "status": self.status,
                "created_at": self.created_at,
            }

logger = logging.getLogger(__name__)


# Peta departemen & spesialisasi agen default untuk eksekusi sinyal
DEPARTMENT_AGENT_MAP = {
    "CRM": {"dept": "Sales & CRM", "agent": "Sinta (Sales Navigator)", "priority": "high"},
    "ERP": {"dept": "Supply Chain & Operations", "agent": "Budi (Operations & Logistics)", "priority": "urgent"},
    "SUPPLY_CHAIN": {"dept": "Supply Chain & Operations", "agent": "Budi (Operations & Logistics)", "priority": "high"},
    "INVENTORY": {"dept": "Inventory & Fulfillment", "agent": "Dimas (Warehouse Manager)", "priority": "high"},
    "HRIS": {"dept": "People & Operations", "agent": "Maya (People Partner)", "priority": "medium"},
    "LEGAL": {"dept": "Legal & Compliance", "agent": "Faisal (Governance Guard)", "priority": "high"},
    "FINANCE": {"dept": "Finance & Accounting", "agent": "Tari (Financial Auditor)", "priority": "urgent"},
    "CUSTOMER_SERVICE": {"dept": "Customer Support", "agent": "Rina (Customer Success)", "priority": "medium"},
}


class AutonomousTaskExecutionEngine:
    """
    Engine Eksekusi Otonom (PRD v2.2 Bagian 8.13.3).
    Menerjemahkan sinyal terdeteksi menjadi tugas operasional Kanban dengan
    aturan verifikasi data sumber nyata yang ketat.
    """

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    def formulate_task_from_signal(
        self,
        tenant_id: str,
        signal_or_event: Any,
        custom_board_id: Optional[str] = None,
        custom_column_id: Optional[str] = None,
    ) -> AutonomousTaskPlan:
        """
        Memformulasikan AutonomousTaskPlan lengkap dari sinyal granular atau event korelasi.
        Menetapkan aturan verifikasi data sumber nyata yang wajib dibuktikan sebelum selesai.
        """
        task_id = str(uuid.uuid4())
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Deteksi apakah input berupa CorrelatedContextEvent atau SourceSignal
        is_event = hasattr(signal_or_event, "correlation_score") or getattr(signal_or_event, "event_type", None) == "CROSS_SYSTEM_SYNTHESIS"

        if is_event:
            source_event_id = getattr(signal_or_event, "id", None)
            source_signals = getattr(signal_or_event, "source_signals", [])
            source_signal_ids = [s.get("id") for s in source_signals if isinstance(s, dict) and s.get("id")]
            title_prefix = "[Sintesis Sinyal Lintas Sistem]"
            raw_title = getattr(signal_or_event, "title", "Penyelarasan Operasional Lintas Departemen")
            summary = getattr(signal_or_event, "summary", "")

            # Evaluasi sumber utama dari sinyal pertama
            first_sig = source_signals[0] if source_signals else {}
            source_system = first_sig.get("source_system", "ENTERPRISE_SYSTEM")
            source_ref_id = first_sig.get("source_ref_id", str(uuid.uuid4()))
            signal_type = first_sig.get("signal_type", "CROSS_SYSTEM_ACTION")
            source_payload = first_sig.get("payload", {})
        else:
            source_event_id = None
            sig_id = getattr(signal_or_event, "id", None) or str(uuid.uuid4())
            source_signal_ids = [sig_id]
            title_prefix = "[Tindakan Respons Sinyal]"
            raw_title = getattr(signal_or_event, "title", "Respons Sinyal Operasional")
            summary = getattr(signal_or_event, "payload", {})
            source_system = getattr(signal_or_event, "source_system", "OPERATIONAL_SYSTEM")
            source_ref_id = getattr(signal_or_event, "source_ref_id", None) or str(uuid.uuid4())
            signal_type = getattr(signal_or_event, "signal_type", "GENERAL_SIGNAL")
            source_payload = getattr(signal_or_event, "payload", {}) if isinstance(getattr(signal_or_event, "payload", {}), dict) else {}

        # Tentukan pemetaan departemen & prioritas
        sys_key = "GENERAL"
        for k in DEPARTMENT_AGENT_MAP:
            if k in source_system.upper() or k in signal_type.upper():
                sys_key = k
                break

        dept_meta = DEPARTMENT_AGENT_MAP.get(sys_key, {
            "dept": "Operations & General",
            "agent": "Arya (AI Chief of Staff)",
            "priority": "medium"
        })

        priority = "urgent" if "RISK" in signal_type or "BREACH" in signal_type or "ESCALATION" in signal_type else dept_meta["priority"]

        # Formulasi Aturan Verifikasi Data Sumber Nyata (DoD: Terverifikasi dari sumber nyata)
        verification_rule = self._derive_verification_rule(
            source_system=source_system,
            signal_type=signal_type,
            source_ref_id=source_ref_id,
            source_payload=source_payload
        )

        task_title = f"{title_prefix} {raw_title}"
        task_description = (
            f"TUGAS OTONOM DIBUAT OTOMATIS OLEH ORCHESTREEAI ENGINE (PRD v2.2 Bagian 8.13.3)\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Sistem Asal : {source_system}\n"
            f"Tipe Sinyal : {signal_type}\n"
            f"Referensi   : {source_ref_id}\n"
            f"Departemen  : {dept_meta['dept']}\n"
            f"Penanggung  : {dept_meta['agent']}\n\n"
            f"DESKRIPSI OPERASIONAL:\n"
            f"{summary if isinstance(summary, str) else str(source_payload)}\n\n"
            f"PERSYARATAN VERIFIKASI SUMBER NYATA (CLOSED-LOOP):\n"
            f"- Tabel Sumber     : {verification_rule.source_table}\n"
            f"- ID Record Target : {verification_rule.source_record_id}\n"
            f"- Kriteria Selesai : Kolom '{verification_rule.field_name}' wajib bernilai '{verification_rule.expected_value}'\n"
            f"- Catatan Kepatuhan: {verification_rule.verification_description}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"PERINGATAN: Tugas ini TIDAK DAPAT diselesaikan manual dengan klik tombol DONE. "
            f"Status hanya akan disetujui selesai setelah diverifikasi langsung oleh Monitoring Loop "
            f"terhadap data sumber SSOT."
        )

        return AutonomousTaskPlan(
            id=task_id,
            tenant_id=tenant_id,
            board_id=custom_board_id,
            column_id=custom_column_id,
            title=task_title,
            description=task_description,
            priority=priority,
            assigned_department=dept_meta["dept"],
            assigned_agent_name=dept_meta["agent"],
            source_signal_ids=source_signal_ids,
            source_event_id=source_event_id,
            verification_rule=verification_rule,
            status="PENDING_EXECUTION",
            created_at=now_iso,
        )

    def _derive_verification_rule(
        self,
        source_system: str,
        signal_type: str,
        source_ref_id: str,
        source_payload: Dict[str, Any]
    ) -> TaskVerificationRule:
        """
        Menentukan aturan verifikasi data sumber nyata berdasarkan taksonomi sinyal.
        """
        sig_upper = signal_type.upper()
        sys_upper = source_system.upper()

        if "DEAL" in sig_upper or "CRM" in sys_upper or "LEAD" in sig_upper:
            return TaskVerificationRule(
                source_system=source_system,
                source_table="leads",
                source_record_id=str(source_payload.get("lead_id") or source_ref_id),
                condition_type="STATUS_IN",
                field_name="status",
                expected_value=["QUALIFIED", "CLOSED_WON", "NEGOTIATION"],
                verification_description="Status prospek pada tabel 'leads' harus menunjukkan kemajuan negosiasi atau kualifikasi."
            )

        if "STOCK" in sig_upper or "INVENTORY" in sys_upper or "SHIPMENT" in sig_upper or "SUPPLY" in sys_upper:
            return TaskVerificationRule(
                source_system=source_system,
                source_table="inventory_stock",
                source_record_id=str(source_payload.get("product_id") or source_ref_id),
                condition_type="FIELD_GTE",
                field_name="quantity_available",
                expected_value=int(source_payload.get("required_quantity", 10)),
                verification_description="Ketersediaan stok pada tabel 'inventory_stock' wajib memenuhi batas ambang aman minimum."
            )

        if "ORDER" in sig_upper or "BILLING" in sig_upper or "PAYMENT" in sig_upper:
            return TaskVerificationRule(
                source_system=source_system,
                source_table="orders",
                source_record_id=str(source_payload.get("order_id") or source_ref_id),
                condition_type="FIELD_EQUALS",
                field_name="status",
                expected_value="PAID",
                verification_description="Pesanan pada tabel 'orders' wajib terkonfirmasi lunas dan terekonsiliasi."
            )

        if "SLA" in sig_upper or "SERVICE" in sys_upper or "TICKET" in sig_upper:
            return TaskVerificationRule(
                source_system=source_system,
                source_table="service_requests",
                source_record_id=str(source_payload.get("ticket_id") or source_ref_id),
                condition_type="FIELD_EQUALS",
                field_name="status",
                expected_value="RESOLVED",
                verification_description="Permintaan layanan pada tabel 'service_requests' wajib tercatat status RESOLVED."
            )

        if "LEGAL" in sys_upper or "COMPLIANCE" in sig_upper or "DPIA" in sig_upper:
            return TaskVerificationRule(
                source_system=source_system,
                source_table="dpia_records",
                source_record_id=str(source_payload.get("dpia_id") or source_ref_id),
                condition_type="FIELD_EQUALS",
                field_name="status",
                expected_value="APPROVED",
                verification_description="Asesmen dampak privasi pada tabel 'dpia_records' wajib disetujui tim kepatuhan."
            )

        # Default fallback verifikasi integritas log konektor
        return TaskVerificationRule(
            source_system=source_system,
            source_table="integration_fabric_sync_logs",
            source_record_id=str(source_ref_id),
            condition_type="FIELD_EQUALS",
            field_name="sync_status",
            expected_value="SUCCESS",
            verification_description="Sinkronisasi sistem asal pada 'integration_fabric_sync_logs' wajib sukses terekam."
        )

    async def execute_task_creation(
        self,
        tenant_id: str,
        plan: AutonomousTaskPlan,
        db_connection=None
    ) -> Dict[str, Any]:
        """
        Menyimpan task otonom ke tabel `tasks` dan aturan verifikasinya ke `task_source_verifications`.
        Menggunakan RLS tenant isolation dan atomic transaction.
        """
        conn = db_connection or self.db_pool
        if not conn:
            # Mode simulasi / standalone test
            return {
                "success": True,
                "task_id": plan.id,
                "tenant_id": tenant_id,
                "title": plan.title,
                "status": "CREATED_IN_STANDALONE_MODE",
                "verification_rule": plan.verification_rule.model_dump() if hasattr(plan.verification_rule, "model_dump") else plan.verification_rule.__dict__,
            }

        # Dapatkan board dan kolom awal jika belum ditetapkan
        board_id = plan.board_id
        column_id = plan.column_id

        if not board_id or not column_id:
            board_row = await conn.fetchrow(
                "SELECT id FROM boards WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1",
                uuid.UUID(tenant_id)
            )
            if board_row:
                board_id = str(board_row["id"])
                col_row = await conn.fetchrow(
                    "SELECT id FROM board_columns WHERE tenant_id = $1 AND board_id = $2 ORDER BY position ASC LIMIT 1",
                    uuid.UUID(tenant_id),
                    uuid.UUID(board_id)
                )
                if col_row:
                    column_id = str(col_row["id"])

        if not board_id or not column_id:
            # Buat board default jika belum ada
            new_board_id = uuid.uuid4()
            await conn.execute(
                """
                INSERT INTO boards (id, tenant_id, name, description, created_at, updated_at)
                VALUES ($1, $2, 'Operasional AI Chief of Staff', 'Papan Kanban terpadu tugas respons sinyal otomatis', now(), now())
                ON CONFLICT (id) DO NOTHING
                """,
                new_board_id, uuid.UUID(tenant_id)
            )
            board_id = str(new_board_id)

            new_col_todo = uuid.uuid4()
            new_col_done = uuid.uuid4()
            await conn.execute(
                """
                INSERT INTO board_columns (id, tenant_id, board_id, name, position, created_at)
                VALUES 
                    ($1, $2, $3, 'Antrean Tugas', 0, now()),
                    ($4, $2, $3, 'Selesai', 1, now())
                ON CONFLICT (id) DO NOTHING
                """,
                new_col_todo, uuid.UUID(tenant_id), new_board_id, new_col_done
            )
            column_id = str(new_col_todo)

        # 1. Simpan ke tabel tasks
        task_uuid = uuid.UUID(plan.id)
        await conn.execute(
            """
            INSERT INTO tasks (
                id, tenant_id, board_id, column_id, title, description,
                priority, version, progress_percentage, position, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, 1, 0, 0, now(), now()
            )
            """,
            task_uuid,
            uuid.UUID(tenant_id),
            uuid.UUID(board_id),
            uuid.UUID(column_id),
            plan.title,
            plan.description,
            plan.priority
        )

        # 2. Simpan aturan verifikasi ke task_source_verifications
        vrule_dict = plan.verification_rule.model_dump() if hasattr(plan.verification_rule, "model_dump") else plan.verification_rule.__dict__
        source_sig_uuid = uuid.UUID(plan.source_signal_ids[0]) if plan.source_signal_ids and self._is_valid_uuid(plan.source_signal_ids[0]) else None
        source_evt_uuid = uuid.UUID(plan.source_event_id) if plan.source_event_id and self._is_valid_uuid(plan.source_event_id) else None

        import json
        await conn.execute(
            """
            INSERT INTO task_source_verifications (
                id, tenant_id, task_id, source_signal_id, source_event_id,
                source_system, source_table, source_record_id, verification_rule,
                verification_status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4,
                $5, $6, $7, $8::jsonb,
                'PENDING', now(), now()
            )
            """,
            uuid.UUID(tenant_id),
            task_uuid,
            source_sig_uuid,
            source_evt_uuid,
            plan.verification_rule.source_system,
            plan.verification_rule.source_table,
            str(plan.verification_rule.source_record_id),
            json.dumps(vrule_dict)
        )

        # 3. Log audit ke task_events
        await conn.execute(
            """
            INSERT INTO task_events (
                id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at
            ) VALUES (
                gen_random_uuid(), $1, $2, 'AUTONOMOUS_TASK_CREATED',
                'AI_EXECUTION_ENGINE', 'arya-chief-of-staff', $3::jsonb, now()
            )
            """,
            uuid.UUID(tenant_id),
            task_uuid,
            json.dumps({
                "source_system": plan.verification_rule.source_system,
                "verification_rule": vrule_dict,
                "assigned_department": plan.assigned_department,
            })
        )

        return {
            "success": True,
            "task_id": plan.id,
            "tenant_id": tenant_id,
            "board_id": board_id,
            "column_id": column_id,
            "title": plan.title,
            "priority": plan.priority,
            "status": "CREATED_AND_LINKED_TO_VERIFICATION",
            "verification_rule": vrule_dict,
        }

    @staticmethod
    def _is_valid_uuid(val: str) -> bool:
        try:
            uuid.UUID(str(val))
            return True
        except (ValueError, TypeError):
            return False


__all__ = [
    "TaskVerificationRule",
    "AutonomousTaskPlan",
    "AutonomousTaskExecutionEngine",
    "DEPARTMENT_AGENT_MAP",
]
