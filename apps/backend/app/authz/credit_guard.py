"""
Modul Penjaga Anggaran Departemen (Credit Guard — PRD v2.2 Bagian 3.5 & 14.2)
Memverifikasi batas plafon kredit anggaran per departemen (department credit_cap)
sebelum eksekusi aksi atau pemanggilan AI Agent Workforce yang memakan kredit.
"""

from decimal import Decimal
import logging
from typing import Any, Dict, Optional, Union
import uuid
from pydantic import BaseModel, Field
import sqlalchemy as sa
from app.core.database import get_database_engine

logger = logging.getLogger("orchestree.credit_guard")


class DepartmentBudgetDecision(BaseModel):
    is_allowed: bool
    decision: str  # "ALLOW" | "DENY_DEPARTMENT_BUDGET_CAP" | "DENY_DEPARTMENT_NOT_FOUND"
    reason: str
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    credit_cap: Optional[Decimal] = None
    credit_spent: Optional[Decimal] = None
    estimated_cost: Decimal = Decimal("0.0000")
    metadata: Dict[str, Any] = Field(default_factory=dict)


def check_department_cap(
    tenant_id: str,
    department_id: str,
    estimated_cost: Union[Decimal, float, int] = Decimal("0.0000"),
    engine: Optional[sa.engine.Engine] = None,
) -> DepartmentBudgetDecision:
    """
    Memeriksa apakah departemen telah melampaui plafon kredit anggaran (PRD v2.2 Bagian 3.5 & 14.2).
    - Jika department_id tidak ada atau credit_cap bernilai NULL: Tidak ada batasan plafon (ALLOW).
    - Jika credit_cap disetel dan (credit_spent + estimated_cost) > credit_cap: Wajib tolak dengan DENY_DEPARTMENT_BUDGET_CAP.
    """
    if not tenant_id or not department_id:
        return DepartmentBudgetDecision(
            is_allowed=True,
            decision="ALLOW",
            reason="Pemeriksaan anggaran departemen dilewati (tanpa ID departemen).",
        )

    est_cost = Decimal(str(estimated_cost)) if not isinstance(estimated_cost, Decimal) else estimated_cost

    try:
        eng = engine or get_database_engine()
        with eng.connect() as conn:
            # Query status plafon departemen
            query = sa.text("""
                SELECT id, name, credit_cap, credit_spent
                FROM departments
                WHERE tenant_id = :tenant_id AND id = :dept_id AND deleted_at IS NULL
                LIMIT 1;
            """)
            row = conn.execute(query, {
                "tenant_id": str(uuid.UUID(str(tenant_id))),
                "dept_id": str(uuid.UUID(str(department_id))),
            }).fetchone()

            if not row:
                return DepartmentBudgetDecision(
                    is_allowed=False,
                    decision="DENY_DEPARTMENT_NOT_FOUND",
                    reason=f"Departemen '{department_id}' tidak ditemukan atau telah dihapus.",
                    department_id=str(department_id),
                )

            dept_id_val, dept_name, credit_cap, credit_spent = row[0], row[1], row[2], row[3]
            credit_spent_dec = Decimal(str(credit_spent or 0))

            if credit_cap is None:
                # Plafon tidak dibatasi
                return DepartmentBudgetDecision(
                    is_allowed=True,
                    decision="ALLOW",
                    reason=f"Departemen '{dept_name}' tidak memiliki batas plafon kredit anggaran (unlimited).",
                    department_id=str(dept_id_val),
                    department_name=dept_name,
                    credit_cap=None,
                    credit_spent=credit_spent_dec,
                    estimated_cost=est_cost,
                )

            credit_cap_dec = Decimal(str(credit_cap))
            total_after = credit_spent_dec + est_cost

            if total_after > credit_cap_dec or credit_spent_dec >= credit_cap_dec:
                logger.warning(
                    f"Department budget cap exceeded for '{dept_name}' ({dept_id_val}): "
                    f"Spent={credit_spent_dec} + Est={est_cost} > Cap={credit_cap_dec}"
                )
                return DepartmentBudgetDecision(
                    is_allowed=False,
                    decision="DENY_DEPARTMENT_BUDGET_CAP",
                    reason=(
                        f"Plafon anggaran kredit departemen '{dept_name}' telah terlampaui "
                        f"(Terpakai: {credit_spent_dec:.2f} + Estimasi: {est_cost:.2f} > Batas: {credit_cap_dec:.2f})."
                    ),
                    department_id=str(dept_id_val),
                    department_name=dept_name,
                    credit_cap=credit_cap_dec,
                    credit_spent=credit_spent_dec,
                    estimated_cost=est_cost,
                )

            return DepartmentBudgetDecision(
                is_allowed=True,
                decision="ALLOW",
                reason=f"Penggunaan kredit departemen '{dept_name}' berada di dalam batas plafon anggaran.",
                department_id=str(dept_id_val),
                department_name=dept_name,
                credit_cap=credit_cap_dec,
                credit_spent=credit_spent_dec,
                estimated_cost=est_cost,
            )

    except Exception as e:
        logger.error(f"Error checking department cap: {e}")
        # Jika database error saat validasi budget, fail-closed jika dalam mode ketat
        return DepartmentBudgetDecision(
            is_allowed=False,
            decision="DENY_DEPARTMENT_BUDGET_CAP",
            reason=f"Gagal memvalidasi plafon anggaran departemen: {str(e)}",
            department_id=str(department_id),
            estimated_cost=est_cost,
        )
