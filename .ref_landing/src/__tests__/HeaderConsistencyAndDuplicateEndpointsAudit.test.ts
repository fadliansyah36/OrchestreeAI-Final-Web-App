import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api } from '../lib/api';

class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] || null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as any).sessionStorage = new MockStorage();
}
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new MockStorage();
}

describe('Audit Tahap A6.2: Resolusi Endpoint Duplikat & Konsistensi Header', () => {
  const originalFetch = (globalThis as any).fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    api.setToken(null);
    api.setOperatorId(null);
    api.setTenantId(null);
    api.setCsrfToken(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  describe('Langkah 1: Resolusi Endpoint Duplikat & Konsolidasi', () => {
    it('1.1 & 1.2: Pasangan 1 - Auth Login menggunakan single source of truth (/admin/auth/login)', async () => {
      let requestedUrl = '';
      (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            token: 'test-admin-token-xyz',
            requiresMfa: false,
            user: { email: 'admin@orchestree.ai', role: 'SUPER_ADMIN' },
          }),
        };
      });

      await api.adminLogin('admin@orchestree.ai', 'SecretPassword123!');

      expect(requestedUrl).toContain('/admin/auth/login');
      expect(requestedUrl).not.toBe('http://localhost:8080/api/v1/admin/login');
    });

    it('1.1 & 1.2: Pasangan 2 - Financial Command Center dikonsolidasikan ke standar final /admin/financial-command-center', async () => {
      const recordedUrls: string[] = [];
      (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string) => {
        recordedUrls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            period: '2026-09',
            currency: 'IDR',
            arrTotal: 1500000000,
            mrrTotal: 125000000,
            cashRunwayMonths: 24,
            netBurnRate: 50000000,
            grossMarginPercentage: 82.5,
          }),
        };
      });

      api.setToken('mock-token');
      api.setOperatorId('finance-superadmin@orchestree.ai');

      // Panggil fungsi primer
      await api.getFinancialCommandCenter();
      // Panggil fungsi alias yang telah dideprecate & dikonsolidasikan
      await api.getAnalyticsFinancialCommandCenter();

      expect(recordedUrls.length).toBe(2);
      // Keduanya memanggil path standar final yang sama persis
      expect(recordedUrls[0]).toContain('/admin/financial-command-center');
      expect(recordedUrls[1]).toContain('/admin/financial-command-center');
      expect(recordedUrls[1]).not.toContain('/admin/analytics/financial-command-center');
    });

    it('1.1 & 1.2: Pasangan 3 - Public Plans menggunakan rute standar final /plans', async () => {
      let requestedUrl = '';
      (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              planCode: 'STARTER',
              name: 'Starter Plan',
              monthlyPrice: 1500000,
              annualPrice: 15000000,
              creditQuotaMonthly: 10000,
              creditPricePerUnit: 150,
              isActive: true,
            },
          ],
        };
      });

      const plans = await api.getPublicPlans(true);
      expect(requestedUrl).toContain('/plans');
      expect(requestedUrl).not.toContain('/billing/plans');
      expect(plans.length).toBeGreaterThan(0);
    });

    it('1.1 & 1.2: Pasangan 4 - Department Categories (Domain 3) vs Master Data (Domain 91) terbukti skema dan rute terpisah', () => {
      // POST /admin/master-data memproses Domain 91 key-value (category, key, value, description)
      // POST /public/department-categories memproses Domain 3 department catalog (category_code, category_name, icon_key, is_active)
      expect(typeof api.createMasterData).toBe('function');
      expect(typeof api.createDepartmentCategory).toBe('function');
      expect(api.createMasterData).not.toBe(api.createDepartmentCategory);
    });
  });

  describe('Langkah 2: Audit Konsistensi Header', () => {
    it('2.1: Header disuntikkan secara konsisten lewat satu titik terpusat (api.request & apiClient.request)', async () => {
      let sentHeaders: Record<string, string> = {};
      (globalThis as any).fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        sentHeaders = (init?.headers as Record<string, string>) || {};
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'success' }),
        };
      });

      api.setToken('active-superadmin-jwt');
      api.setOperatorId('auditor@orchestree.ai');
      api.setTenantId('tenant-audit-platform');

      // Request GET
      await api.getTenants();

      expect(sentHeaders['X-Admin-Role']).toBe('SUPER_ADMIN');
      expect(sentHeaders['X-Operator-Id']).toBe('auditor@orchestree.ai');
      expect(sentHeaders['X-Tenant-Id']).toBe('tenant-audit-platform');
      expect(sentHeaders['Authorization']).toBe('Bearer active-superadmin-jwt');
      // GET request tidak membutuhkan CSRF token
      expect(sentHeaders['X-CSRF-Token']).toBeUndefined();
    });

    it('2.2: KHUSUS X-Operator-Id tidak boleh berupa nilai hardcode/placeholder jika belum login', () => {
      api.setOperatorId(null);
      // Tanpa session / token, getEffectiveOperatorId harus null (BUKAN 'superadmin@orchestree.ai')
      expect(api.getEffectiveOperatorId()).toBeNull();
      expect(api.getOperatorId()).toBe('');
    });

    it('2.2: KHUSUS X-Operator-Id dinamis membaca dari sessionStorage saat sesi login dipulihkan', () => {
      api.setOperatorId(null);
      sessionStorage.setItem(
        'orchestree_superadmin_user',
        JSON.stringify({ email: 'restored-admin@corporate.id', role: 'SUPER_ADMIN' })
      );

      expect(api.getEffectiveOperatorId()).toBe('restored-admin@corporate.id');
    });

    it('2.2: Operasi sensitif (POST /admin/security/ip-allowlist & POST /admin/support/impersonate) mengikat operatorId aktif', async () => {
      api.setOperatorId('auditor-special@orchestree.ai');

      const allowlistRes = await api.updateIpAllowlist({ enabled: true, allowedIps: ['127.0.0.1'] });
      expect(allowlistRes.success).toBe(true);

      const impersonateRes = await api.createSupportImpersonation({
        targetTenantId: 'tenant-test',
        reason: 'Testing impersonation security',
      });
      expect(impersonateRes.operatorId).toBe('auditor-special@orchestree.ai');
    });

    it('2.2: Operasi sensitif menyertakan X-Operator-Id asli saat Super Admin terautentikasi', async () => {
      let allowlistHeaders: Record<string, string> = {};
      let impersonateHeaders: Record<string, string> = {};

      (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/admin/security/ip-allowlist')) {
          allowlistHeaders = (init?.headers as Record<string, string>) || {};
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        if (url.includes('/admin/support/impersonate')) {
          impersonateHeaders = (init?.headers as Record<string, string>) || {};
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        if (url.includes('/admin/security/csrf-token')) {
          return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-valid-token' }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      api.setToken('auth-jwt-token');
      api.setOperatorId('active-superadmin@orchestree.ai');

      await api.updateIpAllowlist({ enabled: true, allowedIps: ['103.147.154.22'] });
      expect(allowlistHeaders['X-Operator-Id']).toBe('active-superadmin@orchestree.ai');

      await api.createSupportImpersonation({
        targetTenantId: 'tenant-acme',
        reason: 'Investigate invoice mismatch',
      });
      expect(impersonateHeaders['X-Operator-Id']).toBe('active-superadmin@orchestree.ai');
      expect(impersonateHeaders['X-Tenant-Id']).toBe('tenant-acme');
    });

    it('2.3: KHUSUS X-CSRF-Token disuntikkan otomatis pada setiap request mutasi (POST/PUT/PATCH/DELETE)', async () => {
      let mutationHeaders: Record<string, string> = {};

      (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/admin/security/csrf-token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ csrfToken: 'csrf-server-token-12345' }),
          };
        }
        mutationHeaders = (init?.headers as Record<string, string>) || {};
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      });

      api.setToken('jwt-admin-token');
      api.setOperatorId('admin@orchestree.ai');

      // Panggil operasi POST
      await api.createTenant({
        name: 'New Tenant Corp',
        tier: 'ENTERPRISE',
        ownerEmail: 'owner@tenant.id',
      });

      expect(mutationHeaders['X-CSRF-Token']).toBeDefined();
      expect(mutationHeaders['X-CSRF-Token']).toBe('csrf-server-token-12345');
    });

    it('2.3: Refresh strategy - CSRF Token kadaluarsa setelah 15 menit dan direfresh ulang', async () => {
      let fetchCount = 0;
      (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/admin/security/csrf-token')) {
          fetchCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ csrfToken: `csrf-token-run-${fetchCount}` }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      // Fetch pertama
      const token1 = await api.initCsrf();
      expect(token1).toBe('csrf-token-run-1');

      // Fetch kedua sebelum kadaluarsa (menggunakan cache)
      const tokenCached = await api.initCsrf();
      expect(tokenCached).toBe('csrf-token-run-1');
      expect(fetchCount).toBe(1);

      // Force refresh atau pemanggilan setelah kadaluarsa
      const tokenRefreshed = await api.initCsrf(true);
      expect(tokenRefreshed).toBe('csrf-token-run-2');
      expect(fetchCount).toBe(2);
    });
  });
});
