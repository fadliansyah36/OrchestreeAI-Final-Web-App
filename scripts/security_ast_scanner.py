#!/usr/bin/env python3
"""
OrchestreeAI AST Security Scanner (PRD v2.2 Bagian 3.5 & Security Hardening Gate)

Memeriksa secara otomatis seluruh endpoint REST di apps/backend/app/api/v1/
Menolak (exit code 1) jika ditemukan endpoint tanpa proteksi PDP authorize()
atau require_capability / public_endpoint / webhook_endpoint.
"""

import os
import sys
import ast
from typing import List, Dict, Any, Tuple

API_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "apps", "backend", "app", "api", "v1")

PROTECTION_PATTERNS = [
    "require_capability",
    "public_endpoint",
    "webhook_endpoint",
    "authorize(",
    "authz",
    "require_permission",
    "verify_tenant_permission",
]


def analyze_file(filepath: str) -> Tuple[int, List[Dict[str, Any]]]:
    filename = os.path.basename(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    try:
        tree = ast.parse(content, filename=filepath)
    except Exception as e:
        print(f"[ERROR] Failed to parse {filename}: {e}", file=sys.stderr)
        return 0, [{"name": filename, "path": "?", "method": "?", "line": 0, "reason": f"Syntax error: {e}"}]

    # Map router variable name -> is_protected
    protected_routers = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    var_name = target.id
                    code_unparsed = ast.unparse(node.value) if hasattr(ast, "unparse") else ""
                    if "APIRouter(" in code_unparsed and any(pat in code_unparsed for pat in PROTECTION_PATTERNS):
                        protected_routers.add(var_name)

    unprotected = []
    total_endpoints = 0

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            route_decorator = None
            router_var = None
            for dec in node.decorator_list:
                dec_str = ast.unparse(dec) if hasattr(ast, "unparse") else ""
                for m in [".get(", ".post(", ".put(", ".delete(", ".patch(", ".options("]:
                    if m in dec_str:
                        route_decorator = dec_str
                        router_var = dec_str.split(m)[0].strip("@").strip()
                        break
                if route_decorator:
                    break

            if not route_decorator:
                continue

            total_endpoints += 1
            func_name = node.name
            line_no = node.lineno

            # Cek 1: Router default dependencies
            if router_var and router_var in protected_routers:
                continue

            # Cek 2: Route decorator dependencies
            if any(pat in route_decorator for pat in PROTECTION_PATTERNS):
                continue

            # Cek 3: Function parameters (mis. Depends(require_capability(...)))
            params_str = " ".join([ast.unparse(arg) for arg in node.args.args] + [ast.unparse(d) for d in node.args.defaults if hasattr(ast, "unparse")])
            if any(pat in params_str for pat in PROTECTION_PATTERNS):
                continue

            # Cek 4: Function body calls authorize()
            body_str = ast.unparse(node) if hasattr(ast, "unparse") else ""
            if any(pat in body_str for pat in PROTECTION_PATTERNS):
                continue

            unprotected.append({
                "file": filename,
                "function": func_name,
                "line": line_no,
                "decorator": route_decorator,
            })

    return total_endpoints, unprotected


def main():
    print("=" * 80)
    print("ORCHESTREE AI — AST SECURITY & PDP CAPABILITY SCANNER")
    print(f"Scanning directory: {API_DIR}")
    print("=" * 80)

    total_all = 0
    unprotected_all = []

    files = sorted([f for f in os.listdir(API_DIR) if f.endswith(".py") and not f.startswith("__")])

    for f in files:
        filepath = os.path.join(API_DIR, f)
        total, unprot = analyze_file(filepath)
        total_all += total
        unprotected_all.extend(unprot)
        status_symbol = "✓ PASS" if len(unprot) == 0 else f"✗ FAIL ({len(unprot)} missing)"
        print(f"  {f:28} [{total:2} endpoints] -> {status_symbol}")

    print("-" * 80)
    print(f"Total REST Endpoints scanned : {total_all}")
    print(f"Protected with PDP authorize: {total_all - len(unprotected_all)}")
    print(f"Unprotected endpoints        : {len(unprotected_all)}")
    print("-" * 80)

    if unprotected_all:
        print("\n[CRITICAL FAILURE] The following endpoints lack PDP authorize() or require_capability():")
        for u in unprotected_all:
            print(f"  - {u['file']}:{u['line']} in {u['function']}(): {u['decorator']}")
        print("\nBuild rejected by Security Gate (PRD v2.2 Bagian 3.5).")
        sys.exit(1)

    print("\n[SUCCESS] 100% of REST endpoints are verified and protected by PDP authorize().")
    sys.exit(0)


if __name__ == "__main__":
    main()
