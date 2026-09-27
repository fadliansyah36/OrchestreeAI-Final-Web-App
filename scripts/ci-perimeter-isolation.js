#!/usr/bin/env node
/**
 * OrchestreeAI CI Perimeter Isolation Guard (PRD v2.2 Bagian B.4)
 * Menjamin isolasi perimeter independen antara apps/client dan apps/admin:
 * 1. apps/client DILARANG mengimpor dari apps/admin.
 * 2. apps/client DILARANG memanggil endpoint kontrol admin (/api/v1/admin/*).
 * 3. apps/admin DILARANG mengimpor dari apps/client.
 */

import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const CLIENT_DIR = path.join(ROOT_DIR, 'apps/client');
const ADMIN_DIR = path.join(ROOT_DIR, 'apps/admin');

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git']);

const violations = [];

function getFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        getFiles(fullPath, fileList);
      }
    } else if (entry.isFile()) {
      if (EXTENSIONS.has(path.extname(entry.name))) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function checkClientFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('allowlist: perimeter-approved')) return;

    // 1. Cek impor dari apps/admin
    if (
      /import\s+.*from\s+['"].*\/apps\/admin/i.test(line) ||
      /import\s+.*from\s+['"]\.\.\/.*admin/i.test(line) ||
      /import\s*\(['"].*\/apps\/admin/i.test(line)
    ) {
      violations.push({
        file: path.relative(ROOT_DIR, filePath),
        line: lineNum,
        type: 'CROSS_IMPORT_FROM_ADMIN',
        detail: `apps/client dilarang mengimpor komponen/modul dari apps/admin: "${line.trim()}"`,
      });
    }

    // 2. Cek pemanggilan langsung ke endpoint admin
    if (/\/api\/v1\/admin\b/i.test(line)) {
      violations.push({
        file: path.relative(ROOT_DIR, filePath),
        line: lineNum,
        type: 'ADMIN_API_CALL_IN_CLIENT',
        detail: `apps/client dilarang memanggil endpoint kontrol admin (/api/v1/admin/*): "${line.trim()}"`,
      });
    }
  });
}

function checkAdminFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (line.includes('allowlist: perimeter-approved')) return;

    // Cek impor dari apps/client
    if (
      /import\s+.*from\s+['"].*\/apps\/client/i.test(line) ||
      /import\s+.*from\s+['"]\.\.\/.*client/i.test(line) ||
      /import\s*\(['"].*\/apps\/client/i.test(line)
    ) {
      violations.push({
        file: path.relative(ROOT_DIR, filePath),
        line: lineNum,
        type: 'CROSS_IMPORT_FROM_CLIENT',
        detail: `apps/admin dilarang mengimpor modul langsung dari apps/client: "${line.trim()}"`,
      });
    }
  });
}

console.log('================================================================================');
console.log('ORCHESTREE AI — CI PERIMETER ISOLATION GUARD (PRD v2.2 Bagian B.4)');
console.log('================================================================================');

const clientFiles = getFiles(CLIENT_DIR);
const adminFiles = getFiles(ADMIN_DIR);

console.log(`Memindai ${clientFiles.length} file di apps/client...`);
clientFiles.forEach(checkClientFile);

console.log(`Memindai ${adminFiles.length} file di apps/admin...`);
adminFiles.forEach(checkAdminFile);

if (violations.length === 0) {
  console.log('✅ CI Perimeter Isolation PASSED: Perimeter apps/client dan apps/admin terisolasi 100%.');
  process.exit(0);
} else {
  console.error(`❌ CI Perimeter Isolation FAILED: Ditemukan ${violations.length} pelanggaran perimeter:`);
  violations.forEach((v) => {
    console.error(`  [${v.type}] ${v.file}:${v.line} -> ${v.detail}`);
  });
  process.exit(1);
}
