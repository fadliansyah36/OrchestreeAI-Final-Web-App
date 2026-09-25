"""
OrchestreeAI Workforce Closed-Loop Task Monitoring & Source Data Verification Engine (PRD v2.2 Bagian 8.13.4, 6.2, 18.1)
Python 3.12 + FastAPI + Supabase Postgres

Tugas:
1. Memantau siklus hidup task yang dihasilkan dari sinyal terdeteksi (closed-loop).
2. Memverifikasi penyelesaian task LANGSUNG DARI DATA SUMBER NYATA (SSOT), bukan sekadar diklik manual "selesai".
3. Mencegah / menolak klaim selesai palsu (anti-tamper / Definition of Done).
4. Menyimpan bukti verifikasi deterministik (verification_proof) dan memancarkan event Supabase Realtime.
"""

from typing import List, Dict, Any, Optional, Tuple, Union
import uuid
import datetime
import logging
import json

from app.domains.enterprise.contracts import TaskVerificationRule

try:
    from pydantic import BaseModel, Field

    class SourceVerificationResult(BaseModel):
        """Hasil verifikasi penyelesaian task terhadap data sumber nyata."""
        task_id: str
        tenant_id: str
        is_verified: bool
        status: str  # VERIFIED_DONE, REJECTED_UNVERIFIED, PENDING
        source_system: str
        source_table: str
        source_record_id: str
        field_name: str
        observed_value: Any
        expected_value: Any
        verification_proof: Dict[str, Any] = Field(default_factory=dict)
        rejection_reason: Optional[str] = None
        explanation: str
        verified_at: Optional[str] = None

    class MonitoringCycleSummary(BaseModel):
        """Ringkasan satu putaran siklus monitoring loop otonom."""
        tenant_id: str
        total_tasks_scanned: int
        verified_completed: int
        rejected_or_unverified: int
        tasks_in_progress: int
        results: List[SourceVerificationResult] = Field(default_factory=list)
        cycle_timestamp: str

except ImportError:
    from dataclasses import dataclass, field

    @dataclass
    class SourceVerificationResult:
        task_id: str
        tenant_id: str
        is_verified: bool
        status: str
        source_system: str
        source_table: str
        source_record_id: str
        field_name: str
        observed_value: Any
        expected_value: Any
        explanation: str
        verification_proof: Dict[str, Any] = field(default_factory=dict)
        rejection_reason: Optional[str] = None
        verified_at: Optional[str] = None

        def model_dump(self) -> Dict[str, Any]:
            return {
                "task_id": self.task_id,
                "tenant_id": self.tenant_id,
                "is_verified": self.is_verified,
                "status": self.status,
                "source_system": self.source_system,
                "source_table": self.source_table,
                "source_record_id": self.source_record_id,
                "field_name": self.field_name,
                "observed_value": self.observed_value,
                "expected_value": self.expected_value,
                "verification_proof": self.verification_proof,
                "rejection_reason": self.rejection_reason,
                "explanation": self.explanation,
                "verified_at": self.verified_at,
            }

    @dataclass
    class MonitoringCycleSummary:
        tenant_id: str
        total_tasks_scanned: int
        verified_completed: int
        rejected_or_unverified: int
        tasks_in_progress: int
        results: List[SourceVerificationResult] = field(default_factory=list)
        cycle_timestamp: str = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

        def model_dump(self) -> Dict[str, Any]:
            return {
                "tenant_id": self.tenant_id,
                "total_tasks_scanned": self.total_tasks_scanned,
                "verified_completed": self.verified_completed,
                "rejected_or_unverified": self.rejected_or_unverified,
                "tasks_in_progress": self.tasks_in_progress,
                "results": [r.model_dump() if hasattr(r, "model_dump") else r.__dict__ for r in self.results],
                "cycle_timestamp": self.cycle_timestamp,
            }

logger = logging.getLogger(__name__)


class SourceVerificationFailedError(Exception):
    """Exception yang dilemparkan saat upaya penyelesaian task ditolak karena kriteria sumber tidak terpenuhi."""
    def __init__(self, message: str, result: SourceVerificationResult):
        super().__init__(message)
        self.result = result


class WorkforceClosedLoopMonitoringEngine:
    """
    Closed-Loop Monitoring Engine (PRD v2.2 Bagian 8.13.4).
    Memverifikasi penyelesaian task dari data sumber nyata, mencegah manipulasi manual tanpa bukti.
    """

    def __init__(self, db_pool=None):
        self.db_pool = db_pool

    def evaluate_condition(
        self,
        condition_type: str,
        observed_value: Any,
        expected_value: Any
    ) -> bool:
        """
        Mengevaluasi apakah nilai data nyata dari sumber memenuhi kriteria verifikasi.
        """
        if observed_value is None:
            return False

        cond = (condition_type or "FIELD_EQUALS").upper()

        if cond == "FIELD_EQUALS":
            if isinstance(expected_value, str) and isinstance(observed_value, str):
                return observed_value.strip().upper() == expected_value.strip().upper()
            return observed_value == expected_value

        elif cond == "STATUS_IN":
            if isinstance(expected_value, list):
                exp_set = {str(x).strip().upper() for x in expected_value}
                return str(observed_value).strip().upper() in exp_set
            elif isinstance(expected_value, str):
                return str(observed_value).strip().upper() == expected_value.strip().upper()
            return False

        elif cond == "FIELD_GTE":
            try:
                return float(observed_value) >= float(expected_value)
            except (ValueError, TypeError):
                return False

        elif cond == "FIELD_LTE":
            try:
                return float(observed_value) <= float(expected_value)
            except (ValueError, TypeError):
                return False

        elif cond == "RECORD_EXISTS":
            return observed_value is not None

        return False

    async def verify_task_against_source(
        self,
        tenant_id: str,
        task_id: str,
        db_connection=None,
        simulated_source_record: Optional[Dict[str, Any]] = None,
    ) -> SourceVerificationResult:
        """
        Memeriksa data sumber nyata untuk menentukan apakah tugas benar-benar selesai.
        Jika data sumber membuktikan selesai -> status VERIFIED_DONE, task dipindahkan ke 'Selesai'.
        Jika data sumber belum selesai -> status REJECTED_UNVERIFIED, penyelesaian ditolak.
        """
        conn = db_connection or self.db_pool

        # Ambil aturan verifikasi dari database jika koneksi tersedia
        rule_data = None
        source_record = simulated_source_record

        if conn:
            row = await conn.fetchrow(
                """
                SELECT id, source_system, source_table, source_record_id, verification_rule, verification_status
                FROM task_source_verifications
                WHERE tenant_id = $1 AND task_id = $2
                ORDER BY created_at DESC LIMIT 1
                """,
                uuid.UUID(tenant_id),
                uuid.UUID(task_id)
            )
            if row:
                v_rule = row["verification_rule"]
                if isinstance(v_rule, str):
                    v_rule = json.loads(v_rule)
                rule_data = {
                    "source_system": row["source_system"],
                    "source_table": row["source_table"],
                    "source_record_id": row["source_record_id"],
                    "condition_type": v_rule.get("condition_type", "FIELD_EQUALS"),
                    "field_name": v_rule.get("field_name", "status"),
                    "expected_value": v_rule.get("expected_value"),
                    "verification_description": v_rule.get("verification_description", ""),
                }

        # Jika rule tidak ditemukan di DB dan tidak ada simulasi
        if not rule_data:
            if simulated_source_record and "_rule" in simulated_source_record:
                rule_data = simulated_source_record["_rule"]
            else:
                return SourceVerificationResult(
                    task_id=task_id,
                    tenant_id=tenant_id,
                    is_verified=False,
                    status="REJECTED_UNVERIFIED",
                    source_system="UNKNOWN",
                    source_table="UNKNOWN",
                    source_record_id="UNKNOWN",
                    field_name="status",
                    observed_value=None,
                    expected_value=None,
                    rejection_reason="Tidak ditemukan aturan verifikasi data sumber nyata untuk task ini.",
                    explanation="Penolakan Penyelesaian: Tugas dari sinyal otonom wajib memiliki aturan verifikasi sumber.",
                )

        source_table = rule_data["source_table"]
        source_record_id = rule_data["source_record_id"]
        field_name = rule_data["field_name"]
        expected_value = rule_data["expected_value"]
        condition_type = rule_data["condition_type"]

        # Ambil data sumber nyata dari tabel Postgres jika koneksi tersedia
        if conn and source_record is None:
            # Cegah SQL Injection: pastikan nama tabel aman
            allowed_tables = {
                "leads", "orders", "inventory_stock", "service_requests",
                "dpia_records", "integration_fabric_sync_logs", "shipments",
                "attendance_records", "customer_funnel_state"
            }
            if source_table not in allowed_tables:
                # Query tabel secara aman dengan whitelist nama tabel
                source_table_safe = "integration_fabric_sync_logs"
            else:
                source_table_safe = source_table

            # Query record nyata
            try:
                rec_row = await conn.fetchrow(
                    f"""
                    SELECT * FROM {source_table_safe}
                    WHERE tenant_id = $1 AND (
                        id::text = $2 OR 
                        source_ref_id = $2 OR 
                        customer_id::text = $2
                    )
                    LIMIT 1
                    """,
                    uuid.UUID(tenant_id),
                    str(source_record_id)
                )
                if rec_row:
                    source_record = dict(rec_row)
            except Exception as exc:
                logger.warning("Gagal membaca tabel sumber %s: %s", source_table_safe, exc)
                source_record = None

        observed_value = source_record.get(field_name) if source_record else None

        # Evaluasi kriteria verifikasi data nyata
        is_verified = self.evaluate_condition(
            condition_type=condition_type,
            observed_value=observed_value,
            expected_value=expected_value
        )

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        if is_verified:
            # DoD: Penyelesaian TERVERIFIKASI dari data sumber nyata
            proof = {
                "source_system": rule_data["source_system"],
                "source_table": source_table,
                "source_record_id": source_record_id,
                "verified_field": field_name,
                "observed_value": observed_value,
                "expected_value": expected_value,
                "condition_type": condition_type,
                "verified_at": now_iso,
                "audit_verdict": "VERIFIED_GENUINE_SOURCE_DATA",
                "source_snapshot": {k: str(v) for k, v in (source_record or {}).items() if k not in ("password", "secret")},
            }

            if conn:
                # 1. Update task_source_verifications menjadi VERIFIED_DONE
                await conn.execute(
                    """
                    UPDATE task_source_verifications
                    SET verification_status = 'VERIFIED_DONE',
                        verified_at = now(),
                        last_checked_at = now(),
                        verification_proof = $1::jsonb,
                        rejection_reason = NULL,
                        updated_at = now()
                    WHERE tenant_id = $2 AND task_id = $3
                    """,
                    json.dumps(proof),
                    uuid.UUID(tenant_id),
                    uuid.UUID(task_id)
                )

                # 2. Pindahkan task ke kolom 'Selesai' di Kanban
                col_done_row = await conn.fetchrow(
                    """
                    SELECT c.id FROM board_columns c
                    JOIN tasks t ON t.board_id = c.board_id
                    WHERE t.id = $1 AND c.tenant_id = $2
                      AND (c.name ILIKE '%selesai%' OR c.name ILIKE '%done%')
                    ORDER BY c.position DESC LIMIT 1
                    """,
                    uuid.UUID(task_id),
                    uuid.UUID(tenant_id)
                )
                done_col_id = col_done_row["id"] if col_done_row else None

                if done_col_id:
                    await conn.execute(
                        """
                        UPDATE tasks
                        SET column_id = $1,
                            progress_percentage = 100,
                            version = version + 1,
                            updated_at = now()
                        WHERE id = $2 AND tenant_id = $3
                        """,
                        done_col_id,
                        uuid.UUID(task_id),
                        uuid.UUID(tenant_id)
                    )

                # 3. Rekam audit event
                await conn.execute(
                    """
                    INSERT INTO task_events (
                        id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at
                    ) VALUES (
                        gen_random_uuid(), $1, $2, 'SOURCE_VERIFIED_COMPLETION',
                        'AI_MONITORING_LOOP', 'workforce-verifier', $3::jsonb, now()
                    )
                    """,
                    uuid.UUID(tenant_id),
                    uuid.UUID(task_id),
                    json.dumps(proof)
                )

            return SourceVerificationResult(
                task_id=task_id,
                tenant_id=tenant_id,
                is_verified=True,
                status="VERIFIED_DONE",
                source_system=rule_data["source_system"],
                source_table=source_table,
                source_record_id=source_record_id,
                field_name=field_name,
                observed_value=observed_value,
                expected_value=expected_value,
                verification_proof=proof,
                verified_at=now_iso,
                explanation=(
                    f"Penyelesaian Terverifikasi: Data nyata pada tabel '{source_table}' "
                    f"kolom '{field_name}' bernilai '{observed_value}', "
                    f"memenuhi bukti selesai '{expected_value}'."
                ),
            )

        else:
            # DoD: TOLAK manual completion tanpa bukti dari data sumber nyata
            rejection_reason = (
                f"Klaim selesai ditolak: Data sumber nyata pada tabel '{source_table}' "
                f"kolom '{field_name}' bernilai '{observed_value}', "
                f"belum memenuhi syarat selesai '{expected_value}'. "
                f"Penyelesaian tidak dapat dimanipulasi dengan klik tombol DONE manual."
            )

            if conn:
                # 1. Update status menjadi REJECTED_UNVERIFIED
                await conn.execute(
                    """
                    UPDATE task_source_verifications
                    SET verification_status = 'REJECTED_UNVERIFIED',
                        last_checked_at = now(),
                        rejection_reason = $1,
                        updated_at = now()
                    WHERE tenant_id = $2 AND task_id = $3
                    """,
                    rejection_reason,
                    uuid.UUID(tenant_id),
                    uuid.UUID(task_id)
                )

                # 2. Kembalikan task dari kolom Done jika sebelumnya coba digeser manual
                col_todo_row = await conn.fetchrow(
                    """
                    SELECT c.id FROM board_columns c
                    JOIN tasks t ON t.board_id = c.board_id
                    WHERE t.id = $1 AND c.tenant_id = $2
                      AND (c.name ILIKE '%sedang%' OR c.name ILIKE '%progress%' OR c.name ILIKE '%antrean%' OR c.name ILIKE '%to do%')
                    ORDER BY c.position ASC LIMIT 1
                    """,
                    uuid.UUID(task_id),
                    uuid.UUID(tenant_id)
                )
                if col_todo_row:
                    await conn.execute(
                        """
                        UPDATE tasks
                        SET column_id = $1,
                            progress_percentage = CASE WHEN progress_percentage >= 100 THEN 50 ELSE progress_percentage END,
                            version = version + 1,
                            updated_at = now()
                        WHERE id = $2 AND tenant_id = $3
                        """,
                        col_todo_row["id"],
                        uuid.UUID(task_id),
                        uuid.UUID(tenant_id)
                    )

                # 3. Log audit penolakan
                await conn.execute(
                    """
                    INSERT INTO task_events (
                        id, tenant_id, task_id, event_type, actor_type, actor_id, payload, created_at
                    ) VALUES (
                        gen_random_uuid(), $1, $2, 'COMPLETION_REJECTED_UNVERIFIED',
                        'AI_MONITORING_LOOP', 'workforce-verifier', $3::jsonb, now()
                    )
                    """,
                    uuid.UUID(tenant_id),
                    uuid.UUID(task_id),
                    json.dumps({
                        "observed_value": observed_value,
                        "expected_value": expected_value,
                        "reason": rejection_reason,
                    })
                )

            return SourceVerificationResult(
                task_id=task_id,
                tenant_id=tenant_id,
                is_verified=False,
                status="REJECTED_UNVERIFIED",
                source_system=rule_data["source_system"],
                source_table=source_table,
                source_record_id=source_record_id,
                field_name=field_name,
                observed_value=observed_value,
                expected_value=expected_value,
                rejection_reason=rejection_reason,
                explanation=rejection_reason,
            )

    async def intercept_manual_completion_attempt(
        self,
        tenant_id: str,
        task_id: str,
        requested_by: str = "user",
        db_connection=None,
        simulated_source_record: Optional[Dict[str, Any]] = None,
    ) -> SourceVerificationResult:
        """
        Mencegat aksi klik 'DONE' manual dari pengguna atau UI.
        Hanya mengizinkan penyelesaian jika data sumber nyata telah memvalidasi kriteria.
        """
        res = await self.verify_task_against_source(
            tenant_id=tenant_id,
            task_id=task_id,
            db_connection=db_connection,
            simulated_source_record=simulated_source_record
        )

        if not res.is_verified:
            logger.warning(
                "Upaya penyelesaian manual task %s oleh %s DITOLAK: %s",
                task_id, requested_by, res.rejection_reason
            )
            # Menolak penyelesaian
            return res

        logger.info("Penyelesaian task %s DITERIMA berdasarkan bukti sumber nyata.", task_id)
        return res

    async def run_closed_loop_monitoring_cycle(
        self,
        tenant_id: str,
        limit: int = 50,
        db_connection=None,
    ) -> MonitoringCycleSummary:
        """
        Menjalankan satu putaran siklus monitoring loop otonom untuk seluruh task aktif bertenant.
        Memeriksa data sumber secara otomatis tanpa intervensi klik manual manusia.
        """
        conn = db_connection or self.db_pool
        results = []
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        if not conn:
            return MonitoringCycleSummary(
                tenant_id=tenant_id,
                total_tasks_scanned=0,
                verified_completed=0,
                rejected_or_unverified=0,
                tasks_in_progress=0,
                results=[],
                cycle_timestamp=now_iso,
            )

        # Cari semua task yang memiliki verifikasi aktif dan belum selesai
        active_tasks = await conn.fetch(
            """
            SELECT task_id FROM task_source_verifications
            WHERE tenant_id = $1 AND verification_status IN ('PENDING', 'IN_PROGRESS', 'REJECTED_UNVERIFIED')
            ORDER BY created_at ASC
            LIMIT $2
            """,
            uuid.UUID(tenant_id),
            limit
        )

        verified_cnt = 0
        unverified_cnt = 0

        for r in active_tasks:
            t_id = str(r["task_id"])
            verif_res = await self.verify_task_against_source(
                tenant_id=tenant_id,
                task_id=t_id,
                db_connection=conn
            )
            results.append(verif_res)
            if verif_res.is_verified:
                verified_cnt += 1
            else:
                unverified_cnt += 1

        return MonitoringCycleSummary(
            tenant_id=tenant_id,
            total_tasks_scanned=len(active_tasks),
            verified_completed=verified_cnt,
            rejected_or_unverified=unverified_cnt,
            tasks_in_progress=unverified_cnt,
            results=results,
            cycle_timestamp=now_iso,
        )


__all__ = [
    "SourceVerificationResult",
    "MonitoringCycleSummary",
    "SourceVerificationFailedError",
    "WorkforceClosedLoopMonitoringEngine",
]
