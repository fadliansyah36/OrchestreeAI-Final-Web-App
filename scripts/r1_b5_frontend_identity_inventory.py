#!/usr/bin/env python3
"""R1-B.5 production frontend identity/real-data inventory gate."""
from __future__ import annotations
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = (ROOT / "apps" / "client", ROOT / "apps" / "admin")
EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}

PATTERNS = {
    "browser auth token storage": re.compile(r"localStorage\.(?:setItem|getItem)\s*\(\s*['\"](?:orchestree_auth_token|orchestree_admin_token|sb-access-token)['\"]", re.I),
    "browser tenant authority": re.compile(r"localStorage\.(?:setItem|getItem)\s*\(\s*['\"](?:orchestree_active_tenant|tenant_id|active_tenant)['\"]", re.I),
    "client-authored role header": re.compile(r"['\"]X-User-Roles['\"]", re.I),
    "client-authored capability header": re.compile(r"['\"]X-User-Capabilities['\"]", re.I),
    "client-authored MFA header": re.compile(r"['\"]X-MFA-Verified['\"]", re.I),
    "frontend service-role secret": re.compile(r"SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY", re.I),
    "synthetic organization label": re.compile(r"Organisasi Terdaftar", re.I),
    "synthetic membership UUID": re.compile(r"membership_id\s*:\s*[^,\n]*crypto\.randomUUID\s*\(", re.I),
}

def sources():
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if p.is_file() and p.suffix in EXTENSIONS and "node_modules" not in p.parts and ".next" not in p.parts and "tests" not in p.parts and "__tests__" not in p.parts:
                yield p

def main() -> int:
    files = list(sources())
    findings = []
    for p in files:
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        rel = p.relative_to(ROOT)
        for name, pattern in PATTERNS.items():
            for m in pattern.finditer(text):
                findings.append(f"{rel}:{text.count(chr(10), 0, m.start()) + 1}: {name}")
    print(f"R1-B.5 inventory: scanned {len(files)} production source files")
    if findings:
        print("\n".join(findings))
        print(f"FAIL: {len(findings)} forbidden production findings.")
        return 1
    print("PASS: no forbidden browser identity, privileged header, service-role, or known synthetic identity pattern.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
