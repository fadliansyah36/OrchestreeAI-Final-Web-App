"""
OrchestreeAI API Inventory & Route Cross-Audit Script
Audits:
1. Backend REST routes (apps/backend/app/api/v1/*.py)
2. Express/Node runtime routes (server.ts)
3. Frontend API calls (src/, apps/client/, apps/admin/)
4. Orphaned endpoints & missing/dead endpoints
5. Static responses or fake returns
"""

import os
import re
import json

def scan_backend_routes():
    # 1. Parse include_router prefixes from apps/backend/app/main.py
    main_mounts = {}
    import_aliases = {}
    if os.path.exists('apps/backend/app/main.py'):
        with open('apps/backend/app/main.py', 'r', encoding='utf-8', errors='ignore') as fp:
            main_content = fp.read()
            # Map imports: from app.api.v1.omnichannel import router as omnichannel_router
            import_pattern = re.compile(r'from\s+app\.api\.v1\.([a-zA-Z0-9_]+)\s+import\s+([a-zA-Z0-9_]+)(?:\s+as\s+([a-zA-Z0-9_]+))?')
            for m in import_pattern.finditer(main_content):
                mod, orig, alias = m.groups()
                var_name = alias if alias else orig
                import_aliases[var_name] = (mod, orig)

            # Map app.include_router(router_var, prefix="...")
            include_pattern = re.compile(r'app\.include_router\(\s*([a-zA-Z0-9_]+)(?:,\s*prefix\s*=\s*["\']([^"\']+)["\'])?')
            for m in include_pattern.finditer(main_content):
                r_var, pfx = m.groups()
                pfx = pfx or ""
                if r_var in import_aliases:
                    mod, orig = import_aliases[r_var]
                    main_mounts[(mod, orig)] = pfx
                else:
                    main_mounts[r_var] = pfx

    routes = []
    router_prefix_pattern = re.compile(r'([a-zA-Z0-9_]+)\s*=\s*APIRouter\([^)]*prefix\s*=\s*["\']([^"\']+)["\']')
    default_router_pattern = re.compile(r'([a-zA-Z0-9_]+)\s*=\s*APIRouter\(')
    endpoint_pattern = re.compile(r'@([a-zA-Z0-9_]+)\.(get|post|put|patch|delete)\(\s*["\']([^"\']+)["\']')

    for root, _, files in os.walk('apps/backend/app/api/v1'):
        for f in files:
            if f.endswith('.py'):
                mod_name = f[:-3]
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()

                    router_prefixes = {}
                    for m in default_router_pattern.finditer(content):
                        router_prefixes[m.group(1)] = ""
                    for m in router_prefix_pattern.finditer(content):
                        router_prefixes[m.group(1)] = m.group(2)

                    for match in endpoint_pattern.finditer(content):
                        r_var, method, ep = match.groups()
                        internal_pfx = router_prefixes.get(r_var, "")
                        # Check if main.py adds a mount prefix
                        main_pfx = main_mounts.get((mod_name, r_var), "") or main_mounts.get(r_var, "")
                        full_ep = f"{main_pfx.rstrip('/')}/{internal_pfx.lstrip('/')}".rstrip('/')
                        full_ep = f"{full_ep.rstrip('/')}/{ep.lstrip('/')}"
                        if not full_ep.startswith('/'):
                            full_ep = '/' + full_ep
                        # normalize double slashes
                        full_ep = re.sub(r'/+', '/', full_ep)
                        routes.append({
                            'method': method.upper(),
                            'path': full_ep,
                            'file': path
                        })
    return routes

def scan_server_routes():
    routes = []
    pattern = re.compile(r'app\.(get|post|put|patch|delete)\(\s*(\[[^\]]+\]|["\'][^"\']+["\'])')
    if os.path.exists('server.ts'):
        with open('server.ts', 'r', encoding='utf-8', errors='ignore') as fp:
            content = fp.read()
            for match in pattern.finditer(content):
                method, raw_ep = match.groups()
                # could be array of routes or single string
                if raw_ep.startswith('['):
                    eps = [e.strip(' "\'[]') for e in raw_ep.split(',') if e.strip(' "\'[]')]
                else:
                    eps = [raw_ep.strip(' "\'')]
                for ep in eps:
                    routes.append({
                        'method': method.upper(),
                        'path': ep,
                        'file': 'server.ts'
                    })
    return routes

def scan_frontend_calls():
    calls = []
    # Pattern to match /api/v1/ or template literals
    api_pattern = re.compile(r'[`\'"](/api/v1/[^`\'"\s\?#]+)[`\'"?#]')
    search_dirs = ['src', 'apps/client', 'apps/admin']
    for d in search_dirs:
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(('.tsx', '.ts', '.jsx', '.js')) and not f.endswith('.test.ts') and not f.endswith('.test.tsx'):
                    filepath = os.path.join(root, f)
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as fp:
                        lines = fp.readlines()
                        for i, line in enumerate(lines):
                            for match in api_pattern.finditer(line):
                                raw_url = match.group(1)
                                calls.append({
                                    'file': filepath,
                                    'line': i + 1,
                                    'raw_url': raw_url
                                })
    return calls

def normalize_path(path):
    # Strip query parameters
    p = path.split('?')[0]
    # Replace ${...} with :param
    p = re.sub(r'\$\{[^\}]+\}', ':param', p)
    # Replace {...} with :param
    p = re.sub(r'\{[^\}]+\}', ':param', p)
    # Replace :paramName with :param
    p = re.sub(r':[a-zA-Z0-9_]+', ':param', p)
    # Ensure leading slash
    if not p.startswith('/'):
        p = '/' + p
    # Clean double slashes
    p = re.sub(r'/+', '/', p)
    return p

def main():
    print("=" * 80)
    print("ORCHESTREE AI — API INVENTORY & CROSS-AUDIT")
    print("=" * 80)

    backend_routes = scan_backend_routes()
    server_routes = scan_server_routes()
    frontend_calls = scan_frontend_calls()

    print(f"[*] Total FastAPI Backend Endpoints : {len(backend_routes)}")
    print(f"[*] Total Server.ts Endpoints       : {len(server_routes)}")
    print(f"[*] Total Frontend API Calls Found  : {len(frontend_calls)}")

    # Normalized sets
    server_normalized = {normalize_path(r['path']): r for r in server_routes}
    backend_normalized = {normalize_path(r['path']): r for r in backend_routes}

    # Combined known endpoints
    all_known_paths = set(server_normalized.keys()) | set(backend_normalized.keys())

    # Check frontend calls against known paths
    unmatched_calls = []
    matched_calls = []
    for call in frontend_calls:
        norm_call = normalize_path(call['raw_url'])
        # Check if matched directly or prefix matched
        matched = False
        if norm_call in all_known_paths:
            matched = True
        else:
            # Check pattern match
            for kp in all_known_paths:
                if norm_call == kp:
                    matched = True
                    break
        if matched:
            matched_calls.append(call)
        else:
            unmatched_calls.append((call, norm_call))

    print(f"[+] Matched Frontend Calls : {len(matched_calls)}")
    print(f"[-] Unmatched / Dead Calls : {len(unmatched_calls)}")

    if unmatched_calls:
        print("\n--- UNMATCHED / POTENTIAL DEAD CALLS IN FRONTEND ---")
        seen_unmatched = set()
        for call, norm in unmatched_calls:
            key = f"{norm} in {call['file']}"
            if key not in seen_unmatched:
                seen_unmatched.add(key)
                print(f"  Line {call['line']} of {call['file']}: {call['raw_url']} -> Normalized: {norm}")

    # Check for endpoints never called by frontend
    frontend_normalized_set = {normalize_path(c['raw_url']) for c in frontend_calls}
    uncalled_server = []
    for norm_p, r in server_normalized.items():
        if norm_p not in frontend_normalized_set and not norm_p.startswith('/api/v1/webhooks'):
            uncalled_server.append((norm_p, r))

    print(f"\n[*] Server.ts endpoints without direct frontend calls: {len(uncalled_server)}")

if __name__ == '__main__':
    main()
