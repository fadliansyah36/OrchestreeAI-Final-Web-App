#!/usr/bin/env python3
"""
Deep scan script for Bagian A, B, and C requirements.
"""
import os
import re
import json

root_dirs = ['apps', 'packages', 'src']
patterns = {
    'forbidden_terms': re.compile(r'\b(mock|fake|dummy|sample_data|simulate|scenario_data|placeholder)\b', re.IGNORECASE),
    'test_email': re.compile(r'[\w\.-]+@(example\.com|test\.com|dummy\.com|admin\.com)', re.IGNORECASE),
    'hardcoded_uuid': re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', re.IGNORECASE),
    'dev_shortcut': re.compile(r'(quickSelect|quick_select|devShortcut|dev_shortcut|bypassAuth|bypass_auth)', re.IGNORECASE),
    'localstorage_set_auth': re.compile(r'localStorage\.setItem\s*\(\s*[\'"`](orchestree_auth|orchestree_current_tenant|orchestree_active_tenant|orchestree_admin_token|sb-access-token|orchestree_mfa_verified)[\'"`]', re.IGNORECASE),
    'casing_status': re.compile(r'(status\s*==?\s*[\'"`][A-Z_]+[\'"`]|\bstatus\s*=\s*[\'"`][A-Z_]+[\'"`])', re.IGNORECASE)
}

results = {k: [] for k in patterns}

for root_dir in root_dirs:
    for dirpath, _, filenames in os.walk(root_dir):
        if any(ignored in dirpath for ignored in ['node_modules', '.next', 'dist', '__pycache__', 'tests', '.venv']):
            continue
        for f in filenames:
            ext = os.path.splitext(f)[1].lower()
            if ext not in ['.ts', '.tsx', '.py', '.json', '.html', '.js', '.mjs']:
                continue
            path = os.path.join(dirpath, f)
            with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                lines = fp.readlines()
            for idx, line in enumerate(lines, 1):
                if 'allowlist:' in line:
                    continue
                for name, pat in patterns.items():
                    if pat.search(line):
                        results[name].append((path, idx, line.strip()))

for name, items in results.items():
    print(f'=== {name}: {len(items)} found ===')
    for p, l, s in items[:30]:
        print(f'{p}:{l} -> {s[:120]}')
    if len(items) > 30:
        print(f'... and {len(items)-30} more')
