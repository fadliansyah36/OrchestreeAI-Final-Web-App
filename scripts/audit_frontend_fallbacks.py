"""
Audit script for frontend components (src/components, apps/client, apps/admin).
Scans for:
1. Hardcoded initial array state: useState([ { ... } ])
2. Hardcoded fallback assignments in catch blocks or if (!data)
3. Hardcoded tenantId literals
"""

import os
import re

SEARCH_DIRS = ['src/components', 'apps/client/components', 'apps/admin/components']

def scan_initial_states():
    findings = []
    # match useState( [ { across multiple lines or single line
    pattern = re.compile(r'useState\s*(?:<[^>]+>)?\s*\(\s*\[\s*\{', re.DOTALL)
    for d in SEARCH_DIRS:
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(('.tsx', '.ts')):
                    path = os.path.join(root, f)
                    with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                        content = fp.read()
                        for m in pattern.finditer(content):
                            # find line number
                            line_no = content[:m.start()].count('\n') + 1
                            matched_text = m.group(0).replace('\n', ' ')
                            findings.append((path, line_no, matched_text))
    return findings

def scan_fallbacks():
    findings = []
    pattern = re.compile(r'(fallbackTicket|dummyData|mockData|sampleData|initialFallback)', re.I)
    for d in SEARCH_DIRS:
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(('.tsx', '.ts')):
                    path = os.path.join(root, f)
                    with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                        lines = fp.readlines()
                        for i, line in enumerate(lines):
                            if pattern.search(line):
                                findings.append((path, i + 1, line.strip()))
    return findings

def scan_hardcoded_tenant_ids():
    findings = []
    pattern = re.compile(r'const\s+tenantId\s*=\s*[\'"][0-9a-fA-F\-]{10,}[\'"]')
    for d in SEARCH_DIRS:
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(('.tsx', '.ts')):
                    path = os.path.join(root, f)
                    with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                        lines = fp.readlines()
                        for i, line in enumerate(lines):
                            if pattern.search(line):
                                findings.append((path, i + 1, line.strip()))
    return findings

def main():
    print("AUDITING FRONTEND COMPONENTS FOR HARDCODED STATES & FALLBACKS...")
    
    init_states = scan_initial_states()
    print(f"\n[1] Suspicious useState([{{ ... }}]): {len(init_states)}")
    for p, l, text in init_states:
        print(f"  {p}:{l} -> {text[:100]}")

    fallbacks = scan_fallbacks()
    print(f"\n[2] Suspicious fallback/mock variables: {len(fallbacks)}")
    for p, l, text in fallbacks:
        print(f"  {p}:{l} -> {text[:100]}")

    hardcoded_tids = scan_hardcoded_tenant_ids()
    print(f"\n[3] Hardcoded tenantId constants: {len(hardcoded_tids)}")
    for p, l, text in hardcoded_tids:
        print(f"  {p}:{l} -> {text[:100]}")

if __name__ == '__main__':
    main()
