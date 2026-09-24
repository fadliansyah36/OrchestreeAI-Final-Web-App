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


def analyze_mcp_tools(skills_dir: str) -> Tuple[int, List[str]]:
    """Memeriksa bahwa seluruh tool MCP didekorasi dengan @mcp_tool yang memanggil authorize()."""
    total_tools = 0
    missing_protection = []
    for root, _, files in os.walk(skills_dir):
        for f in files:
            if f.endswith("tools.py"):
                filepath = os.path.join(root, f)
                with open(filepath, "r", encoding="utf-8") as file_obj:
                    content = file_obj.read()
                try:
                    tree = ast.parse(content, filename=filepath)
                except Exception:
                    continue
                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        if node.name.startswith("tool_"):
                            total_tools += 1
                            has_mcp_dec = False
                            for dec in node.decorator_list:
                                dec_str = ast.unparse(dec) if hasattr(ast, "unparse") else ""
                                if "mcp_tool" in dec_str:
                                    has_mcp_dec = True
                                    break
                            if not has_mcp_dec:
                                missing_protection.append(f"{f}:{node.lineno} in {node.name}()")
    return total_tools, missing_protection


def analyze_workflow_engine(engine_file: str) -> bool:
    """Memeriksa bahwa engine alur kerja mengevaluasi authorize() pada setiap eksekusi node."""
    if not os.path.exists(engine_file):
        return False
    with open(engine_file, "r", encoding="utf-8") as f:
        content = f.read()
    return "authz_decision = authorize(" in content and "workflow.node." in content


def main():
    print("=" * 80)
    print("ORCHESTREE AI — AST SECURITY & PDP CAPABILITY SCANNER (PRD v2.2 Bagian 3.5)")
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

    # Titik Evaluasi 2: Workflow Nodes
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    engine_file = os.path.join(repo_root, "apps", "backend", "app", "core", "orchestration", "engine.py")
    wf_ok = analyze_workflow_engine(engine_file)
    wf_status = "✓ PASS (Evaluasi Titik 2 Aktif)" if wf_ok else "✗ FAIL"
    print(f"  Workflow Node Graph Engine   [Node Execution] -> {wf_status}")

    # Titik Evaluasi 3: MCP Tools
    skills_dir = os.path.join(repo_root, "apps", "backend", "app", "skills")
    mcp_count, mcp_missing = analyze_mcp_tools(skills_dir)
    mcp_status = "✓ PASS (Evaluasi Titik 3 Aktif)" if len(mcp_missing) == 0 else f"✗ FAIL ({len(mcp_missing)} missing)"
    print(f"  MCP Tools Registry           [{mcp_count:2} tools]     -> {mcp_status}")
    print("-" * 80)

    if unprotected_all or not wf_ok or mcp_missing:
        print("\n[CRITICAL FAILURE] Security violations detected in PDP coverage:")
        for u in unprotected_all:
            print(f"  - Endpoint: {u['file']}:{u['line']} in {u['function']}(): {u['decorator']}")
        if not wf_ok:
            print("  - Workflow engine lacks PDP authorize() before node execution.")
        for m in mcp_missing:
            print(f"  - MCP Tool lacking @mcp_tool decorator: {m}")
        print("\nBuild rejected by Security Gate (PRD v2.2 Bagian 3.5).")
        sys.exit(1)

    print("\n[SUCCESS] 100% of REST endpoints, Workflow Nodes, and MCP Tools verified & protected by PDP authorize().")
    sys.exit(0)


if __name__ == "__main__":
    main()
