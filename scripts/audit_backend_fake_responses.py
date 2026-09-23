"""
Audit script to detect fake/static responses, TODOs, and unqueried returns
in backend endpoints (FastAPI and server.ts).
"""

import os
import re

def audit_fastapi():
    findings = []
    for root, _, files in os.walk('apps/backend/app/api/v1'):
        for f in files:
            if f.endswith('.py'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    lines = fp.readlines()
                    for i, line in enumerate(lines):
                        if 'TODO' in line or 'pass' in line.strip() or 'NotImplemented' in line:
                            findings.append((path, i + 1, line.strip()))
    return findings

def audit_server_ts():
    findings = []
    if os.path.exists('server.ts'):
        with open('server.ts', 'r', encoding='utf-8', errors='ignore') as fp:
            lines = fp.readlines()
            for i, line in enumerate(lines):
                # Search for hardcoded mock returns or TODOs
                if re.search(r'//\s*TODO', line, re.I):
                    findings.append(('server.ts', i + 1, line.strip()))
                if re.search(r'res\.json\(\[\s*\{\s*id:\s*[\'"][^\'"]+[\'"]', line):
                    # Check if it is a literal static array returned directly
                    findings.append(('server.ts', i + 1, line.strip()))
    return findings

def main():
    print("AUDITING BACKEND FOR FAKE / STATIC RESPONSES & TODOS...")
    py_findings = audit_fastapi()
    print(f"FastAPI suspicious lines: {len(py_findings)}")
    for path, line_no, text in py_findings:
        print(f"  {path}:{line_no} -> {text}")

    ts_findings = audit_server_ts()
    print(f"\nServer.ts suspicious lines: {len(ts_findings)}")
    for path, line_no, text in ts_findings:
        print(f"  {path}:{line_no} -> {text}")

if __name__ == '__main__':
    main()
