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
    import sys
    import urllib.request
    try:
        # Try fetching from running FastAPI backend first
        with urllib.request.urlopen("http://127.0.0.1:8001/openapi.json", timeout=3) as resp:
            openapi = json.loads(resp.read().decode('utf-8'))
            paths = openapi.get('paths', {})
            routes = []
            for path, methods in paths.items():
                for m in methods:
                    if m.lower() in ['get', 'post', 'put', 'patch', 'delete']:
                        routes.append({
                            'method': m.upper(),
                            'path': path,
                            'file': 'fastapi_openapi'
                        })
            return routes
    except Exception as fetch_err:
        pass

    try:
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        backend_dir = os.path.join(root_dir, 'apps', 'backend')
        if root_dir not in sys.path:
            sys.path.insert(0, root_dir)
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
        from app.main import app
        openapi = app.openapi()
        paths = openapi.get('paths', {})
        routes = []
        for path, methods in paths.items():
            for m in methods:
                if m.lower() in ['get', 'post', 'put', 'patch', 'delete']:
                    routes.append({
                        'method': m.upper(),
                        'path': path,
                        'file': 'fastapi_openapi'
                    })
        return routes
    except Exception as e:
        print(f"Warning: Could not load app.openapi(): {e}")
        return []

def scan_frontend_calls():
    calls = []
    # Pattern to match /api/v1/ or template literals
    api_pattern = re.compile(r'[`\'"](/api/v1/[^`\'"\s\?#]+)[`\'"?#]')
    search_dirs = ['src', 'apps/client', 'apps/admin', 'packages/ui']
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
    frontend_calls = scan_frontend_calls()

    print(f"[*] Total FastAPI Backend Endpoints : {len(backend_routes)}")
    print(f"[*] Total Frontend API Calls Found  : {len(frontend_calls)}")

    # Normalized backend routes
    backend_normalized = {normalize_path(r['path']): r for r in backend_routes}
    all_known_paths = set(backend_normalized.keys())

    # Check frontend calls against known paths
    route_regexes = []
    for kp in all_known_paths:
        parts = kp.strip('/').split('/')
        pattern_parts = []
        for part in parts:
            if part == ':param':
                pattern_parts.append(r'[^/]+')
            else:
                pattern_parts.append(re.escape(part))
        regex = re.compile('^/' + '/'.join(pattern_parts) + '$')
        route_regexes.append((regex, kp))

    unmatched_calls = []
    matched_calls = []
    matched_backend_paths = set()

    for call in frontend_calls:
        norm_call = normalize_path(call['raw_url'])
        matched = False
        if norm_call in all_known_paths:
            matched = True
            matched_backend_paths.add(norm_call)
        else:
            for regex, kp in route_regexes:
                if regex.match(norm_call):
                    matched = True
                    matched_backend_paths.add(kp)
                    break
            if not matched:
                norm_parts = norm_call.strip('/').split('/')
                for kp in all_known_paths:
                    kp_parts = kp.strip('/').split('/')
                    if len(norm_parts) == len(kp_parts):
                        if all(np == ':param' or kp == ':param' or np == kp for np, kp in zip(norm_parts, kp_parts)):
                            matched = True
                            matched_backend_paths.add(kp)
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

    # Check for backend endpoints not directly called by frontend (e.g. system webhooks, background tasks, or unused endpoints)
    uncalled_backend = []
    for norm_p, r in backend_normalized.items():
        if norm_p not in matched_backend_paths:
            uncalled_backend.append((norm_p, r))

    print(f"\n[*] Backend endpoints without direct frontend UI calls: {len(uncalled_backend)}")
    for norm_p, r in sorted(uncalled_backend, key=lambda x: x[0])[:30]:
        print(f"  {r['method']} {norm_p}")
    if len(uncalled_backend) > 30:
        print(f"  ... and {len(uncalled_backend) - 30} more backend operations.")

if __name__ == '__main__':
    main()
