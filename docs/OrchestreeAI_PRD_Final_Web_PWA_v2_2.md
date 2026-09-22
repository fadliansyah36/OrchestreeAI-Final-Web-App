# OrchestreeAI — Master PRD & Design System v2.2 (FINAL, TERPADU)
### Autonomous AI Workforce Operating System — Website PWA, Dibangun dari Nol

**Status dokumen:** Menggantikan sepenuhnya — Master PRD v1.0 (Kotlin/Android), PRD Addendum 1 (Omnichannel Sales & Marketing), PRD Addendum 2 (Enterprise AI Workforce), dan seluruh konsolidasi sebelumnya. Dokumen ini adalah **satu-satunya sumber kebenaran** untuk pengembangan OrchestreeAI mulai dari nol berbasis **Website PWA**. Tidak ada bagian dari dokumen sumber Kotlin/Android yang berlaku lagi kecuali logika bisnis (algoritma, skema data, state machine) yang diporting eksplisit ke Python di dokumen ini.

**Versi:** 2.2-FINAL • **Backend:** Python (FastAPI) • **Database/Auth/Storage/Realtime:** Supabase (Postgres 15 + pgvector) • **Frontend:** Next.js (React) + Tailwind CSS, PWA-first • **Model Router:** NVIDIA NIM (seluruh model) → OpenRouter (seluruh model, fallback) untuk teks; GPT-Image-2 (prioritas 1) → NVIDIA NIM/OpenRouter Image (fallback) untuk gambar; Gemini untuk multimodal/long-context • **Repositori:** `orchestree-backend`, `orchestree-client`, `orchestree-admin`.

**Prinsip wajib mutlak di seluruh dokumen ini (tidak bisa dikompromikan pada tahap implementasi mana pun):**
> **Real Data — Tanpa Data Tiruan, Simulasi, Skenario Buatan, atau Hardcode.** Setiap prompt tahap pengembangan pertama WAJIB langsung tersambung ke Supabase sungguhan, Model Router dengan LLM sungguhan, Orchestration Engine sungguhan, kredensial channel/payment sungguhan (sandbox resmi provider diperbolehkan, mock buatan sendiri dilarang keras), dan lapisan security produksi sejak baris kode pertama.

Lihat ringkasan lengkap PRD v2.2 pada instruksi inisiasi sistem.
