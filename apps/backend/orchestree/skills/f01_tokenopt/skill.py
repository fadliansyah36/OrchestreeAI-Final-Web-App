"""
F.01-TOKENOPT: Autonomous Token Optimization & Semantic Caching Skill (PRD v2.2 Bagian 11.8)

Komponen Utama:
1. Semantic Cache (pgvector cosine similarity search):
   - Mencocokkan kemiripan prompt dengan ambang batas (default >= 0.92).
   - Menghasilkan respons instan berlatensi rendah (~15-30ms) tanpa memanggil provider LLM eksternal.
   - Menghemat 100% token keluaran dan biaya inferensi saat terjadi cache hit.
2. Automatic Model Tiering:
   - Klasifikasi kompleksitas tugas secara dinamis (Tier 1: Ringan, Tier 2: Standar, Tier 3: Penalaran Tinggi).
   - Menurunkan konsumsi kredit/biaya dengan mengarahkan tugas sederhana ke model yang tepat.
3. Telemetri & Audit Log Penghematan Nyata:
   - Pencatatan detail sebelum/sesudah optimasi ke tabel `token_savings_log`.
   - Analisis penghematan biaya aktual (USD), token terselamatkan, dan pengurangan latensi.
"""

import os
import re
import time
import uuid
import json
import logging
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple, Callable
from decimal import Decimal
import sqlalchemy as sa

from app.core.database import get_database_engine

logger = logging.getLogger("orchestree.skills.f01_tokenopt")


class ModelTier(str, Enum):
    TIER_1_LIGHTWEIGHT = "TIER_1_LIGHTWEIGHT"
    TIER_2_BALANCED = "TIER_2_BALANCED"
    TIER_3_REASONING = "TIER_3_REASONING"


# Tarif referensi komersial per 1.000 token (USD) untuk perbandingan biaya nyata
TIER_PRICING: Dict[ModelTier, Dict[str, Decimal]] = {
    ModelTier.TIER_1_LIGHTWEIGHT: {
        "prompt_per_1k": Decimal("0.000080"),
        "completion_per_1k": Decimal("0.000150"),
        "default_model": "meta/llama-3.2-3b-instruct",
        "description": "Model gesit untuk klasifikasi, ekstraksi intent, dan kueri ringkas",
    },
    ModelTier.TIER_2_BALANCED: {
        "prompt_per_1k": Decimal("0.000150"),
        "completion_per_1k": Decimal("0.000600"),
        "default_model": "meta/llama-3.2-11b-vision-instruct",
        "description": "Model seimbang untuk pembuatan draf, percakapan layanan, dan perangkuman",
    },
    ModelTier.TIER_3_REASONING: {
        "prompt_per_1k": Decimal("0.001250"),
        "completion_per_1k": Decimal("0.005000"),
        "default_model": "meta/llama-3.3-70b-instruct",
        "description": "Model penalaran mendalam untuk perencanaan strategi, analisis multi-langkah, dan kode",
    },
}

# Pola frasa kompleksitas tinggi yang mewajibkan Tier 3
HEAVY_REASONING_PATTERNS = [
    r"(?i)\banalisis\s+(?:mendalam|komprehensif|finansial|risiko)\b",
    r"(?i)\bperencanaan\s+strategis\b",
    r"(?i)\brekayasa\s+(?:arsitektur|sistem|perangkat\s+lunak)\b",
    r"(?i)\baudit\s+(?:keuangan|kepatuhan|kontrak)\b",
    r"(?i)\bmulti[- ]step\s+(?:reasoning|algorithm|proof)\b",
    r"(?i)\boptimasi\s+portofolio\b",
    r"(?i)\bsimulasi\s+skenario\b",
]

# Pola frasa klasifikasi / kueri ringan untuk Tier 1
LIGHTWEIGHT_PATTERNS = [
    r"(?i)^(?:ya|tidak|benar|salah)\b",
    r"(?i)\bklasifikasikan\s+(?:sentimen|kategori|intent)\b",
    r"(?i)\bapakah\s+(?:ini|pesan|data)\s+(?:positif|negatif|netral)\b",
    r"(?i)\bekstraksi\s+(?:tanggal|nomor|nama|email)\b",
    r"(?i)\bformat\s+(?:ulang|json|nomor)\b",
]


class ModelTieringEngine:
    """Mesin klasifikasi kompleksitas prompt dan alokasi model otomatis."""

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Estimasi token berdasar rasio karakter (1 token ~ 3.8 karakter)."""
        if not text:
            return 0
        return max(1, int(len(text) / 3.8))

    @classmethod
    def classify_task_tier(
        cls,
        task_type: str,
        prompt: str,
        system_prompt: Optional[str] = None,
    ) -> Tuple[ModelTier, str, Dict[str, Any]]:
        """
        Menganalisis prompt dan menentukan tier model yang paling efisien.
        Mengembalikan: (tier, suggested_model_id, metrics)
        """
        combined = f"{system_prompt or ''} {prompt}".strip()
        est_tokens = cls.estimate_tokens(combined)

        # 1. Periksa kriteria Tier 3 (Penalaran Kompleks)
        if task_type in ("planning", "complex_reasoning", "code_architecture"):
            tier = ModelTier.TIER_3_REASONING
            reason = "Task type memerlukan penalaran tingkat tinggi"
        elif est_tokens > 800:
            tier = ModelTier.TIER_3_REASONING
            reason = "Panjang konteks masukan melebihi 800 token"
        elif any(re.search(pattern, combined) for pattern in HEAVY_REASONING_PATTERNS):
            tier = ModelTier.TIER_3_REASONING
            reason = "Ditemukan kata kunci analisis strategis/finansial tingkat tinggi"
        # 2. Periksa kriteria Tier 1 (Ringan / Klasifikasi)
        elif task_type in ("classification", "intent_detection", "sentiment_analysis"):
            tier = ModelTier.TIER_1_LIGHTWEIGHT
            reason = "Task type klasifikasi langsung atau ekstraksi intent"
        elif est_tokens < 60 and any(re.search(pattern, combined) for pattern in LIGHTWEIGHT_PATTERNS):
            tier = ModelTier.TIER_1_LIGHTWEIGHT
            reason = "Prompt ringkas dengan pola kueri biner atau ekstraksi langsung"
        # 3. Default ke Tier 2 (Standar / Seimbang)
        else:
            tier = ModelTier.TIER_2_BALANCED
            reason = "Tugas percakapan atau pembuatan draf standar"

        model_id = TIER_PRICING[tier]["default_model"]
        metrics = {
            "tier": tier.value,
            "reason": reason,
            "estimated_prompt_tokens": est_tokens,
            "suggested_model": model_id,
            "benchmark_tier": ModelTier.TIER_3_REASONING.value,
        }
        return tier, model_id, metrics


class SemanticCacheEngine:
    """Mesin Semantic Cache berbasis pencarian kesamaan vektor pgvector."""

    def __init__(self, similarity_threshold: float = 0.92):
        self.similarity_threshold = similarity_threshold

    @staticmethod
    def _format_vector(vector: List[float]) -> str:
        return f"[{','.join(f'{x:.6f}' for x in vector)}]"

    async def lookup(
        self,
        tenant_id: str,
        task_type: str,
        prompt_embedding: List[float],
        threshold: Optional[float] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Mencari respons di cache yang memiliki kemiripan kosinus >= threshold.
        Mengembalikan entri cache bila ditemukan, atau None bila miss.
        """
        effective_threshold = threshold if threshold is not None else self.similarity_threshold
        vector_str = self._format_vector(prompt_embedding)

        engine = get_database_engine()
        query = sa.text("""
            SELECT 
                id,
                tenant_id,
                task_type,
                prompt_text,
                model_tier,
                provider_id,
                model_id,
                response_content,
                total_tokens,
                hit_count,
                1 - (prompt_embedding <=> :embedding::vector) AS similarity
            FROM semantic_prompt_cache
            WHERE tenant_id = :tenant_id
              AND task_type = :task_type
              AND (1 - (prompt_embedding <=> :embedding::vector)) >= :threshold
            ORDER BY similarity DESC
            LIMIT 1;
        """)

        with engine.connect() as conn:
            # Set RLS session context
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": tenant_id},
            )
            result = conn.execute(
                query,
                {
                    "tenant_id": tenant_id,
                    "task_type": task_type,
                    "embedding": vector_str,
                    "threshold": effective_threshold,
                },
            ).mappings().first()

            if result:
                # Perbarui hit_count dan timestamp akses terakhir
                cache_id = result["id"]
                conn.execute(
                    sa.text("""
                        UPDATE semantic_prompt_cache
                        SET hit_count = hit_count + 1,
                            last_accessed_at = now(),
                            updated_at = now()
                        WHERE id = :cache_id;
                    """),
                    {"cache_id": cache_id},
                )
                conn.commit()
                return dict(result)

        return None

    async def store(
        self,
        tenant_id: str,
        task_type: str,
        prompt_text: str,
        prompt_embedding: List[float],
        model_tier: str,
        provider_id: str,
        model_id: str,
        response_content: str,
        total_tokens: int,
    ) -> str:
        """Menyimpan entri hasil inferensi baru ke semantic_prompt_cache."""
        vector_str = self._format_vector(prompt_embedding)
        engine = get_database_engine()

        query = sa.text("""
            INSERT INTO semantic_prompt_cache (
                tenant_id,
                task_type,
                prompt_text,
                prompt_embedding,
                model_tier,
                provider_id,
                model_id,
                response_content,
                total_tokens
            ) VALUES (
                :tenant_id,
                :task_type,
                :prompt_text,
                :embedding::vector,
                :model_tier,
                :provider_id,
                :model_id,
                :response_content,
                :total_tokens
            )
            RETURNING id;
        """)

        with engine.connect() as conn:
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": tenant_id},
            )
            res = conn.execute(
                query,
                {
                    "tenant_id": tenant_id,
                    "task_type": task_type,
                    "prompt_text": prompt_text,
                    "embedding": vector_str,
                    "model_tier": model_tier,
                    "provider_id": provider_id,
                    "model_id": model_id,
                    "response_content": response_content,
                    "total_tokens": total_tokens,
                },
            ).fetchone()
            conn.commit()
            return str(res[0]) if res else ""


class TokenSavingsLogger:
    """Pencatat audit telemetri penghematan biaya dan token ke token_savings_log."""

    @staticmethod
    def calculate_cost(tier: ModelTier, prompt_tokens: int, completion_tokens: int) -> Decimal:
        """Menghitung estimasi biaya inferensi LLM dalam USD."""
        pricing = TIER_PRICING.get(tier, TIER_PRICING[ModelTier.TIER_2_BALANCED])
        p_cost = (Decimal(prompt_tokens) / Decimal(1000)) * pricing["prompt_per_1k"]
        c_cost = (Decimal(completion_tokens) / Decimal(1000)) * pricing["completion_per_1k"]
        return p_cost + c_cost

    @classmethod
    async def log_savings(
        cls,
        tenant_id: str,
        task_type: str,
        cache_hit: bool,
        original_prompt_tokens: int,
        tokens_saved: int,
        cost_without_cache_usd: Decimal,
        cost_with_cache_usd: Decimal,
        latency_saved_ms: int,
        model_tier_selected: str,
        model_id_selected: str,
        similarity_score: Optional[float] = None,
        request_id: Optional[str] = None,
    ) -> str:
        """Menyimpan catatan penghematan ke tabel token_savings_log."""
        cost_saved_usd = max(Decimal("0.000000"), cost_without_cache_usd - cost_with_cache_usd)
        engine = get_database_engine()

        query = sa.text("""
            INSERT INTO token_savings_log (
                tenant_id,
                request_id,
                cache_hit,
                task_type,
                original_prompt_tokens,
                tokens_saved,
                cost_without_cache_usd,
                cost_with_cache_usd,
                cost_saved_usd,
                latency_saved_ms,
                model_tier_selected,
                model_id_selected,
                similarity_score
            ) VALUES (
                :tenant_id,
                :request_id,
                :cache_hit,
                :task_type,
                :original_prompt_tokens,
                :tokens_saved,
                :cost_without_cache_usd,
                :cost_with_cache_usd,
                :cost_saved_usd,
                :latency_saved_ms,
                :model_tier_selected,
                :model_id_selected,
                :similarity_score
            )
            RETURNING id;
        """)

        with engine.connect() as conn:
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": tenant_id},
            )
            res = conn.execute(
                query,
                {
                    "tenant_id": tenant_id,
                    "request_id": request_id or str(uuid.uuid4()),
                    "cache_hit": cache_hit,
                    "task_type": task_type,
                    "original_prompt_tokens": original_prompt_tokens,
                    "tokens_saved": tokens_saved,
                    "cost_without_cache_usd": float(cost_without_cache_usd),
                    "cost_with_cache_usd": float(cost_with_cache_usd),
                    "cost_saved_usd": float(cost_saved_usd),
                    "latency_saved_ms": latency_saved_ms,
                    "model_tier_selected": model_tier_selected,
                    "model_id_selected": model_id_selected,
                    "similarity_score": similarity_score,
                },
            ).fetchone()
            conn.commit()
            return str(res[0]) if res else ""


class F01TokenOptSkill:
    """
    Skill Orkestrasi F.01-TOKENOPT.
    Berfungsi sebagai middleware pintar pada Model Router untuk:
    1. Mengoptimalkan pemilihan model berdasarkan tier tugas.
    2. Melakukan pencarian semantic cache (pgvector cosine similarity).
    3. Menyimpan hasil inferensi baru dan mengaudit penghematan token secara presisi.
    """

    def __init__(self, similarity_threshold: float = 0.92):
        self.tiering_engine = ModelTieringEngine()
        self.cache_engine = SemanticCacheEngine(similarity_threshold=similarity_threshold)
        self.savings_logger = TokenSavingsLogger()
        self.similarity_threshold = similarity_threshold

    async def inspect_and_intercept(
        self,
        tenant_id: str,
        task_type: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        preferred_model: Optional[str] = None,
        embed_fn: Optional[Callable[[str], Any]] = None,
        request_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[Dict[str, Any]], Dict[str, Any]]:
        """
        Pemeriksaan pra-inferensi:
        1. Model tiering otomatis
        2. Pencarian pgvector similarity cache
        
        Mengembalikan: (is_cache_hit, cached_payload_or_none, optimization_context)
        """
        # 1. Klasifikasi model tiering
        tier, suggested_model, tiering_metrics = self.tiering_engine.classify_task_tier(
            task_type=task_type,
            prompt=prompt,
            system_prompt=system_prompt,
        )

        selected_model = preferred_model or suggested_model
        est_prompt_tokens = tiering_metrics["estimated_prompt_tokens"]

        context = {
            "tier": tier,
            "selected_model": selected_model,
            "tiering_metrics": tiering_metrics,
            "estimated_prompt_tokens": est_prompt_tokens,
            "prompt_embedding": None,
            "request_id": request_id or str(uuid.uuid4()),
        }

        # 2. Jika embedding function disediakan, lakukan pencarian semantic cache
        if embed_fn and tenant_id:
            try:
                embedding = await embed_fn(prompt)
                context["prompt_embedding"] = embedding

                cached = await self.cache_engine.lookup(
                    tenant_id=tenant_id,
                    task_type=task_type,
                    prompt_embedding=embedding,
                    threshold=self.similarity_threshold,
                )

                if cached:
                    # CACHE HIT!
                    tokens_saved = cached["total_tokens"]
                    # Biaya jika tanpa cache (skenario provider eksternal)
                    cost_without_cache = self.savings_logger.calculate_cost(
                        tier=tier,
                        prompt_tokens=est_prompt_tokens,
                        completion_tokens=max(1, tokens_saved - est_prompt_tokens),
                    )
                    # Biaya dengan cache = 0.000000 USD
                    cost_with_cache = Decimal("0.000000")
                    latency_saved_ms = 1150  # Estimasi rata-rata latensi provider yang dihemat

                    # Catat ke token_savings_log
                    await self.savings_logger.log_savings(
                        tenant_id=tenant_id,
                        task_type=task_type,
                        cache_hit=True,
                        original_prompt_tokens=est_prompt_tokens,
                        tokens_saved=tokens_saved,
                        cost_without_cache_usd=cost_without_cache,
                        cost_with_cache_usd=cost_with_cache,
                        latency_saved_ms=latency_saved_ms,
                        model_tier_selected=tier.value,
                        model_id_selected=selected_model,
                        similarity_score=float(cached["similarity"]),
                        request_id=context["request_id"],
                    )

                    return True, cached, context
            except Exception as e:
                logger.warning(f"Error pada pencarian semantic cache: {e}")

        # CACHE MISS
        return False, None, context

    async def record_new_completion(
        self,
        tenant_id: str,
        task_type: str,
        prompt: str,
        response_content: str,
        provider_id: str,
        model_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        latency_ms: int,
        context: Dict[str, Any],
    ) -> None:
        """Menyimpan hasil generasi baru ke semantic_prompt_cache dan mencatat telemetri."""
        tier: ModelTier = context.get("tier", ModelTier.TIER_2_BALANCED)
        embedding = context.get("prompt_embedding")

        # 1. Simpan ke semantic cache bila embedding tersedia
        if embedding and tenant_id and response_content:
            try:
                await self.cache_engine.store(
                    tenant_id=tenant_id,
                    task_type=task_type,
                    prompt_text=prompt,
                    prompt_embedding=embedding,
                    model_tier=tier.value,
                    provider_id=provider_id,
                    model_id=model_id,
                    response_content=response_content,
                    total_tokens=total_tokens,
                )
            except Exception as e:
                logger.warning(f"Gagal menyimpan ke semantic_prompt_cache: {e}")

        # 2. Catat audit miss / tiering savings ke token_savings_log
        try:
            # Perbandingan biaya: jika tugas dijalankan di Tier 3 (benchmark) vs tier aktual
            cost_tier3 = self.savings_logger.calculate_cost(
                ModelTier.TIER_3_REASONING, prompt_tokens, completion_tokens
            )
            cost_actual = self.savings_logger.calculate_cost(
                tier, prompt_tokens, completion_tokens
            )

            # Jika model tiering berhasil menghemat biaya dibanding Tier 3
            tiering_saved = max(Decimal("0.000000"), cost_tier3 - cost_actual)

            await self.savings_logger.log_savings(
                tenant_id=tenant_id,
                task_type=task_type,
                cache_hit=False,
                original_prompt_tokens=prompt_tokens,
                tokens_saved=0,
                cost_without_cache_usd=cost_tier3 if tiering_saved > 0 else cost_actual,
                cost_with_cache_usd=cost_actual,
                latency_saved_ms=0,
                model_tier_selected=tier.value,
                model_id_selected=model_id,
                similarity_score=None,
                request_id=context.get("request_id"),
            )
        except Exception as e:
            logger.warning(f"Gagal mencatat log token_savings_log: {e}")

    async def get_summary(self, tenant_id: str) -> Dict[str, Any]:
        """Menghasilkan ringkasan analitik penghematan token nyata untuk tenant."""
        engine = get_database_engine()
        query = sa.text("""
            SELECT 
                COUNT(*) AS total_queries,
                COALESCE(SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END), 0) AS cache_hits,
                COALESCE(SUM(CASE WHEN NOT cache_hit THEN 1 ELSE 0 END), 0) AS cache_misses,
                COALESCE(SUM(tokens_saved), 0) AS total_tokens_saved,
                COALESCE(SUM(cost_saved_usd), 0.0) AS total_cost_saved_usd,
                COALESCE(SUM(cost_with_cache_usd), 0.0) AS total_cost_spent_usd,
                COALESCE(SUM(cost_without_cache_usd), 0.0) AS total_cost_baseline_usd,
                COALESCE(AVG(CASE WHEN cache_hit THEN latency_saved_ms ELSE NULL END), 0.0) AS avg_latency_saved_ms
            FROM token_savings_log
            WHERE tenant_id = :tenant_id;
        """)

        with engine.connect() as conn:
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": tenant_id},
            )
            row = conn.execute(query, {"tenant_id": tenant_id}).mappings().first()

            if not row:
                return {
                    "total_queries": 0,
                    "cache_hits": 0,
                    "cache_misses": 0,
                    "cache_hit_rate_pct": 0.0,
                    "total_tokens_saved": 0,
                    "total_cost_saved_usd": 0.0,
                    "total_cost_spent_usd": 0.0,
                    "total_cost_baseline_usd": 0.0,
                    "avg_latency_saved_ms": 0.0,
                }

            total = int(row["total_queries"] or 0)
            hits = int(row["cache_hits"] or 0)
            hit_rate = round((hits / total * 100), 2) if total > 0 else 0.0

            return {
                "total_queries": total,
                "cache_hits": hits,
                "cache_misses": int(row["cache_misses"] or 0),
                "cache_hit_rate_pct": hit_rate,
                "total_tokens_saved": int(row["total_tokens_saved"] or 0),
                "total_cost_saved_usd": float(row["total_cost_saved_usd"] or 0.0),
                "total_cost_spent_usd": float(row["total_cost_spent_usd"] or 0.0),
                "total_cost_baseline_usd": float(row["total_cost_baseline_usd"] or 0.0),
                "avg_latency_saved_ms": round(float(row["avg_latency_saved_ms"] or 0.0), 1),
            }

    async def get_logs(self, tenant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Mengambil riwayat log penghematan terbaru untuk tenant."""
        engine = get_database_engine()
        query = sa.text("""
            SELECT 
                id,
                request_id,
                cache_hit,
                task_type,
                original_prompt_tokens,
                tokens_saved,
                cost_without_cache_usd,
                cost_with_cache_usd,
                cost_saved_usd,
                latency_saved_ms,
                model_tier_selected,
                model_id_selected,
                similarity_score,
                created_at
            FROM token_savings_log
            WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
            LIMIT :limit;
        """)

        with engine.connect() as conn:
            conn.execute(
                sa.text("SELECT set_config('app.tenant_id', :val, true);"),
                {"val": tenant_id},
            )
            rows = conn.execute(query, {"tenant_id": tenant_id, "limit": limit}).mappings().all()
            return [dict(r) for r in rows]


_tokenopt_skill_instance: Optional[F01TokenOptSkill] = None


def get_tokenopt_skill(similarity_threshold: float = 0.92) -> F01TokenOptSkill:
    """Mengambil atau menginisialisasi singleton instance F01TokenOptSkill."""
    global _tokenopt_skill_instance
    if _tokenopt_skill_instance is None:
        _tokenopt_skill_instance = F01TokenOptSkill(similarity_threshold=similarity_threshold)
    return _tokenopt_skill_instance
