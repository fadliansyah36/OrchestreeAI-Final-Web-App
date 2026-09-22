# Panduan Test Harness & Skenario Regresi OrchestreeAI

Dokumentasi ini menjelaskan arsitektur harness pengujian, validasi kontrak, dan tata cara menambahkan skenario regresi baru pada modul-modul berikutnya sesuai spesifikasi **PRD v2.2 (Bagian 2.6, Bagian 3.5, Bagian 8, Bagian 9.2, dan Bagian 11)**.

---

## 1. MCP Tool Runtime Contract Test Harness

Lokasi: `apps/backend/tests/harness/mcp_contract_harness.py`  
Test File: `apps/backend/tests/test_mcp_contracts.py`

### Tujuan
Menjamin setiap MCP Tool yang digunakan oleh AI Workforce Agent mematuhi spesifikasi kontrak resmi sebelum didaftarkan ke runtime:
- Penamaan `snake_case`, deskripsi informatif (minimal 10 karakter), SemVer valid.
- Definisi JSON Schema (input dan output bertipe `object` dengan deklarasi `properties`).
- Penolakan otomatis input tidak valid sebelum eksekusi logic.
- Penegakan otorisasi terpadu melalui Unified PDP `authorize()`.
- Pembatasan timeout dan penanganan eksepsi yang fail-safe.

### Cara Menambah Kasus Uji Tool Baru
1. Buat class tool baru yang mewarisi `BaseMCPTool`:
   ```python
   from tests.harness.mcp_contract_harness import BaseMCPTool, MCPExecutionContext, MCPToolResult, register_mcp_tool

   class OrderTrackingMCPTool(BaseMCPTool):
       name = "order_track_shipment"
       description = "Melacak nomor resi pengiriman logistik pelanggan."
       version = "1.0.0"
       category = "operations"
       required_capabilities = ["logistics:track"]

       @property
       def input_schema(self) -> dict:
           return {
               "type": "object",
               "properties": {"tracking_number": {"type": "string"}},
               "required": ["tracking_number"]
           }

       @property
       def output_schema(self) -> dict:
           return {
               "type": "object",
               "properties": {"status": {"type": "string"}},
               "required": ["status"]
           }

       async def run(self, context: MCPExecutionContext, params: dict) -> MCPToolResult:
           # Logika integrasi provider logistik resmi
           return MCPToolResult(success=True, data={"status": "in_transit"})
   ```
2. Daftarkan instance tool ke registri global:
   ```python
   register_mcp_tool(OrderTrackingMCPTool())
   ```
3. Jalankan `pytest apps/backend/tests/test_mcp_contracts.py` — suite otomatis memvalidasi kontrak tool baru tanpa perlu menulis ulang assertion boilerplate.

---

## 2. Harness Uji Konkuren Operasi Finansial (Dompet Kredit)

Lokasi: `apps/backend/tests/harness/concurrency_harness.py`  
Test File: `apps/backend/tests/test_concurrency_credit_wallet.py`

### Tujuan
Mencegah *race condition*, *lost update*, dan saldo minus pada operasi finansial dompet kredit dengan menguji N worker paralel bersaing mengakses satu baris data (Row-Level Locking).

### Invariansi yang Diverifikasi
- Konservasi Saldo Mutlak: `final_balance == initial_balance - (successful_debits * debit_amount)`.
- Anti-Overdraft: `final_balance >= 0` setiap saat.
- Deterministik: `successful_debits + failed_insufficient_funds == total_workers`.

### Cara Menambah Skenario Uji Konkuren
1. Inisialisasi dompet kredit dengan saldo awal tertentu.
2. Tentukan jumlah worker dan nominal debit per worker:
   ```python
   report = await WalletConcurrencyHarness.run_concurrent_debit_stress(
       wallet=my_wallet_instance,
       worker_count=50,
       debit_amount_per_worker=Decimal("20.00"),
   )
   assert report.final_balance >= Decimal("0.00")
   ```
3. Untuk pengujian ke PostgreSQL langsung, tetapkan environment variable `TEST_DATABASE_URL` atau `DATABASE_URL`. Hook pengujian akan langsung mengeksekusi `SELECT FOR UPDATE` ke database engine.

---

## 3. Suite Uji Isolasi RLS Lintas Tenant

Lokasi: `apps/backend/tests/harness/rls_isolation_harness.py`  
Test File: `apps/backend/tests/test_rls_tenant_isolation.py`

### Tujuan
Memverifikasi batas isolasi multi-tenant yang ketat:
- Subjek dari Tenant A **TIDAK PERNAH** dapat membaca atau memanipulasi data milik Tenant B.
- Setiap upaya manipulasi header `X-Tenant-Id` yang tidak sesuai dengan JWT resmi langsung ditolak dengan **HTTP 403 Forbidden** oleh security layer (`app.core.security`).

### Cara Menambah Tabel Tenant Baru ke Matrix
Saat tabel baru bertenant dimigrasikan ke database:
1. Daftarkan nama tabel ke list `registered_tenant_tables` di `test_rls_database_tables_scan_suite()`.
2. Suite akan memverifikasi bahwa:
   - Kolom `tenant_id` ada dan terindeks.
   - Kebijakan RLS (`ENABLE ROW LEVEL SECURITY`) aktif dan `FORCE` diterapkan pada tabel tersebut.

---

## 4. Deteksi Breaking Changes OpenAPI (`oasdiff`)

Lokasi Script: `apps/backend/scripts/check_openapi_diff.py`  
Test File: `apps/backend/tests/test_openapi_contracts.py`  
Baseline File: `apps/backend/openapi.base.json`

### Cara Kerja
Mengekstrak skema OpenAPI 3.1 dari instance FastAPI (`/openapi.json`) dan membandingkannya dengan baseline resmi menggunakan `oasdiff breaking --fail-on ERR`. Setiap perubahan yang menghapus endpoint, mengubah parameter wajib, atau merusak tipe kembalian akan menggagalkan build CI.

### Alur Kerja Penambahan Endpoint
1. Tambahkan router atau endpoint baru di backend.
2. Jalankan pemeriksaan kontrak:
   ```bash
   PYTHONPATH=apps/backend python3 apps/backend/scripts/check_openapi_diff.py
   ```
3. Jika penambahan endpoint disetujui (kompatibel mundur) dan ingin dijadikan baseline baru:
   ```bash
   PYTHONPATH=apps/backend python3 apps/backend/scripts/check_openapi_diff.py --update-base
   ```

---

## 5. Penegakan Batas Modul & Arsitektur (`import-linter`)

Konfigurasi: `apps/backend/.importlinter`  
Test File: `apps/backend/tests/test_architecture_boundaries.py`

### Aturan PRD v2.2 Bagian 9.2
- Modul di dalam `app.domains.<domain>` **HANYA** diizinkan mengimpor:
  1. `app.core` (beserta submodule-nya)
  2. `app.authz` (Unified PDP `authorize()`)
  3. Modul internal domain miliknya sendiri
  4. Antarmuka publik `app.domains.<domain_lain>.contracts`
- **DILARANG KERAS**: Mengimpor modul implementasi internal domain lain secara langsung (misal: `from app.domains.crm.services import ...` dari dalam `app.domains.finance`).

### Cara Menambah Domain Baru
1. Buat folder domain di `apps/backend/app/domains/<nama_domain>/`.
2. Sediakan file `contracts.py` sebagai antarmuka publik yang boleh diakses oleh domain lain.
3. Jalankan pengujian:
   ```bash
   pytest apps/backend/tests/test_architecture_boundaries.py
   ```
   Analisis AST dan `import-linter` akan otomatis memverifikasi bahwa struktur kode Anda bersih dari pelanggaran batas arsitektur.
