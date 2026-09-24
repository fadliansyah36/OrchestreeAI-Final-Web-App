# Legacy Server Artifacts (DEPRECATED)

File dan modul di direktori ini (`server.ts.bak`, `server_src/`) adalah artefak Node.js/Express lama yang **TIDAK LAGI DIGUNAKAN**.

Sesuai **AGENTS.md Bagian 1 & PRD v2.2 Bagian 9**:
- **Backend resmi tunggal:** Python 3.12 + FastAPI (`apps/backend/`)
- **Port backend:** 8001 (atau routing `/api/*` via reverse proxy/nginx)
- **Database:** Supabase PostgreSQL (proyek nyata)
- **Frontend:** Next.js / Vite SPA proxying `/api` ke FastAPI port 8001
