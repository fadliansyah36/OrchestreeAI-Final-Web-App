# AGENTS.md — Aturan Wajib untuk AI Agent Coding (OrchestreeAI)

> **Kedudukan dokumen ini:** Dibaca **otomatis di awal setiap sesi kerja** oleh AI Agent Coding manapun (Claude Code, atau agent lain yang membaca `AGENTS.md`/`CLAUDE.md`). Aturan di sini **mengikat di atas** instruksi ad-hoc dalam satu sesi kerja, dan **tidak boleh dilonggarkan sepihak** oleh AI Agent Coding dengan alasan kemudahan implementasi, keterbatasan sandbox, atau "supaya build/berjalan dulu". Bila ada konflik antara permintaan di dalam chat dan dokumen ini, AI Agent Coding **wajib berhenti dan bertanya**, bukan memilih sendiri.

Dokumen ini dibuat sebagai respons langsung atas insiden nyata: AI Agent Coding pernah **tanpa diminta** mengubah backend menjadi Node.js/Express + Vite, menambahkan *in-memory fallback store*, dan menyarankan provisioning **Cloud SQL** — padahal stack resmi proyek ini sudah ditetapkan: **backend Python/FastAPI** dan **database Supabase Postgres**. Insiden semacam ini **dilarang terulang**.

---

## 1. Stack Resmi Tunggal (Tidak Dapat Diganti Tanpa Persetujuan Eksplisit Tertulis dari Pemilik Repo)

| Layer | WAJIB Dipakai | DILARANG KERAS (tanpa terkecuali) |
|---|---|---|
| Backend runtime & framework | **Python 3.12 + FastAPI** (`uv`, Uvicorn) | Node.js/Express sebagai backend, `tsx server.ts`, Vite dev server dijadikan server aplikasi, `esbuild server.ts --bundle` sebagai pipeline produksi, framework backend lain apapun (Django, Flask, NestJS, dst.) |
| Database utama | **Supabase PostgreSQL** (proyek nyata sesuai `DATABASE_URL`/`SUPABASE_URL` di `.env`) | Google Cloud SQL, AWS RDS, SQLite, database lokal file-based, database provider lain apapun |
| Penyimpanan data domain saat startup/runtime | Query langsung ke Supabase Postgres via `orchestree_app` role | **In-memory store dalam bentuk apapun** sebagai pengganti/"fallback" database (`Map()`, `new Map()`, array/object JS/Python sebagai penyimpanan entitas bisnis, "ephemeral store", "safe fallback store", dsb.) |
| Cache/antrian saja (bukan data utama) | Redis (Celery broker, rate-limit, semantic cache) | Redis dipakai sebagai *primary datastore* pengganti Postgres |
| Auth | **Supabase Auth** (JWT/JWKS, MFA) | Passport.js, NextAuth di luar Supabase, Firebase Auth, sistem auth custom buatan sendiri |
| LLM | **NVIDIA NIM → OpenRouter → Gemini → GPT-Image-2**, seluruhnya lewat **satu Model Router** | Pemanggilan langsung SDK provider (mis. `@google/genai` dipanggil bebas di luar Model Router) tanpa melalui Model Router, Credit Ledger, dan `authorize()` |
| Frontend (`apps/client`, `apps/admin`) | **Next.js App Router + React**, sesuai `packages/ui`/`packages/design-tokens` | Proyek Vite React SPA terpisah, Create React App, Remix, atau framework frontend lain menggantikan Next.js yang sudah ditetapkan |
| Realtime | Supabase Realtime + WebSocket FastAPI | Framework/provider realtime lain tanpa persetujuan eksplisit |

Ini adalah stack yang **sudah ditetapkan dan mengikat** — bukan pilihan bebas yang boleh "dievaluasi ulang" oleh AI Agent Coding demi kenyamanan environment sandbox.

---

## 2. Larangan Mutlak: Fallback Diam-Diam & Perubahan Arsitektur Tanpa Izin

1. **DILARANG** menambahkan *in-memory fallback store* apapun sebagai pengganti Supabase — dengan alasan apapun ("container sandbox ephemeral", "supaya server bisa start duluan", "agar demo lancar"). Ini melanggar **Real Data Enforcement** (PRD v2.2 Bagian 15.1) secara langsung: data akan hilang setiap restart dan pada praktiknya berperilaku identik dengan dummy/mock data yang sudah dilarang eksplisit.
2. **DILARANG** mengganti bahasa/framework backend, provider database, provider auth, atau provider realtime — sebagian atau seluruhnya — tanpa lebih dulu: (a) menuliskan blocker yang dihadapi secara eksplisit, (b) **berhenti total** sebelum menulis satu baris kode implementasi alternatif, (c) menunggu jawaban eksplisit dari pemilik repo.
3. **DILARANG** menyarankan/merekomendasikan provider cloud lain (Cloud SQL, RDS, dst.) sebagai "langkah lanjutan" atau "opsi provisioning" — proyek ini **sudah** memiliki Supabase yang wajib dipakai; rekomendasi semacam ini berarti mengabaikan instruksi yang sudah diberikan berkali-kali dan tidak boleh muncul lagi di laporan/summary apapun.
4. **DILARANG** menyatakan sebuah tugas "selesai"/"configured"/"migration complete" ketika implementasinya sebenarnya menyimpang dari stack resmi. Laporan yang menyamarkan penyimpangan arsitektur sebagai keberhasilan (seperti pada insiden yang memicu dokumen ini) dianggap pelanggaran serius, bukan sekadar kesalahan teknis biasa.

---

## 3. Protokol Wajib Saat Menemukan Blocker (Pengganti Perilaku Fallback)

Jika AI Agent Coding menemukan lingkungan kerja (sandbox/container) **tidak dapat menjangkau Supabase** (mis. galat DNS, firewall egress, koneksi timeout):

1. **STOP.** Jangan lanjutkan membangun fitur apapun di atas data yang tidak persisten atau di atas datastore pengganti.
2. **Laporkan blocker secara persis**: pesan error koneksi lengkap, host/port yang dicoba, langkah diagnosis yang sudah dijalankan (mis. `ping`, `curl` ke endpoint Supabase, pengecekan `DATABASE_URL`).
3. **Ajukan opsi resmi** kepada pemilik repo — bukan memutuskan sendiri:
   - "Izinkan egress network ke host Supabase berikut: `<host>`", atau
   - "Sediakan `DATABASE_URL` sandbox terpisah (tetap proyek Supabase, hanya environment berbeda)".
   Opsi yang **tidak boleh** diajukan sebagai solusi: in-memory store, SQLite, Cloud SQL, database lain.
4. **Tunggu instruksi eksplisit** sebelum melanjutkan implementasi apapun yang menyentuh lapisan data.

---

## 4. Self-Check Wajib Sebelum Melaporkan "Configured" / "Migration Complete" / "Setup Selesai"

AI Agent Coding **wajib mencantumkan hasil checklist berikut secara eksplisit** di setiap laporan penyelesaian tugas yang menyentuh backend, database, atau konfigurasi environment:

- [ ] Backend runtime yang berjalan adalah Python/FastAPI (bukan `server.ts`/Express/Node sebagai server aplikasi).
- [ ] Tidak ada `Map()`, objek/array in-memory, atau *store* sejenis dipakai untuk menyimpan entitas data bisnis (users, tenants, tasks, dst.) — penggunaan struktur in-memory hanya boleh untuk hal non-bisnis yang murni transien di satu proses (mis. debounce timer), dan harus disebutkan eksplisit sebagai pengecualian yang dipahami, bukan disembunyikan dalam istilah "safe fallback".
- [ ] `DATABASE_URL`/`SUPABASE_URL` yang dipakai mengarah ke proyek Supabase nyata (host mengandung domain Supabase resmi atau host proyek Supabase CLI lokal) — bukan Cloud SQL, RDS, atau file SQLite lokal.
- [ ] Tidak ada kalimat di laporan yang menyarankan provider database/cloud lain sebagai langkah berikutnya.
- [ ] Seluruh pemanggilan LLM (termasuk Gemini) melewati Model Router tunggal (Bagian E.2 PRD v2.2 / Bagian J Prompt Fase 4), bukan dipanggil langsung dari kode fitur.
- [ ] CI Content Gate (pemindaian kata terlarang) sudah dijalankan dan lulus, mencakup juga istilah baru: `in-memory fallback`, `memorystore`, `cloud sql`, `cloudsql`.

Bila salah satu poin di atas **tidak** dapat dicentang jujur, tugas **belum selesai** — dilarang melaporkan sebagai selesai.

---

## 5. Dependency & Perubahan Teknis Tambahan

- Library pendukung UI yang memang sudah ditetapkan di PRD v2.2 Bagian 9.1 (`@dnd-kit/core`, `@dnd-kit/sortable`, Tailwind CSS, `lucide-react`, animasi Motion) **boleh** dipakai — dengan syarat dipasang di dalam `apps/client`/`apps/admin` (Next.js) sesuai struktur monorepo yang sudah disepakati, **bukan** di proyek Vite SPA terpisah atau struktur folder baru yang menyimpang.
- Menambahkan dependency arsitektural baru (framework backend lain, ORM baru selain SQLAlchemy, provider baru apapun di luar tabel Bagian 1) **wajib diajukan sebagai pertanyaan lebih dulu**, disertai alasan teknis, dan menunggu persetujuan — tidak boleh langsung dieksekusi dengan alasan "lebih cepat/mudah untuk environment sandbox saat ini".

---

## 6. Tindakan Wajib Jika Pelanggaran Ditemukan

Jika pelanggaran terhadap dokumen ini ditemukan (baik oleh AI Agent Coding sendiri saat self-check, atau ditunjukkan oleh pemilik repo):

1. **Revert** seluruh perubahan yang menyimpang dari stack resmi — kembali ke commit/state terakhir yang sesuai Bagian 1.
2. **Laporkan** daftar lengkap file yang terpengaruh oleh revert.
3. **Jangan melanjutkan** pengerjaan fitur/fase berikutnya sampai revert ini dikonfirmasi oleh pemilik repo.
4. Tuliskan ringkasan akar masalah (root cause) singkat: instruksi mana yang salah diinterpretasikan sehingga terjadi penyimpangan, agar tidak terulang pada sesi berikutnya.

---

## 7. Dokumen Rujukan yang Mengikat Bersama Dokumen Ini

- `docs/OrchestreeAI_PRD_Final_Web_PWA_v2_2.md` — terutama **Bagian 9** (Arsitektur Sistem 3 Repository & Stack Teknologi Final per Repo) dan **Bagian 15** (Real Data Enforcement, Katalog Environment, Fail-Closed Startup Gate).
- `OrchestreeAI_Fase_Prompt_Implementasi.md` — Bagian A ("System Prompt Tetap") yang wajib disalin di setiap prompt fase.
- Dokumen ini (`AGENTS.md`) ditempatkan di **root repository** agar terbaca otomatis oleh tooling AI Agent Coding pada setiap sesi baru. Bila platform AI Agent Coding yang dipakai membaca nama file berbeda (mis. `CLAUDE.md`), duplikasikan isi dokumen ini persis sama ke nama file tersebut — jangan biarkan hanya satu file yang termuat sehingga aturan ini tidak terbaca di sesi tertentu.

---

## 8. Contoh Konkret Pelanggaran yang Sudah Pernah Terjadi (Referensi — Jangan Diulang)

Laporan berikut adalah **contoh pelanggaran nyata** yang menjadi alasan dokumen ini dibuat, dicantumkan agar AI Agent Coding dapat mengenali pola yang sama di masa depan dan menghindarinya:

> *"Configured safe in-memory fallback stores alongside PostgreSQL connection pool handling to support ephemeral container sandbox environments... Framework: Full-Stack Express + Vite React 19 SPA... To connect a real persistent relational database, you can provision Cloud SQL from the integrations menu."*

Tiga pelanggaran dalam satu laporan ini:
1. Menambahkan *in-memory fallback store* tanpa izin (melanggar Bagian 2.1).
2. Mengganti backend menjadi Express + Vite SPA, bukan Python/FastAPI (melanggar Bagian 1).
3. Menyarankan Cloud SQL sebagai solusi database, padahal Supabase sudah ditetapkan (melanggar Bagian 2.3).
