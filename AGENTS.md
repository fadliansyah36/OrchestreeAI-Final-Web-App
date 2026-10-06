# AGENTS.md — Aturan Wajib untuk AI Agent Coding (OrchestreeAI)

> **Kedudukan dokumen ini:** Dibaca **otomatis di awal setiap sesi kerja** oleh AI Agent Coding manapun (Claude Code, atau agent lain yang membaca `AGENTS.md`/`CLAUDE.md`). Aturan di sini **mengikat di atas** instruksi ad-hoc dalam satu sesi kerja, dan **tidak boleh dilonggarkan sepihak** oleh AI Agent Coding dengan alasan kemudahan implementasi, keterbatasan sandbox, atau "supaya build/berjalan dulu". Bila ada konflik antara permintaan di dalam chat dan dokumen ini, AI Agent Coding **wajib berhenti dan bertanya**, bukan memilih sendiri.

Dokumen ini dibuat sebagai respons langsung atas insiden nyata: AI Agent Coding pernah **tanpa diminta** mengubah backend menjadi Node.js/Express + Vite, menambahkan *in-memory fallback store*, dan menyarankan provisioning **Cloud SQL** — padahal stack resmi proyek ini sudah ditetapkan: **backend Python/FastAPI** dan **database Supabase Postgres**. Insiden semacam ini **dilarang terulang**.

---

## 1. Stack Resmi Tunggal (Tidak Dapat Diganti Tanpa Persetujuan Eksplisit Tertulis dari Pemilik Repo)

| Layer | WAJIB Dipakai | DILARANG KERAS (tanpa terkecuali) |
|---|---|---|
| Backend runtime & framework | **Python 3.12 + FastAPI** (`uv`, Uvicorn) | Node.js/Express sebagai backend, `tsx server.ts`, Vite dev server dijadikan server aplikasi, `esbuild server.ts --bundle` sebagai pipeline produksi, framework backend lain apapun (Django, Flask, NestJS, dst.) |
| Database utama | **Supabase PostgreSQL** (proyek nyata sesuai `DATABASE_URL`/`SUPABASE_URL` di `.env`) | Google Cloud SQL, AWS RDS, SQLite, database lokal file-based, database provider lain apapun |
| Penyimpanan data domain saat startup/runtime | Query langsung ke Supabase Postgres via the non-superuser, NOBYPASSRLS login identity supplied by `DATABASE_URL` | **In-memory store dalam bentuk apapun** sebagai pengganti/"fallback" database (`Map()`, `new Map()`, array/object JS/Python sebagai penyimpanan entitas bisnis, "ephemeral store", "safe fallback store", dsb.) |
| Cache/antrian saja (bukan data utama) | Redis (Celery broker, rate-limit, semantic cache) | Redis dipakai sebagai *primary datastore* pengganti Postgres |
| Auth | **Supabase Auth** (JWT/JWKS, MFA) | Passport.js, NextAuth di luar Supabase, Firebase Auth, sistem auth custom buatan sendiri |
| LLM | **OpenAI primary → NVIDIA NIM fallback** for text/reasoning, plus OpenAI image/video/content/document/design generation through **one Model Router** | Pemanggilan langsung SDK provider (mis. `@google/genai` dipanggil bebas di luar Model Router) tanpa melalui Model Router, Credit Ledger, dan `authorize()` |
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

- [ ] Backend runtime yang berjalan adalah Python/FastAPI (bukan `server.ts`/Express/Node sebagai server aplikasi), dan TIDAK ADA server backend kedua di luar `apps/backend`.
- [ ] Apakah ada proses/file server backend KEDUA di luar apps/backend? (jawaban harus TIDAK, dibuktikan git ls-files dan daftar proses yang di-boot).
- [ ] Tidak ada `Map()`, objek/array in-memory, atau *store* sejenis dipakai untuk menyimpan entitas data bisnis (users, tenants, tasks, dst.) — penggunaan struktur in-memory hanya boleh untuk hal non-bisnis yang murni transien di satu proses (mis. debounce timer), dan harus disebutkan eksplisit sebagai pengecualian yang dipahami, bukan disembunyikan dalam istilah "safe fallback".
- [ ] `DATABASE_URL`/`SUPABASE_URL` yang dipakai mengarah ke proyek Supabase nyata (host mengandung domain Supabase resmi atau host proyek Supabase CLI lokal) — bukan Cloud SQL, RDS, atau file SQLite lokal.
- [ ] Tidak ada kalimat di laporan yang menyarankan provider database/cloud lain sebagai langkah berikutnya.
- [ ] Seluruh pemanggilan LLM dan generative-model calls melewati Model Router tunggal (Bagian E.2 PRD v2.2 / Bagian J Prompt Fase 4), bukan dipanggil langsung dari kode fitur.
- [ ] CI Content Gate (pemindaian kata terlarang) sudah dijalankan dan lulus, mencakup juga istilah baru: `in-memory fallback`, `memorystore`, `cloud sql`, `cloudsql`.
- [ ] Apakah ada data apapun yang bisa tampil di UI SEBELUM/TANPA request backend berhasil? (jawaban harus TIDAK, dibuktikan uji matikan backend sepenuhnya lalu buka aplikasi).

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

---

## 9. Tata Kelola UI/UX Dashboard (Berlaku Permanen — Bukan Tugas Sekali Jalan)

Aturan berikut WAJIB dipatuhi pada **setiap** pekerjaan UI baru maupun perubahan atas UI yang sudah ada di `apps/client` dan `apps/admin`, sepanjang umur proyek — bukan hanya berlaku sekali saat audit/refactor besar dilakukan. **Tidak berlaku untuk Landing Page publik** (`apps/client/app/(public)/`), yang mengikuti aturannya sendiri.

### 9.1 Navigasi Dua Lapis Wajib
- Setiap Dashboard (`apps/client`, `apps/admin`) WAJIB memakai **Bottom Navigation** (maksimum 5 item fitur paling sering diakses, ikon+label, target sentuh ≥48px, badge angka dari data nyata) DAN **`<OrchNavBar>`** (menu lengkap seluruh domain, dikelompokkan per kategori, status terkunci/terbuka mengikuti `feature_capabilities` nyata).
- Setiap domain/fitur baru yang dibangun WAJIB didaftarkan ke `<OrchNavBar>` pada saat yang sama — dilarang ada fitur baru tanpa jalur navigasi resmi.

### 9.2 Struktur Feature Hub Konsisten
- Setiap domain WAJIB dibungkus `FeatureHubScreen` (PRD v2.2 Bagian 4.2): header domain, slot analitik ringkas, grid kartu kategori sub-fitur, feed insight bila relevan.
- Pola navigasi Hub → detail → aksi WAJIB konsisten lintas domain (breadcrumb, tombol kembali, pola modal/drawer) — dilarang gaya navigasi unik per domain.
- Angka yang tampil di Hub dan layar detail terkait WAJIB berasal dari query yang sama (audit konsistensi Bagian 22.3 PRD v2.2 berlaku permanen, bukan sekali audit).

### 9.3 Home Overview (Client) & Ringkasan Platform (Admin)
- `HomeOverviewScreen` WAJIB memuat, seluruhnya dari data nyata: ringkasan kerja hari ini, aksi cepat yang memicu Orchestration Engine nyata, grid kategori domain, panel analitik/statistik, dan **Leaderboard Ranking Human vs AI Agent** (toggle Semua/Human/AI Agent) dari `performance_scores_monthly` nyata.
- Setiap widget baru di Home Overview WAJIB memakai `EmptyState` jujur saat data kosong — dilarang mengisi dengan angka ilustrasi apapun, termasuk untuk keperluan demo/screenshot internal.

### 9.4 Design Token & Anti-Slop (Permanen)
- SELURUH warna, tipografi, spacing, radius, elevasi WAJIB dari `packages/design-tokens` (Bagian 5.3–5.5 PRD v2.2) — dilarang warna hex baru langsung di komponen, dilarang elemen HTML polos tanpa restyle token.
- Checklist Anti-Slop (Bagian 5.2) WAJIB dijalankan sebagai bagian dari setiap perubahan UI, bukan hanya saat audit besar terjadwal.

### 9.5 Dark/Light Mode Wajib Berfungsi Penuh
- Setiap komponen baru WAJIB diuji di kedua tema sebelum dianggap selesai — toggle harus benar-benar mengubah `data-theme` di DOM dan seluruh token warna ikut berubah. Regresi tema pada komponen baru dianggap bug *blocking*, bukan cacat kosmetik minor.

### 9.6 Responsive Wajib Diuji Nyata, Bukan Diasumsikan
- Setiap komponen/layar baru WAJIB diuji nyata pada minimal 3 lebar viewport (mobile ~375px, tablet ~768px, desktop ~1280px) sebelum dianggap selesai — modal, card, container, button, image, dan tabel/chart tidak boleh overflow/terpotong pada lebar manapun. Ini berlaku permanen untuk setiap perubahan UI, bukan hanya saat audit responsive besar dijalankan sekali.

---

## 10. Kebersihan Repository — Artefak Uji Coba & File Sementara

AI Agent Coding sering meninggalkan file sisa hasil proses verifikasi (skrip debug sekali pakai, dump data uji, log percobaan, folder `tmp_test/`, dsb.) yang tertinggal di repository setelah tugas selesai. Ini **dilarang** dan diatur tegas sebagai berikut.

### 10.1 Dua Kategori File Terkait Pengujian — Jangan Disamakan
1. **Test suite permanen** (`apps/backend/tests/`, `apps/client/**/*.test.tsx`, `apps/admin/**/*.test.tsx`, suite Playwright E2E) — ini bagian dari kode produksi, WAJIB di-commit dan dipelihara, bukan dihapus.
2. **Artefak verifikasi sementara/sekali pakai** — skrip ad-hoc untuk mengecek sesuatu secara manual (mis. `check_connection.py`, `debug_output.json`, `test_manual.ts` di root, log hasil `curl`, dump respons API untuk dibaca sendiri oleh AI Agent Coding saat diagnosis) — ini **bukan** bagian dari kode produk dan **WAJIB DIHAPUS** sebelum tugas dilaporkan selesai.

### 10.2 Aturan Wajib
- Setiap kali AI Agent Coding membuat file HANYA untuk verifikasi/diagnosis sendiri selama satu sesi kerja (bukan untuk dijalankan ulang sebagai bagian dari CI/test suite resmi), file tersebut **wajib dihapus di akhir sesi yang sama**, sebelum melaporkan tugas selesai — bukan dibiarkan menumpuk di repo.
- Bila sebuah skrip verifikasi dianggap berguna untuk dipakai ulang (bukan sekali pakai), file tersebut wajib dipindahkan ke lokasi resmi (`apps/backend/tests/`, atau `scripts/` dengan dokumentasi singkat kegunaannya) dan didaftarkan secara sadar — bukan tertinggal secara tidak sengaja.
- Dilarang membuat file scratch di root repository ATAU di dalam folder kode produksi (`apps/*/app`, `apps/*/src`). Bila perlu ruang kerja sementara, gunakan direktori yang sudah masuk `.gitignore` (mis. `.scratch/`) yang tidak pernah ikut ter-commit.
- Sebelum menyatakan tugas selesai, jalankan `git status` dan review setiap file baru yang muncul — file yang tidak jelas kegunaannya dalam struktur repo resmi (Bagian B `OrchestreeAI_Fase_Prompt_Implementasi.md`) WAJIB dihapus atau dijelaskan eksplisit alasan tetap ada.

### 10.3 Penegakan CI
- Tambahkan job CI yang menolak commit berisi pola nama file mencurigakan di luar folder resmi: `debug_*`, `temp_*`, `tmp_*`, `test_manual*`, `*_scratch*`, `check_*.py` di root, `*.log` yang ter-commit — kecuali sudah masuk `.gitignore` sejak awal.
- CI Content Gate yang sudah ada (Bagian 4) diperluas untuk turut memindai keberadaan file-file semacam ini, sebagai bagian dari gate yang sama.

### 10.4 Tambahan pada Self-Check Bagian 4
- [ ] `git status`/`git diff --stat` sudah direview, tidak ada file sisa verifikasi/debug ikut ter-commit.
- [ ] Setiap file baru di luar struktur repo resmi sudah dihapus atau dipindah ke lokasi resmi dengan alasan jelas.

---

## 11. Ketetapan Kerja: Larangan Shadow/Duplikat di `src/` & Integritas Mandiri Monorepo

Ke depan, setiap fitur baru, perbaikan UI, atau logika frontend hanya akan dibuat langsung di dalam aplikasi mandirinya (`apps/client` untuk Client Dashboard, `apps/admin` untuk Admin Dashboard) sesuai arsitektur monorepo yang sudah ditetapkan, tanpa membuat file duplikat/shadow di `src/`.

1. Seluruh endpoint/FastAPI ke backend server dipanggil langsung dari kode di dalam `apps/client` dan `apps/admin`.
2. Dilarang membuat shadow components, proxy re-exports, atau file tiruan di root `src/`. Root repository hanya menjaga file monorepo resmi, konfigurasi, dan wrapper minimal jika diperlukan oleh runner tanpa menduplikasi komponen bisnis.

