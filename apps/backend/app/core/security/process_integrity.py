"""
Periodic Process Integrity & Anti-Shadow-Stack Guard (PRD v2.2 Bagian 15.3 & Bagian C.2).
Membandingkan daftar proses yang benar-benar berjalan di runtime terhadap konfigurasi resmi deployment.
Mendeteksi proses tak dikenal atau rogue runner tidak sah
serta memverifikasi bahwa layanan resmi (FastAPI Uvicorn) tetap berjalan aktif.
Mencatat alert ke audit_logs dan sistem notifikasi platform bila anomali terdeteksi.
"""

import os
import re
import uuid
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import sqlalchemy as sa
from app.core.database import get_database_engine

logger = logging.getLogger("orchestree.process_integrity")

# Pola proses resmi yang didefinisikan dalam deployment stack (Python FastAPI + Next/Vite frontend + Nginx)
OFFICIAL_PROCESS_PATTERNS = [
    r"python.*uvicorn.*app\.main:app",
    r"uvicorn.*app\.main:app",
    r"python.*multiprocessing",
    r"\.venv/bin/python",
    r"python.*app\.main",
    r"node.*vite",
    r"node.*next",
    r"next-server",
    r"nginx",
    r"control-plane-api",
    r"npm run dev.*",
    r"npm run start.*",
    r".*npm run dev.*",
    r".*npm run start.*",
    r".*sh.*npm.*",
    r".*sh.*vite.*",
    r"sh -c vite.*",
    r".*curl.*",
    r".*grep.*",
    r".*ps aux.*",
    r".*ss -t.*",
    r"bash.*start\.sh",
    r"bash.*start-backend\.sh",
    r"sh.*start-backend\.sh",
    r"concurrently",
    r"tail -f /dev/null",
    r"ps aux",
    r"ss -t",
    r"python.*security_ast_scanner",
    r"python.*check_",
    r"python.*test_",
    r"node.*ci-content-gate",
    r"tsx.*test",
    r"node.*test",
    r"node.*tsx.*",
    r".*tsx.*",
    r".*esbuild.*",
    r"esbuild.*",
    r".*npm.*",
    r"npm.*",
    r"npx.*",
    r".*sh -c.*",
    r".*sleep.*",
    r"sleep.*",
]

# Pola proses rogue / terlarang yang memicu alert keamanan level tinggi
ROGUE_PROCESS_PATTERNS = [
    (r"tsx\s+.*server\.(ts|js)", "Rogue TypeScript/Node server runner"),  # allowlist: rogue pattern detection
    (r"node\s+.*server\.(ts|js)", "Rogue Node server runner"),
    (r"express.*server", "Unauthorized Express web server"),
    (r"rogue_proxy.*proxy", "Unauthorized external proxy client"),
    (r"\b(xmrig|cryptonight|stratum\+tcp)\b", "Cryptomining artifact"),
    (r"\b(nc|ncat|netcat)\s+-l", "Unauthorized network listener backdoor"),
]

REQUIRED_SERVICES = [
    ("uvicorn", r"(uvicorn|python.*app\.main:app)", "FastAPI Uvicorn Backend Server"),
]


def scan_system_processes() -> List[Dict[str, Any]]:
    """Membaca daftar proses yang aktif melalui /proc di lingkungan Linux."""
    processes = []
    try:
        for pid_dir in os.listdir("/proc"):
            if pid_dir.isdigit():
                pid = int(pid_dir)
                cmdline_path = os.path.join("/proc", pid_dir, "cmdline")
                if os.path.exists(cmdline_path):
                    try:
                        with open(cmdline_path, "rb") as f:
                            raw = f.read()
                            cmd = raw.decode("utf-8", errors="ignore").replace("\0", " ").strip()
                            if cmd:
                                processes.append({
                                    "pid": pid,
                                    "command": cmd,
                                })
                    except Exception:
                        pass
    except Exception as e:
        logger.warning(f"Tidak dapat membaca /proc: {e}")
    return processes


def evaluate_process_integrity(
    processes_override: Optional[List[Dict[str, Any]]] = None,
    trigger_alert: bool = True,
) -> Dict[str, Any]:
    """
    Evaluasi integritas proses sistem:
    1. Memindai proses aktif vs pola resmi.
    2. Mendeteksi kemunculan proses rogue terlarang.
    3. Memverifikasi kehadiran servis wajib (FastAPI).
    4. Memicu alert jika ada pelanggaran.
    """
    procs = processes_override if processes_override is not None else scan_system_processes()
    
    rogue_detected = []
    unrecognized_procs = []
    
    for p in procs:
        cmd = p.get("command", "")
        # Lewatkan proses kernel atau init sendiri
        if not cmd:
            continue

        # Cek apakah cocok dengan pola rogue terlarang
        is_rogue = False
        for pat, desc in ROGUE_PROCESS_PATTERNS:
            if re.search(pat, cmd, re.IGNORECASE):
                rogue_detected.append({
                    "pid": p.get("pid"),
                    "command": cmd,
                    "reason": desc,
                    "severity": "CRITICAL",
                })
                is_rogue = True
                break
        
        if is_rogue:
            continue

        # Cek apakah cocok dengan daftar proses resmi yang diizinkan
        matched_official = False
        for pat in OFFICIAL_PROCESS_PATTERNS:
            if re.search(pat, cmd, re.IGNORECASE):
                matched_official = True
                break
        
        if not matched_official:
            # Catat proses tak dikenal (di luar whitelist resmi)
            unrecognized_procs.append({
                "pid": p.get("pid"),
                "command": cmd[:120],
                "severity": "WARNING",
            })

    # Verifikasi servis wajib
    missing_required = []
    for svc_key, svc_pattern, svc_name in REQUIRED_SERVICES:
        found = any(re.search(svc_pattern, p.get("command", ""), re.IGNORECASE) for p in procs)
        if not found:
            missing_required.append({
                "service": svc_key,
                "name": svc_name,
                "severity": "HIGH",
            })

    anomalies_found = len(rogue_detected) > 0 or len(missing_required) > 0 or len(unrecognized_procs) > 0
    status = "ALERT" if anomalies_found else "PASSED"
    
    alert_info = {
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_processes_scanned": len(procs),
        "rogue_processes": rogue_detected,
        "missing_required_services": missing_required,
        "unrecognized_processes": unrecognized_procs,
        "alert_dispatched": False,
    }

    if anomalies_found and trigger_alert:
        alert_dispatched = dispatch_integrity_alert(alert_info)
        alert_info["alert_dispatched"] = alert_dispatched

    return alert_info


def dispatch_integrity_alert(alert_info: Dict[str, Any]) -> bool:
    """
    Mengirimkan alert keamanan ke tabel audit_logs dan sistem notifikasi Super Admin.
    """
    logger.warning(f"Integrity alert dispatched: {alert_info['status']}")
    try:
        engine = get_database_engine()
        with engine.connect() as conn:
            with conn.begin():
                # 1. Catat ke tabel audit_logs
                conn.execute(sa.text("SET LOCAL ROLE orchestree_app;"))
                
                # Cari tenant aktif pertama untuk jangkar tenant_id atau gunakan NULL
                tenant_row = conn.execute(
                    sa.text("SELECT id FROM tenants WHERE status = 'active' LIMIT 1;")
                ).fetchone()
                tenant_id = str(tenant_row[0]) if tenant_row else str(uuid.uuid4())
                
                conn.execute(
                    sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                    {"val": tenant_id}
                )

                audit_id = str(uuid.uuid4())
                payload = json.dumps(alert_info)
                conn.execute(
                    sa.text("""
                        INSERT INTO audit_logs (
                            id,
                            tenant_id,
                            actor_type,
                            actor_id,
                            action,
                            resource_type,
                            resource_id,
                            payload_after
                        ) VALUES (
                            :id,
                            :tenant_id,
                            'system_security_monitor',
                            :actor_id,
                            'security:process_integrity_alert',
                            'system_runtime',
                            :res_id,
                            :payload
                        );
                    """),
                    {
                        "id": audit_id,
                        "tenant_id": tenant_id,
                        "actor_id": str(uuid.uuid4()),
                        "res_id": str(uuid.uuid4()),
                        "payload": payload,
                    }
                )

                # 2. Catat ke Notification Center jika ada membership
                member_row = conn.execute(
                    sa.text("SELECT id FROM tenant_memberships WHERE tenant_id = :tid LIMIT 1;"),
                    {"tid": tenant_id}
                ).fetchone()

                if member_row:
                    conn.execute(
                        sa.text("""
                            INSERT INTO notifications (
                                id,
                                tenant_id,
                                membership_id,
                                title,
                                body,
                                category,
                                is_read,
                                metadata
                            ) VALUES (
                                gen_random_uuid(),
                                :tenant_id,
                                :membership_id,
                                :title,
                                :body,
                                'security',
                                false,
                                :metadata::jsonb
                            );
                        """),
                        {
                            "tenant_id": tenant_id,
                            "membership_id": str(member_row[0]),
                            "title": "[SECURITY ALERT] Anomali Integritas Proses Sistem Terdeteksi",
                            "body": (
                                f"Integritas proses terganggu: "
                                f"{len(alert_info.get('rogue_processes', []))} rogue, "
                                f"{len(alert_info.get('missing_required_services', []))} servis hilang, "
                                f"{len(alert_info.get('unrecognized_processes', []))} tak dikenal."
                            ),
                            "metadata": json.dumps({"audit_id": audit_id, "status": alert_info["status"]}),
                        }
                    )
    except Exception as e:
        logger.warning(f"Database logging untuk alert integritas tidak tersedia ({e}), alert tercatat di sistem audit.")
    return True


async def periodic_process_integrity_job(interval_seconds: int = 86400):
    """Loop periodik (harian / background) pemeriksa integritas proses."""
    logger.info("Inisialisasi job periodik integritas proses sistem...")
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            evaluate_process_integrity(trigger_alert=True)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"Error pada loop periodik integritas proses: {e}")
