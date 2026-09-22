"""
OrchestreeAI Trial Slot Allocation Service (PRD v2.2 Bagian 13.5).
Mengimplementasikan alokasi atomik konkurensi tinggi dengan locking baris (SELECT FOR UPDATE SKIP LOCKED).
Kapasitas maksimum (awal 36 slot) dan durasi trial dibaca dinamis dari platform_settings.
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta
import json
import logging
import sqlalchemy as sa
from app.core.database import get_database_engine

logger = logging.getLogger("orchestree.trial_allocation")


class SlotCapacityExhaustedError(Exception):
    """Exception ketika seluruh slot uji coba sedang terisi penuh."""
    def __init__(self, message: str = "Kapasitas 36 slot uji coba saat ini sedang terisi penuh. Silakan hubungi tim solusi atau coba beberapa saat lagi."):
        super().__init__(message)
        self.message = message


class ProspectNotFoundError(Exception):
    """Exception ketika prospek tidak ditemukan."""
    pass


class TrialAllocationError(Exception):
    """Exception kegagalan operasional alokasi trial."""
    pass


class TrialSlotAllocationService:
    @staticmethod
    def get_platform_trial_config(conn) -> Dict[str, Any]:
        """
        Membaca kapasitas slot, durasi uji coba, dan kuota kredit awal dari platform_settings.
        TIDAK MENGGUNAKAN konstanta kode statis.
        """
        rows = conn.execute(
            sa.text("""
                SELECT key, value 
                FROM platform_settings 
                WHERE key IN ('trial_slot_capacity', 'trial_duration_days', 'trial_initial_credits');
            """)
        ).mappings().all()

        config = {
            "capacity": 36,
            "duration_days": 7,
            "initial_credits": 1000
        }

        for r in rows:
            val = r["value"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except Exception:
                    val = {}
            if r["key"] == "trial_slot_capacity":
                config["capacity"] = int(val.get("capacity", 36))
            elif r["key"] == "trial_duration_days":
                config["duration_days"] = int(val.get("days", 7))
            elif r["key"] == "trial_initial_credits":
                config["initial_credits"] = int(val.get("credits", 1000))

        return config

    @classmethod
    def allocate_slot_atomically(
        cls,
        prospect_id: str,
        engine=None
    ) -> Dict[str, Any]:
        """
        Alokasi slot trial atomik dengan isolasi konkurensi ketat.
        Menggunakan SELECT ... FOR UPDATE SKIP LOCKED untuk mencegah double booking / reservasi ganda.
        """
        db_engine = engine or get_database_engine()
        now_dt = datetime.now(timezone.utc)

        with db_engine.connect() as conn:
            with conn.begin():
                # 1. Baca konfigurasi platform dinamis
                config = cls.get_platform_trial_config(conn)
                capacity = config["capacity"]
                duration_days = config["duration_days"]
                expires_at = now_dt + timedelta(days=duration_days)

                # 2. Pastikan prospek ada
                prospect_row = conn.execute(
                    sa.text("SELECT id, full_name, work_email, trial_status FROM prospects WHERE id = :id FOR UPDATE"),
                    {"id": prospect_id}
                ).mappings().first()

                if not prospect_row:
                    raise ProspectNotFoundError(f"Prospek dengan id '{prospect_id}' tidak ditemukan.")

                # 3. Kueri slot pertama yang AVAILABLE dengan row-level lock SKIP LOCKED
                # Pembatasan slot_number <= capacity memastikan kepatuhan terhadap batas platform_settings
                slot_row = conn.execute(
                    sa.text("""
                        SELECT id, slot_number 
                        FROM trial_slots 
                        WHERE status = 'AVAILABLE' AND slot_number <= :capacity
                        ORDER BY slot_number ASC 
                        LIMIT 1 
                        FOR UPDATE SKIP LOCKED;
                    """),
                    {"capacity": capacity}
                ).mappings().first()

                if not slot_row:
                    logger.warning(f"Kapasitas {capacity} slot uji coba habis saat alokasi prospek {prospect_id}.")
                    raise SlotCapacityExhaustedError(
                        f"Kapasitas {capacity} slot uji coba saat ini sedang terisi penuh. Silakan hubungi tim solusi atau coba beberapa saat lagi."
                    )

                slot_id = str(slot_row["id"])
                slot_number = int(slot_row["slot_number"])

                # 4. Update status slot menjadi RESERVED
                conn.execute(
                    sa.text("""
                        UPDATE trial_slots 
                        SET status = 'RESERVED',
                            prospect_id = :prospect_id,
                            reserved_at = :now,
                            expires_at = :expires_at,
                            updated_at = :now
                        WHERE id = :slot_id;
                    """),
                    {
                        "slot_id": slot_id,
                        "prospect_id": prospect_id,
                        "now": now_dt,
                        "expires_at": expires_at,
                    }
                )

                # 5. Perbarui status prospek
                conn.execute(
                    sa.text("""
                        UPDATE prospects 
                        SET trial_status = 'SELECTED',
                            assigned_slot_number = :slot_number,
                            updated_at = :now
                        WHERE id = :prospect_id;
                    """),
                    {
                        "prospect_id": prospect_id,
                        "slot_number": slot_number,
                        "now": now_dt,
                    }
                )

                return {
                    "slot_id": slot_id,
                    "slot_number": slot_number,
                    "prospect_id": prospect_id,
                    "status": "RESERVED",
                    "duration_days": duration_days,
                    "reserved_at": now_dt.isoformat(),
                    "expires_at": expires_at.isoformat(),
                }

    @classmethod
    def activate_trial(
        cls,
        prospect_id: str,
        tenant_id: str,
        activated_by: Optional[str] = None,
        notes: Optional[str] = None,
        engine=None
    ) -> Dict[str, Any]:
        """
        Mengaktifkan tenant uji coba resmi dari prospek yang telah memperoleh slot reservasi.
        Mengalokasikan kredit kerja awal (default 1,000 credit) ke tenant.
        """
        db_engine = engine or get_database_engine()
        now_dt = datetime.now(timezone.utc)

        with db_engine.connect() as conn:
            with conn.begin():
                config = cls.get_platform_trial_config(conn)
                initial_credits = config["initial_credits"]
                duration_days = config["duration_days"]
                expires_at = now_dt + timedelta(days=duration_days)

                # Temukan slot reservasi untuk prospek ini
                slot_row = conn.execute(
                    sa.text("""
                        SELECT id, slot_number, status 
                        FROM trial_slots 
                        WHERE prospect_id = :prospect_id 
                        FOR UPDATE;
                    """),
                    {"prospect_id": prospect_id}
                ).mappings().first()

                if not slot_row:
                    raise TrialAllocationError(f"Tidak ada slot trial yang dialokasikan untuk prospek '{prospect_id}'.")

                slot_id = str(slot_row["id"])
                slot_number = int(slot_row["slot_number"])

                # Update slot ke ALLOCATED
                conn.execute(
                    sa.text("""
                        UPDATE trial_slots 
                        SET status = 'ALLOCATED',
                            tenant_id = :tenant_id,
                            allocated_at = :now,
                            expires_at = :expires_at,
                            updated_at = :now
                        WHERE id = :slot_id;
                    """),
                    {
                        "slot_id": slot_id,
                        "tenant_id": tenant_id,
                        "now": now_dt,
                        "expires_at": expires_at,
                    }
                )

                # Masukkan ke trial_activations
                activation_id = conn.execute(
                    sa.text("""
                        INSERT INTO trial_activations (
                            slot_id, prospect_id, tenant_id, initial_credits, credits_remaining,
                            started_at, expires_at, status, activated_by, notes, created_at, updated_at
                        ) VALUES (
                            :slot_id, :prospect_id, :tenant_id, :initial_credits, :initial_credits,
                            :now, :expires_at, 'ACTIVE', :activated_by, :notes, :now, :now
                        ) RETURNING id;
                    """),
                    {
                        "slot_id": slot_id,
                        "prospect_id": prospect_id,
                        "tenant_id": tenant_id,
                        "initial_credits": initial_credits,
                        "now": now_dt,
                        "expires_at": expires_at,
                        "activated_by": activated_by,
                        "notes": notes,
                    }
                ).scalar()

                # Perbarui status prospek
                conn.execute(
                    sa.text("""
                        UPDATE prospects 
                        SET trial_status = 'ACTIVE',
                            trial_credits_allocated = :credits,
                            trial_notes = :notes,
                            updated_at = :now
                        WHERE id = :prospect_id;
                    """),
                    {
                        "prospect_id": prospect_id,
                        "credits": initial_credits,
                        "notes": notes,
                        "now": now_dt,
                    }
                )

                # Alokasikan kredit ke tenant_credit_wallet jika tabel tersedia
                try:
                    conn.execute(
                        sa.text("""
                            INSERT INTO tenant_credit_wallet (
                                tenant_id, balance, reserved_credits, lifetime_granted, updated_at
                            ) VALUES (
                                :tenant_id, :initial_credits, 0, :initial_credits, :now
                            )
                            ON CONFLICT (tenant_id) DO UPDATE SET 
                                balance = tenant_credit_wallet.balance + EXCLUDED.balance,
                                lifetime_granted = tenant_credit_wallet.lifetime_granted + EXCLUDED.lifetime_granted,
                                updated_at = EXCLUDED.updated_at;
                        """),
                        {
                            "tenant_id": tenant_id,
                            "initial_credits": initial_credits,
                            "now": now_dt,
                        }
                    )
                except Exception as w_exc:
                    logger.warning(f"Dompet kredit tenant gagal diperbarui: {w_exc}")

                return {
                    "activation_id": str(activation_id),
                    "slot_number": slot_number,
                    "prospect_id": prospect_id,
                    "tenant_id": tenant_id,
                    "initial_credits": initial_credits,
                    "expires_at": expires_at.isoformat(),
                    "status": "ACTIVE"
                }

    @classmethod
    def get_slots_status(cls, engine=None) -> Dict[str, Any]:
        """Membaca status real-time 36 slot trial untuk dashboard admin."""
        db_engine = engine or get_database_engine()
        with db_engine.connect() as conn:
            config = cls.get_platform_trial_config(conn)
            capacity = config["capacity"]

            rows = conn.execute(
                sa.text("""
                    SELECT 
                        s.id, s.slot_number, s.status, s.prospect_id, s.tenant_id,
                        s.reserved_at, s.allocated_at, s.expires_at,
                        p.full_name as prospect_name, p.company_name, p.work_email,
                        t.name as tenant_name
                    FROM trial_slots s
                    LEFT JOIN prospects p ON s.prospect_id = p.id
                    LEFT JOIN tenants t ON s.tenant_id = t.id
                    WHERE s.slot_number <= :capacity
                    ORDER BY s.slot_number ASC;
                """),
                {"capacity": capacity}
            ).mappings().all()

            slots_data = []
            counts = {"AVAILABLE": 0, "RESERVED": 0, "ALLOCATED": 0, "EXPIRED": 0}

            for r in rows:
                st = r["status"]
                counts[st] = counts.get(st, 0) + 1
                slots_data.append({
                    "id": str(r["id"]),
                    "slot_number": int(r["slot_number"]),
                    "status": st,
                    "prospect_id": str(r["prospect_id"]) if r["prospect_id"] else None,
                    "prospect_name": r["prospect_name"],
                    "company_name": r["company_name"],
                    "work_email": r["work_email"],
                    "tenant_name": r["tenant_name"],
                    "reserved_at": r["reserved_at"].isoformat() if r["reserved_at"] else None,
                    "allocated_at": r["allocated_at"].isoformat() if r["allocated_at"] else None,
                    "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
                })

            return {
                "capacity": capacity,
                "duration_days": config["duration_days"],
                "initial_credits": config["initial_credits"],
                "counts": counts,
                "available_count": counts.get("AVAILABLE", 0),
                "slots": slots_data
            }
