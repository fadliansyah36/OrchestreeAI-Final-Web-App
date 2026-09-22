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
  { pattern: /sample_data/i, name: 'sample_data' },
  { pattern: /\bsimulate\b/i, name: 'simulate' },
  { pattern: /scenario_data/i, name: 'scenario_data' },
  { pattern: /\bplaceholder\b/i, name: 'placeholder' },
  { pattern: /TODO_replace_with_real/i, name: 'TODO_replace_with_real' },
  { pattern: /Math\.random\(\)/, name: 'Math.random() for data generation' }
];

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  'dist',
  'build',
  '.next',
  'tests',
  'test',
  'docs',
  'scripts',
  '.ref_landing'
]);

const IGNORED_FILES = new Set([
  'ci-content-gate.js',
  '.env',
  '.env.example',
  '.env.schema',
  '.gitignore',
  'package-lock.json',
  'pnpm-lock.yaml'
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
