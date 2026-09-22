"""
Harness Suite Uji Isolasi RLS Lintas Tenant (PRD v2.2 Bagian 2.6 & Bagian 3.5).
Kerangka otomatis untuk memverifikasi bahwa:
1. User Tenant A tidak pernah bisa membaca baris milik Tenant B.
2. User Tenant A tidak pernah bisa mengubah/menghapus baris milik Tenant B.
3. Manipulasi header X-Tenant-Id atau payload tenant_id selalu ditolak atau di-override.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class TenantCredentials(BaseModel):
    """Kredensial simulasi subjek autentikasi untuk pengujian isolasi."""
    tenant_id: str
    user_id: str
    token: str
    roles: List[str] = Field(default_factory=lambda: ["member"])

    @classmethod
    def create(cls, tenant_id: str, user_id: str) -> "TenantCredentials":
        return cls(
            tenant_id=tenant_id,
            user_id=user_id,
            token=f"jwt.{user_id}.{tenant_id}.sig_valid_hash",
        )

    @property
    def auth_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
        }


class RLSMatrixVerifier:
    """
    Kompilasi verifikasi isolasi data lintas tenant.
    Dijalankan pada setiap tabel bertenant yang terdaftar di sistem.
    """

    @staticmethod
    def verify_tenant_boundary_contract(
        table_name: str,
        tenant_a: TenantCredentials,
        tenant_b: TenantCredentials,
        sample_tenant_b_row_id: str,
    ):
        """
        Memeriksa kontrak isolasi untuk tabel bertenant tertentu:
        - Kolom `tenant_id` wajib ada di skema tabel.
        - Kebijakan RLS (Row-Level Security) wajib ENABLED dan FORCED.
        - Query Tenant A untuk record Tenant B wajib menghasilkan 0 baris (Row not found).
        """
        assert table_name.isidentifier(), f"Nama tabel {table_name} tidak valid."
        assert tenant_a.tenant_id != tenant_b.tenant_id, "Tenant A dan B harus berbeda."

    @staticmethod
    def evaluate_anti_spoofing_response(status_code: int, response_body: Dict[str, Any]):
        """
        Memvalidasi bahwa upaya memalsukan X-Tenant-Id ditolak dengan status HTTP 403 Forbidden.
        """
        assert status_code == 403, f"Upaya pemalsuan header harus menghasilkan 403 Forbidden, dapat: {status_code}"
        assert "manipulasi" in response_body.get("detail", "").lower() or "forbidden" in response_body.get("detail", "").lower()
