"""
OrchestreeAI Data Quality Management Engine
PRD v2.2 Bagian 8.12 & 8.13.5

Menegakkan:
1. Konflik antar sumber data eksternal DITANDAI dan TIDAK PERNAH dipilih otomatis oleh AI.
2. Resolusi konflik HANYA dapat dilakukan oleh operator manusia (Human-in-the-Loop).
3. Pencatatan dan audit isu kualitas data (stale data, incomplete, conflicting sources, false claims).
"""

import json
import uuid
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict

try:
    from pydantic import BaseModel, Field
    HAS_PYDANTIC = True
except ImportError:
    HAS_PYDANTIC = False

from orchestree.domains.intelligence.confidence import (
    DataAvailabilityState,
    IntelligenceConfidenceEngine,
    OutputValidationResult,
)

logger = logging.getLogger("orchestree.domains.intelligence.data_quality")


@dataclass
class DataQualityIssueCreate:
    tenant_id: str
    entity_type: str
    entity_id: str
    field_name: str
    issue_type: str  # 'CONFLICTING_SOURCES' | 'STALE_DATA' | 'PARTIAL_DATA' | 'FALSE_AVAILABILITY_CLAIM'
    availability_state: DataAvailabilityState
    severity: str = "MEDIUM"  # 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    confidence_score: float = 0.0
    sources_involved: List[Dict[str, Any]] = field(default_factory=list)
    conflict_details: Dict[str, Any] = field(default_factory=dict)
    requires_human_resolution: bool = True
    ai_auto_selection_prevented: bool = True

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class HumanResolutionInput:
    resolved_by: str
    chosen_source: str
    resolution_notes: Optional[str] = None
    reconciled_value: Optional[Any] = None

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


class DataQualityEngine:
    """
    Engine untuk mendeteksi, mencatat, dan memfasilitasi resolusi isu kualitas data.
    """

    @classmethod
    async def record_data_quality_issue(
        cls,
        db_conn: Any,
        payload: DataQualityIssueCreate,
    ) -> Dict[str, Any]:
        """
        Mencatat isu kualitas data ke database Postgres.
        PENEGAKAN MUTLAK: ai_auto_selection_prevented = True untuk isu konflik.
        """
        issue_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        # Selalu pastikan AI dilarang memilih sendiri jika terjadi konflik
        auto_prevented = True if payload.issue_type == "CONFLICTING_SOURCES" else payload.ai_auto_selection_prevented

        query = """
            INSERT INTO data_quality_issues (
                id, tenant_id, entity_type, entity_id, field_name,
                issue_type, severity, availability_state, confidence_score,
                sources_involved, conflict_details, ai_auto_selection_prevented,
                requires_human_resolution, resolution_status, created_at, updated_at
            ) VALUES (
                $1::uuid, $2::uuid, $3, $4, $5,
                $6, $7, $8, $9,
                $10::jsonb, $11::jsonb, $12,
                $13, 'UNRESOLVED', $14, $14
            )
            RETURNING *;
        """

        row = await db_conn.fetchrow(
            query,
            uuid.UUID(issue_id),
            uuid.UUID(payload.tenant_id),
            payload.entity_type,
            payload.entity_id,
            payload.field_name,
            payload.issue_type,
            payload.severity,
            payload.availability_state.value,
            payload.confidence_score,
            json.dumps(payload.sources_involved),
            json.dumps(payload.conflict_details),
            auto_prevented,
            payload.requires_human_resolution,
            now,
        )

        return dict(row)

    @classmethod
    async def resolve_issue_by_human(
        cls,
        db_conn: Any,
        tenant_id: str,
        issue_id: str,
        resolution: HumanResolutionInput,
    ) -> Dict[str, Any]:
        """
        Menyimpan resolusi manusia atas konflik data sumber eksternal.
        AI tidak pernah memilih secara sepihak; pengesahan murni berasal dari manusia.
        """
        now = datetime.now(timezone.utc)
        query = """
            UPDATE data_quality_issues
            SET resolution_status = 'HUMAN_RESOLVED',
                resolved_by = $1,
                resolved_at = $2,
                resolution_source_chosen = $3,
                resolution_notes = $4,
                updated_at = $2
            WHERE id = $5::uuid AND tenant_id = $6::uuid
            RETURNING *;
        """

        row = await db_conn.fetchrow(
            query,
            resolution.resolved_by,
            now,
            resolution.chosen_source,
            resolution.resolution_notes or "Diselesaikan secara manual oleh operator manusia.",
            uuid.UUID(issue_id),
            uuid.UUID(tenant_id),
        )

        if not row:
            raise ValueError(f"Isu kualitas data dengan ID '{issue_id}' tidak ditemukan untuk tenant ini.")

        return dict(row)

    @classmethod
    async def list_issues(
        cls,
        db_conn: Any,
        tenant_id: str,
        status: Optional[str] = None,
        issue_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Mengambil daftar isu kualitas data untuk tenant tertentu."""
        base_query = """
            SELECT * FROM data_quality_issues
            WHERE tenant_id = $1::uuid
        """
        params = [uuid.UUID(tenant_id)]

        if status:
            params.append(status)
            base_query += f" AND resolution_status = ${len(params)}"

        if issue_type:
            params.append(issue_type)
            base_query += f" AND issue_type = ${len(params)}"

        base_query += " ORDER BY created_at DESC LIMIT " + str(limit)

        rows = await db_conn.fetch(base_query, *params)
        return [dict(r) for r in rows]

    @classmethod
    async def get_quality_summary(
        cls,
        db_conn: Any,
        tenant_id: str,
    ) -> Dict[str, Any]:
        """Menghasilkan ringkasan agregat kualitas dan ketersediaan data untuk tenant."""
        t_uuid = uuid.UUID(tenant_id)
        
        # 1. Total unresolved issues
        unresolved_count_row = await db_conn.fetchrow(
            "SELECT COUNT(*) as count FROM data_quality_issues WHERE tenant_id = $1 AND resolution_status = 'UNRESOLVED';",
            t_uuid,
        )
        unresolved_count = int(unresolved_count_row["count"]) if unresolved_count_row else 0

        # 2. Issues by type
        by_type_rows = await db_conn.fetch(
            """
            SELECT issue_type, COUNT(*) as count
            FROM data_quality_issues
            WHERE tenant_id = $1
            GROUP BY issue_type;
            """,
            t_uuid,
        )
        type_counts = {r["issue_type"]: int(r["count"]) for r in by_type_rows}

        # 3. Issues by availability state
        by_state_rows = await db_conn.fetch(
            """
            SELECT availability_state, COUNT(*) as count
            FROM data_quality_issues
            WHERE tenant_id = $1
            GROUP BY availability_state;
            """,
            t_uuid,
        )
        state_counts = {r["availability_state"]: int(r["count"]) for r in by_state_rows}

        return {
            "tenant_id": tenant_id,
            "total_unresolved_issues": unresolved_count,
            "issues_by_type": type_counts,
            "availability_state_distribution": state_counts,
            "ai_auto_selection_strictly_disabled": True,
            "human_in_the_loop_enforced": True,
        }
