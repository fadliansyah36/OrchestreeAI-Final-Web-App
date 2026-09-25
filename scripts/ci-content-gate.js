#!/usr/bin/env node
/**
 * OrchestreeAI CI Content Gate (PRD v2.2 Bagian 15.1 & Bagian 22.4)
 * Memindai source tree untuk penegakan Real Data.
 *
 * Kata terlarang:
 * - mock, fake, dummy, sample_data, simulate, scenario_data
 * - placeholder, TODO_replace_with_real
 * - Math.random() (bila digunakan untuk generate data)
 *
 * Pengecualian:
 * - Direktori: tests/, test/, node_modules/, .git/, dist/, docs/, scripts/
 * - Baris dengan komentar eksplisit: `allowlist: <alasan>`
 */

import fs from 'fs';
import path from 'path';

const FORBIDDEN_PATTERNS = [
  { pattern: /\bmock\b/i, name: 'mock' },
  { pattern: /\bfake\b/i, name: 'fake' },
  { pattern: /\bdummy\b/i, name: 'dummy' },
  { pattern: /\bsample\b/i, name: 'sample' },
  { pattern: /sample_data/i, name: 'sample_data' },
  { pattern: /\bsimulate\b/i, name: 'simulate' },
  { pattern: /\bscenario\b/i, name: 'scenario' },
  { pattern: /scenario_data/i, name: 'scenario_data' },
  { pattern: /\bplaceholder\b/i, name: 'placeholder' },
  { pattern: /TODO_replace_with_real/i, name: 'TODO_replace_with_real' },
  { pattern: /Math\.random\(\)/, name: 'Math.random() for data generation' },
  { pattern: /in-memory fallback/i, name: 'in-memory fallback' },
  { pattern: /memorystore/i, name: 'memorystore' },
  { pattern: /cloud sql/i, name: 'cloud sql' },
  { pattern: /cloudsql/i, name: 'cloudsql' },
  // CI Guard: Dilarang keras email test/dummy/pentest hardcode
  { pattern: /\b(test|demo|dummy|pentest)@/i, name: 'test email literal' },
  { pattern: /@test\.com/i, name: 'test.com domain literal' },
  { pattern: /example\.com/i, name: 'example.com domain literal' },
  { pattern: /admin@admin/i, name: 'admin@admin literal' },
  { pattern: /\b(password123|admin\/admin|admin:admin)\b/i, name: 'default test credentials' },
  // CI Guard: Dilarang hardcoded JWT token atau Secret Key
  { pattern: /eyJhbGciOi[A-Za-z0-9-_=]{15,}\.[A-Za-z0-9-_=]{15,}\.[A-Za-z0-9-_=]{15,}/, name: 'hardcoded JWT token literal' },
  { pattern: /postgres:[^@\s]{6,}@db\.[a-z0-9]+\.supabase\.co/i, name: 'hardcoded Supabase DB password' },
  { pattern: /\b(sk-[A-Za-z0-9]{25,}|nvapi-[A-Za-z0-9_-]{25,})\b/, name: 'hardcoded provider API key' },
  // CI Guard: Dilarang arsitektur Room / SQLite lokal di luar stack Supabase Postgres
  { pattern: /\b(RoomDatabase|androidx\.room)\b/i, name: 'Android Room SQLite architecture' },
  { pattern: /\bsqlite3\b/i, name: 'sqlite3 local database' },
  // CI Guard: Dilarang runner Express tsx server.ts
  { pattern: /tsx server\.ts/i, name: 'tsx server.ts legacy runner' }
];

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  'dist',
  'build',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  'tests',
  'test',
  'docs',
  'scripts',
  '.ref_landing',
  'legacy'
]);

const IGNORED_FILES = new Set([
  'ci-content-gate.js',
  '.env',
  '.env.example',
  '.env.schema',
  '.gitignore',
  'package-lock.json',
  'pnpm-lock.yaml',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'openapi.base.json',
  'openapi.json'
]);

const ALLOWLIST_COMMENT = /allowlist\s*:\s*.+/i;

function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        walkDir(fullPath, fileList);
      }
    } else if (entry.isFile()) {
      if (!IGNORED_FILES.has(entry.name)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function runContentGate() {
  console.log('--- OrchestreeAI CI Content Gate ---');
  const rootDir = process.cwd();
  const files = walkDir(rootDir);
  const violations = [];

  // CI Guard (Bagian 5.2): Dilarang keras server.ts/server.js atau server directory di luar apps/backend
  const rogueFiles = [
    'server.ts',
    'server.js',
    path.join('apps', 'client', 'server.ts'),
    path.join('apps', 'client', 'server.js'),
    path.join('apps', 'admin', 'server.ts'),
    path.join('apps', 'admin', 'server.js'),
  ];
  for (const rf of rogueFiles) {
    if (fs.existsSync(path.join(rootDir, rf))) {
      violations.push({
        file: rf,
        line: 1,
        term: 'rogue backend runner file',
        snippet: `${rf} dilarang berada di repositori (backend HANYA Python di apps/backend)`
      });
    }
  }

  const rogueDirs = [
    path.join('src', 'server'),
    path.join('apps', 'client', 'server'),
    path.join('apps', 'admin', 'server')
  ];
  for (const rd of rogueDirs) {
    if (fs.existsSync(path.join(rootDir, rd))) {
      violations.push({
        file: rd,
        line: 1,
        term: 'rogue server directory',
        snippet: `${rd} direktori dilarang berada di repositori`
      });
    }
  }

  // CI Guard (Bagian 5.2): Dilarang dependency express di package.json manapun
  const manifestFiles = [
    'package.json',
    path.join('apps', 'client', 'package.json'),
    path.join('apps', 'admin', 'package.json'),
    path.join('packages', 'ui', 'package.json'),
    path.join('packages', 'design-tokens', 'package.json'),
    path.join('packages', 'api-types', 'package.json'),
  ];
  for (const mf of manifestFiles) {
    const mfPath = path.join(rootDir, mf);
    if (fs.existsSync(mfPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(mfPath, 'utf-8'));
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (allDeps['express'] || allDeps['@types/express']) {
          violations.push({
            file: mf,
            line: 1,
            term: 'express dependency',
            snippet: `Dependency express dilarang di ${mf} (backend HANYA Python FastAPI di apps/backend)`
          });
        }
      } catch (err) {}
    }
  }

  for (const filePath of files) {
    // Only check code/markup files
    const ext = path.extname(filePath).toLowerCase();
    if (!['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.json', '.html', '.css'].includes(ext)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      // Skip if explicitly allowlisted
      if (ALLOWLIST_COMMENT.test(line)) {
        return;
      }

      // CI Guard (Bagian B.5 & D.4): Dilarang query langsung tabel Supabase (.from) di frontend apps/client dan apps/admin
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
      const isFrontend = relPath.startsWith('apps/client/') || relPath.startsWith('apps/admin/') || relPath.startsWith('src/') || relPath.startsWith('packages/');
      if (isFrontend && (line.includes('.from(') || line.includes('.from("') || line.includes(".from('"))) {
        if (!line.includes('Array.from') && !line.includes('Buffer.from')) {
          violations.push({
            file: relPath,
            line: index + 1,
            term: 'direct Supabase .from() in frontend',
            snippet: line.trim()
          });
        }
      }

      // CI Guard: Dilarang console.log/console.debug di seluruh frontend produksi (apps/client, apps/admin, src, packages)
      if (isFrontend && (/\bconsole\.(log|debug)\s*\(/.test(line))) {
        violations.push({
          file: relPath,
          line: index + 1,
          term: 'production console.log/debug',
          snippet: line.trim()
        });
      }

      // CI Guard: Dilarang print() di backend produksi apps/backend/app (wajib structured logger / logging.getLogger)
      if (relPath.startsWith('apps/backend/app/') && (/\bprint\s*\(/.test(line))) {
        violations.push({
          file: relPath,
          line: index + 1,
          term: 'unstructured print() in backend production',
          snippet: line.trim()
        });
      }

      // CI Guard: Dilarang konfigurasi bucket publik untuk kategori data sensitif
      if (/(?:bucket|bucket_id)\s*[:=]\s*["'](?:documents|contracts|payroll|staff)["'].*?(?:public\s*[:=]\s*true|is_public\s*[:=]\s*true)/i.test(line)) {
        violations.push({
          file: relPath,
          line: index + 1,
          term: 'public bucket declared for sensitive data category',
          snippet: line.trim()
        });
      }

      for (const { pattern, name } of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            file: path.relative(rootDir, filePath),
            line: index + 1,
            term: name,
            snippet: line.trim()
          });
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error(`\n❌ CI Content Gate FAILED: Ditemukan ${violations.length} pelanggaran kata terlarang:\n`);
    violations.forEach((v) => {
      console.error(`  [${v.term}] ${v.file}:${v.line} -> "${v.snippet}"`);
    });
    console.error('\nAturan Real Data mutlak: dilarang menggunakan data tiruan atau placeholder.');
    console.error('Bila baris ini benar-benar diperlukan untuk pengujian teknis, tambahkan komentar `// allowlist: <alasan>`');
    process.exit(1);
  } else {
    console.log(`✅ CI Content Gate PASSED: ${files.length} file diverifikasi bersih dari kata terlarang.`);
    process.exit(0);
  }
}

runContentGate();
