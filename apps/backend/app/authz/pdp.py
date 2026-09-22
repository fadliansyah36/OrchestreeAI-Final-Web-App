"""
Unified Policy Decision Point (PDP) — PRD v2.2 Bagian 3.5.
Gerbang tunggal otorisasi sistem untuk seluruh aksi, tool, dan resource.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SubjectContext(BaseModel):
    user_id: str
    tenant_id: str
    roles: List[str] = Field(default_factory=list)
    capabilities: List[str] = Field(default_factory=list)
    is_mfa_verified: bool = False


class ResourceContext(BaseModel):
    resource_type: str
    resource_id: Optional[str] = None
    owner_tenant_id: str
    attributes: Dict[str, Any] = Field(default_factory=dict)


class AuthorizationDecision(BaseModel):
    is_authorized: bool
    decision: str  # "allow" | "deny"
    reason: str
    audit_metadata: Dict[str, Any] = Field(default_factory=dict)


def authorize(
    subject: SubjectContext,
    action: str,
    resource: ResourceContext,
    context: Optional[Dict[str, Any]] = None
) -> AuthorizationDecision:
    """
    Evaluasi kebijakan terpadu (Unified Policy Decision Point).
    Aturan dasar isolasi:
    1. Tenant Isolation: Subjek dari tenant A tidak boleh mengakses resource milik tenant B.
    2. Capability Check: Subjek wajib memiliki kapabilitas atau peran yang sesuai.
    """
    context = context or {}

    # 1. Aturan Mutlak: Isolasi Tenant
    if subject.tenant_id != resource.owner_tenant_id:
        return AuthorizationDecision(
            is_authorized=False,
            decision="deny",
            reason=f"Pelanggaran batas tenant: subjek tenant '{subject.tenant_id}' mencoba mengakses resource milik tenant '{resource.owner_tenant_id}'."
        )

    # 2. Aturan Peran Super Admin Platform (lintas akses sah jika diizinkan khusus)
    if "platform_super_admin" in subject.roles:
        if not subject.is_mfa_verified:
            return AuthorizationDecision(
                is_authorized=False,
                decision="deny",
                reason="Operasi administratif platform memerlukan verifikasi MFA aktif."
            )
        return AuthorizationDecision(
            is_authorized=True,
            decision="allow",
            reason="Akses disetujui untuk Platform Super Admin dengan MFA aktif."
        )

    # 3. Penegakan Peran Tenant
    if "owner" in subject.roles or "admin" in subject.roles:
        return AuthorizationDecision(
            is_authorized=True,
            decision="allow",
            reason="Akses disetujui berdasarkan peran administratif tenant."
        )

    # 4. Penegakan Kapabilitas Spesifik
    if action in subject.capabilities:
        return AuthorizationDecision(
            is_authorized=True,
            decision="allow",
            reason=f"Akses disetujui berdasarkan kapabilitas terdaftar '{action}'."
        )

    # Standar fail-closed
    return AuthorizationDecision(
        is_authorized=False,
        decision="deny",
        reason=f"Subjek tidak memiliki peran atau kapabilitas '{action}' untuk resource '{resource.resource_type}'."
    )
