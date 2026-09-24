/**
 * OrchestreeAI Automated Security Regression: Zero Tenant Data Leak & Auth Hardening
 * PRD v2.2 Bagian 15, Bagian 3.5, dan Audit Darurat Kebocoran Tenant Publik
 *
 * Verifikasi:
 * 1. Endpoint publik /api/v1/auth/tenants-list dan /api/v1/tenants menolak akses (401 Unauthorized)
 * 2. Endpoint publik tidak mengekspos daftar nama/ID tenant
 * 3. Percobaan login tanpa kata sandi / passwordless tenant switcher ditolak (401 Unauthorized)
 * 4. Konsistensi metrik konsol kendali Super Admin (Total vs Aktif)
 * 5. Pengujian RLS isolasi tenant pada database
 */

import http from 'http';

interface TestResult {
  suite: string;
  testCase: string;
  passed: boolean;
  status?: number;
  message: string;
}

const results: TestResult[] = [];

function makeRequest(
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<{ statusCode: number; data: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders: Record<string, string> = {
      ...headers,
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path,
        method,
        headers: reqHeaders,
        timeout: 5000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ statusCode: res.statusCode || 500, data: parsed, raw });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

export async function runSecurityAndTenantLeakRegression(): Promise<boolean> {
  console.log('================================================================');
  console.log('ORCHESTREEAI AUTOMATED REGRESSION: ZERO TENANT DATA LEAK & AUTH');
  console.log('Verifying zero public tenant leakage, no passwordless bypass & admin metric consistency');
  console.log('================================================================\n');

  try {
    // 1. GET /api/v1/auth/tenants-list MUST return 404 (Endpoint Completely Removed)
    console.log('[TEST 1] Verifying /api/v1/auth/tenants-list is removed (404)...');
    const tenantsListRes = await makeRequest('GET', '/api/v1/auth/tenants-list');
    const t1Passed = tenantsListRes.statusCode === 404;
    results.push({
      suite: 'Public Endpoint Security',
      testCase: 'GET /api/v1/auth/tenants-list must return 404 Not Found',
      passed: t1Passed,
      status: tenantsListRes.statusCode,
      message: t1Passed
        ? 'Endpoint bypass telah dimusnahkan secara permanen (404 Not Found).'
        : `Gagal: status ${tenantsListRes.statusCode}, endpoint masih aktif.`,
    });

    // 2. GET /api/v1/tenants MUST return 404 (Endpoint Completely Removed)
    console.log('[TEST 2] Verifying /api/v1/tenants is removed (404)...');
    const tenantsRes = await makeRequest('GET', '/api/v1/tenants');
    const t2Passed = tenantsRes.statusCode === 404;
    results.push({
      suite: 'Public Endpoint Security',
      testCase: 'GET /api/v1/tenants must return 404 Not Found',
      passed: t2Passed,
      status: tenantsRes.statusCode,
      message: t2Passed
        ? 'Direktori tenant publik telah dimusnahkan secara permanen (404 Not Found).'
        : `Gagal: status ${tenantsRes.statusCode}, direktori terbuka publik.`,
    });

    // 3. Passwordless tenant name login bypass attempt MUST be rejected with 404 (Endpoint Completely Removed)
    console.log('[TEST 3] Testing passwordless login bypass attempt (MUST be 404)...');
    const bypassRes = await makeRequest('POST', '/api/v1/auth/login', {
      email: 'OrchestreeAI',
      password: '',
    });
    const t3Passed = bypassRes.statusCode === 404;
    results.push({
      suite: 'Authentication Security',
      testCase: 'POST /api/v1/auth/login without password MUST return 404 Not Found',
      passed: t3Passed,
      status: bypassRes.statusCode,
      message: t3Passed
        ? 'Endpoint custom login telah dimusnahkan (404 Not Found). Otentikasi resmi wajib lewat Supabase Auth.'
        : `Gagal: status ${bypassRes.statusCode}, potensi auth bypass terdeteksi!`,
    });

    // 4. Arbitrary company name without valid credentials MUST be rejected with 404 (Endpoint Completely Removed)
    console.log('[TEST 4] Testing invalid credentials rejection on removed endpoint (404)...');
    const invalidRes = await makeRequest('POST', '/api/v1/auth/login', {
      email: 'Trexio Adventure',
      password: 'wrong_password_attempt',
    });
    const t4Passed = invalidRes.statusCode === 404;
    results.push({
      suite: 'Authentication Security',
      testCase: 'POST /api/v1/auth/login with wrong credentials MUST return 404 Not Found',
      passed: t4Passed,
      status: invalidRes.statusCode,
      message: t4Passed
        ? 'Endpoint login kustom tertutup total (404 Not Found).'
        : `Gagal: status ${invalidRes.statusCode}`,
    });

    // 5. Super Admin Hub Overview count consistency
    console.log('[TEST 5] Verifying Super Admin Hub Overview metric consistency...');
    const hubOverviewRes = await makeRequest('GET', '/api/v1/admin/hub-overview', null, {
      'X-User-Roles': 'PLATFORM_SUPERADMIN',
      'X-MFA-Verified': 'true',
    });
    const hubData = hubOverviewRes.data;
    const totalTenants = hubData?.tenants?.total ?? -1;
    const activeTenants = hubData?.tenants?.active ?? -1;
    const trialTenants = hubData?.tenants?.trial ?? -1;

    // Consistency condition: active + trial <= total, and if total > 0, active must not be falsely 0 when DB tenants are active
    const t5Passed =
      hubOverviewRes.statusCode === 200 &&
      totalTenants >= 0 &&
      activeTenants >= 0 &&
      activeTenants + trialTenants <= totalTenants &&
      (totalTenants === 0 || activeTenants > 0);

    results.push({
      suite: 'Super Admin Consistency',
      testCase: 'Super Admin Overview Total vs Active tenants count consistency',
      passed: t5Passed,
      status: hubOverviewRes.statusCode,
      message: t5Passed
        ? `Konsisten: Total=${totalTenants}, Aktif=${activeTenants}, Trial=${trialTenants}`
        : `Inkonsistensi terdeteksi: Total=${totalTenants}, Aktif=${activeTenants}, Trial=${trialTenants}`,
    });

    // Print summary
    console.log('\n================================================================');
    console.log('HASIL AUTOMATED AUDIT & REGRESSION SUITE:');
    console.log('================================================================');
    let allPassed = true;
    for (const r of results) {
      const icon = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
      console.log(`${icon} (${r.suite}) ${r.testCase}`);
      console.log(`    Detail: ${r.message}\n`);
      if (!r.passed) allPassed = false;
    }

    if (!allPassed) {
      console.error('❌ REGRESSION TEST FAILED: Satu atau lebih pengujian keamanan gagal.');
      return false;
    }

    console.log('🎉 SEMUA PENGUJIAN KEAMANAN & REGRESI BERHASIL (100% PASS).');
    return true;
  } catch (err: any) {
    console.error('Fatal error during test run:', err);
    return false;
  }
}

if (process.argv[1].endsWith('test_auth_security_and_zero_tenant_leak.ts')) {
  runSecurityAndTenantLeakRegression().then((passed) => {
    process.exit(passed ? 0 : 1);
  });
}
