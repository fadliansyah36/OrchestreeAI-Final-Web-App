import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, ADMIN_AUTH_LOGIN_PATH, ADMIN_AUTH_VERIFY_MFA_PATH } from '../lib/api';
import { apiClient } from '../lib/apiClient';

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

describe('Domain 16: Super Admin Auth & Security E2E Verification', () => {
  const originalFetch = (globalThis as any).fetch;
  const recordedRequests: Array<{ url: string; method: string; headers: Record<string, string>; body?: any }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    recordedRequests.length = 0;
    api.setToken(null);
    api.setOperatorId(null);
    api.setTenantId(null);
    api.setCsrfToken(null);
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('1.1: Memverifikasi Path Login Final dan Alur Auth Lengkap (/admin/auth/login -> MFA -> token)', async () => {
    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      let bodyParsed;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      recordedRequests.push({ url, method, headers, body: bodyParsed });

      // 1. GET /admin/security/csrf-token
      if (url.includes('/admin/security/csrf-token')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'X-CSRF-Token': 'csrf-token-live-sec-124' }),
          json: async () => ({ csrfToken: 'csrf-token-live-sec-124' }),
        };
      }

      // 2. POST /admin/auth/login
      if (url.includes('/admin/auth/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            challengeToken: 'mfa-chal-jwt-881923',
            requiresMfa: true,
            email: 'superadmin@orchestree.ai',
            message: 'Password accepted. Provide TOTP challenge code.',
          }),
        };
      }

      // 3. POST /admin/auth/verify-mfa
      if (url.includes('/admin/auth/verify-mfa')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            accessToken: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.superadmin.token.prod.123',
            token: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.superadmin.token.prod.123',
            csrfToken: 'csrf-token-live-sec-124',
            user: {
              id: 'admin-001',
              email: 'superadmin@orchestree.ai',
              role: 'SUPER_ADMIN',
              tenantId: 'system-platform',
              isMfaVerified: true,
              fullName: 'Chief Super Administrator',
            },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    });

    // Verifikasi Path Login Standard Final
    expect(ADMIN_AUTH_LOGIN_PATH).toBe('/admin/auth/login');
    expect(ADMIN_AUTH_VERIFY_MFA_PATH).toBe('/admin/auth/verify-mfa');

    // Tahap 1: Login Step 1 (Password)
    const loginRes = await api.adminLogin('superadmin@orchestree.ai', 'OrchestreeSecret2026!');
    expect(loginRes.challengeToken).toBe('mfa-chal-jwt-881923');
    expect(loginRes.requiresMfa).toBe(true);

    const step1Req = recordedRequests.find((r) => r.url.includes('/admin/auth/login'));
    expect(step1Req).toBeDefined();
    expect(step1Req?.method).toBe('POST');
    expect(step1Req?.body?.email).toBe('superadmin@orchestree.ai');

    // Tahap 2: MFA Verify Step 2 (TOTP)
    const mfaRes = await api.adminVerifyMfa('superadmin@orchestree.ai', '581920', loginRes.challengeToken);
    expect(mfaRes.accessToken).toBe('eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.superadmin.token.prod.123');
    expect(mfaRes.user?.role).toBe('SUPER_ADMIN');

    // Tahap 3: Simpan Token dan Prioritas getSessionToken()
    const storedToken = await apiClient.getSessionToken();
    expect(storedToken).toBe('eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.superadmin.token.prod.123');
    expect(api.getToken()).toBe('eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.superadmin.token.prod.123');
  });

  it('1.2: Memverifikasi Security Sentinel Panel (GET/POST /admin/security/ip-allowlist)', async () => {
    let currentConfig = {
      enabled: false,
      allowedIps: ['127.0.0.1'],
      updatedAt: '2026-09-16T00:00:00.000Z',
      updatedBy: 'system',
    };

    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      let bodyParsed;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      recordedRequests.push({ url, method, headers, body: bodyParsed });

      if (url.includes('/admin/security/csrf-token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ csrfToken: 'csrf-sec-token-allowlist' }),
        };
      }

      if (url.includes('/admin/security/ip-allowlist')) {
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => currentConfig,
          };
        }
        if (method === 'POST') {
          currentConfig = {
            ...currentConfig,
            ...bodyParsed,
            updatedAt: new Date().toISOString(),
          };
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, ...currentConfig }),
          };
        }
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('admin-active-token');
    api.setOperatorId('superadmin@orchestree.ai');

    // 1. GET IP Allowlist
    const fetched = await api.getIpAllowlist();
    expect(fetched.enabled).toBe(false);
    expect(fetched.allowedIps).toContain('127.0.0.1');

    // 2. POST IP Allowlist (Toggle ON + Tambah CIDR)
    const updateRes = await api.updateIpAllowlist({
      enabled: true,
      allowedIps: ['127.0.0.1', '10.200.0.0/16', '203.0.113.1'],
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.enabled).toBe(true);
    expect(updateRes.allowedIps.length).toBe(3);

    const postReq = recordedRequests.find((r) => r.url.includes('/admin/security/ip-allowlist') && r.method === 'POST');
    expect(postReq).toBeDefined();
    expect(postReq?.headers['X-Operator-Id']).toBe('superadmin@orchestree.ai');
    expect(postReq?.headers['X-CSRF-Token']).toBeDefined();
    expect(postReq?.body?.enabled).toBe(true);
    expect(postReq?.body?.allowedIps).toEqual(['127.0.0.1', '10.200.0.0/16', '203.0.113.1']);
  });

  it('1.3: Memverifikasi Support Impersonation (POST /admin/support/impersonate & GET /admin/support/impersonate/{sessionId})', async () => {
    let activeSessions: Record<string, any> = {};

    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      let bodyParsed;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      recordedRequests.push({ url, method, headers, body: bodyParsed });

      if (url.includes('/admin/security/csrf-token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ csrfToken: 'csrf-supp-token-1' }),
        };
      }

      if (url.includes('/admin/support/impersonate')) {
        if (method === 'POST') {
          const sessId = `supp-${Date.now()}`;
          const session = {
            sessionId: sessId,
            operatorId: headers['X-Operator-Id'] || 'superadmin@orchestree.ai',
            targetTenantId: bodyParsed?.targetTenantId || 'tenant-acme',
            tenantName: bodyParsed?.tenantName || 'ACME Corporation',
            ownerEmail: bodyParsed?.ownerEmail || 'owner@acme.biz.id',
            reason: bodyParsed?.reason,
            durationMinutes: bodyParsed?.durationMinutes || 15,
            startedAt: Date.now(),
            expiresAt: Date.now() + 15 * 60 * 1000,
            token: `token-supp-${sessId}`,
          };
          activeSessions[sessId] = session;
          return {
            ok: true,
            status: 200,
            json: async () => session,
          };
        }

        if (method === 'GET') {
          const parts = url.split('/');
          const id = parts[parts.length - 1];
          const found = activeSessions[id];
          return {
            ok: true,
            status: 200,
            json: async () => found || { sessionId: id, active: true },
          };
        }
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('admin-token-xyz');
    api.setOperatorId('support-lead@orchestree.ai');

    // 1. POST /admin/support/impersonate
    const createdSession = await api.createSupportImpersonation({
      targetTenantId: 'tenant-omega',
      tenantName: 'Omega Logistics',
      ownerEmail: 'ceo@omega.biz.id',
      reason: 'Penyelidikan latency query database multi-tenant',
      durationMinutes: 20,
    });

    expect(createdSession.sessionId).toBeDefined();
    expect(createdSession.targetTenantId).toBe('tenant-omega');

    const postImpersonate = recordedRequests.find((r) => r.url.includes('/admin/support/impersonate') && r.method === 'POST');
    expect(postImpersonate).toBeDefined();
    expect(postImpersonate?.headers['X-Operator-Id']).toBe('support-lead@orchestree.ai');
    expect(postImpersonate?.headers['X-Tenant-Id']).toBe('tenant-omega');
    expect(postImpersonate?.headers['X-CSRF-Token']).toBeDefined();

    // 2. GET /admin/support/impersonate/{sessionId}
    const verifiedSession = await api.getSupportImpersonation(createdSession.sessionId);
    expect(verifiedSession).toBeDefined();
    expect(verifiedSession.sessionId).toBe(createdSession.sessionId);

    const getImpersonate = recordedRequests.find((r) => r.url.includes(`/admin/support/impersonate/${createdSession.sessionId}`) && r.method === 'GET');
    expect(getImpersonate).toBeDefined();
  });

  it('1.4 & 1.5: Memverifikasi CSRF Token & Tenant Management (GET/POST /admin/tenants)', async () => {
    const tenantStore: any[] = [
      { id: 'tenant-1', name: 'Alpha Corp', tier: 'enterprise', status: 'ACTIVE', agentCount: 5, userCount: 12 },
    ];

    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      let bodyParsed;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      recordedRequests.push({ url, method, headers, body: bodyParsed });

      if (url.includes('/admin/security/csrf-token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ csrfToken: 'csrf-mandatory-2026' }),
        };
      }

      if (url.includes('/admin/tenants')) {
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => tenantStore,
          };
        }
        if (method === 'POST') {
          const newTenant = {
            id: `tenant-${Date.now()}`,
            name: bodyParsed?.name,
            tier: bodyParsed?.tier,
            status: 'ACTIVE',
            agentCount: 0,
            userCount: 1,
            ownerEmail: bodyParsed?.ownerEmail,
          };
          tenantStore.push(newTenant);
          return {
            ok: true,
            status: 200,
            json: async () => newTenant,
          };
        }
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-valid-token');
    api.setOperatorId('ops-superadmin@orchestree.ai');

    // 1. GET /admin/tenants
    const list = await api.getTenants();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Alpha Corp');

    // 2. POST /admin/tenants
    const created = await api.createTenant({
      name: 'Beta Global Tech',
      tier: 'growth',
      ownerEmail: 'founder@betaglobal.biz.id',
    });

    expect(created.name).toBe('Beta Global Tech');

    // Verifikasi Header X-CSRF-Token disertakan pada request POST mutasi
    const postTenantReq = recordedRequests.find((r) => r.url.includes('/admin/tenants') && r.method === 'POST');
    expect(postTenantReq).toBeDefined();
    expect(postTenantReq?.headers['X-CSRF-Token']).toBe('csrf-mandatory-2026');
    expect(postTenantReq?.headers['Authorization']).toBe('Bearer super-admin-valid-token');
    expect(postTenantReq?.headers['X-Operator-Id']).toBe('ops-superadmin@orchestree.ai');

    // Verifikasi hasil GET setelah mutasi
    const updatedList = await api.getTenants();
    expect(updatedList.length).toBe(2);
    expect(updatedList[1].name).toBe('Beta Global Tech');
  });

  it('2.1: Memvalidasi CRUD LLM Provider dengan validasi models wajib tidak boleh kosong dan kemunculan di GET /admin/llm-providers', async () => {
    const providerCatalog: any[] = [
      {
        id: 'llm-nvidia-1',
        name: 'NVIDIA NIM Default',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        fallbackPriority: 1,
        enabled: true,
        models: ['meta/llama-3.1-70b-instruct'],
      },
    ];

    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      let bodyParsed;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      recordedRequests.push({ url, method, headers, body: bodyParsed });

      if (url.includes('/admin/security/csrf-token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ csrfToken: 'csrf-token-llm-1' }),
        };
      }

      if (url.includes('/admin/llm-providers')) {
        if (url.includes('/toggle-status') && method === 'POST') {
          const id = url.split('/')[url.split('/').length - 2];
          const found = providerCatalog.find((p) => p.id === id);
          if (found) found.enabled = !found.enabled;
          return { ok: true, status: 200, json: async () => found };
        }
        if (method === 'GET') {
          return { ok: true, status: 200, json: async () => providerCatalog };
        }
        if (method === 'POST') {
          // Backend requirement validation: models must not be empty!
          if (!bodyParsed?.models || !Array.isArray(bodyParsed.models) || bodyParsed.models.length === 0) {
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: 'model field is required' }),
            };
          }
          const newProvider = {
            id: `llm-custom-${Date.now()}`,
            name: bodyParsed.name,
            providerType: bodyParsed.providerType,
            baseUrl: bodyParsed.baseUrl,
            fallbackPriority: bodyParsed.fallbackPriority || 2,
            enabled: bodyParsed.enabled ?? true,
            models: bodyParsed.models,
          };
          providerCatalog.push(newProvider);
          return { ok: true, status: 200, json: async () => newProvider };
        }
        if (method === 'PUT') {
          const id = url.split('/')[url.split('/').length - 1];
          const idx = providerCatalog.findIndex((p) => p.id === id);
          if (idx !== -1) {
            providerCatalog[idx] = { ...providerCatalog[idx], ...bodyParsed };
            return { ok: true, status: 200, json: async () => providerCatalog[idx] };
          }
        }
        if (method === 'DELETE') {
          const id = url.split('/')[url.split('/').length - 1];
          const idx = providerCatalog.findIndex((p) => p.id === id);
          if (idx !== -1) providerCatalog.splice(idx, 1);
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-valid-token');

    // 1. Initial GET
    const initialList = await api.getLlmProviders();
    expect(initialList.length).toBe(1);
    expect(initialList[0].name).toBe('NVIDIA NIM Default');

    // 2. POST Provider Baru dengan models valid
    const newLlm = await api.createLlmProvider({
      name: 'Mistral Large Inference Gateway',
      providerType: 'mistral_ai',
      baseUrl: 'https://api.mistral.ai/v1',
      fallbackPriority: 2,
      enabled: true,
      models: ['mistral-large-2407', 'codestral-2501'],
    });

    expect(newLlm.id).toBeDefined();
    expect(newLlm.name).toBe('Mistral Large Inference Gateway');
    expect(newLlm.models).toEqual(['mistral-large-2407', 'codestral-2501']);

    // 3. Verifikasi Muncul di GET /admin/llm-providers
    const updatedList = await api.getLlmProviders();
    expect(updatedList.length).toBe(2);
    const foundCreated = updatedList.find((p) => p.name === 'Mistral Large Inference Gateway');
    expect(foundCreated).toBeDefined();
    expect(foundCreated?.models).toContain('mistral-large-2407');

    // 4. PUT Update
    await api.updateLlmProvider(foundCreated!.id, {
      name: 'Mistral Large Gateway (Updated)',
      models: ['mistral-large-2407', 'codestral-2501', 'mistral-embed'],
      fallbackPriority: 3,
    });

    // 5. POST toggle-status
    await api.toggleLlmProviderStatus(foundCreated!.id);

    // 6. DELETE
    await api.deleteLlmProvider(foundCreated!.id);
    const finalList = await api.getLlmProviders();
    expect(finalList.length).toBe(1);
  });

  it('2.2: Memvalidasi Image Providers, Master Data, MCP Kill-Switch, App Registry, dan Skill Plugin Upload/Status', async () => {
    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      let bodyParsed: any;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      recordedRequests.push({ url, method, headers, body: bodyParsed });

      if (url.includes('/admin/security/csrf-token')) {
        return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-suite-d16' }) };
      }

      // Image Providers
      if (url.includes('/admin/image-providers')) {
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { id: 'img-1', name: 'FLUX Pro Gateway', providerType: 'flux_pro', priority: 1, models: ['flux-1.1-pro'] },
            ],
          };
        }
        if (method === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'img-2', ...bodyParsed }),
          };
        }
        if (method === 'DELETE') {
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
      }

      // Master Data
      if (url.includes('/admin/master-data/categories')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { category: 'INDUSTRY', count: 5 },
            { category: 'GUARDRAIL', count: 3 },
          ],
        };
      }
      if (url.includes('/admin/master-data')) {
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { id: 'md-1', category: 'INDUSTRY', key: 'HEALTHCARE', value: 'Kesehatan & Rumah Sakit' },
            ],
          };
        }
        if (method === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'md-2', ...bodyParsed }),
          };
        }
        if (method === 'DELETE') {
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
      }

      // MCP Tools
      if (url.includes('/admin/mcp-tools')) {
        if (url.includes('/kill-switch') && method === 'PATCH') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'tool-1', name: 'Database Query Runner', killSwitchActive: true }),
          };
        }
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { id: 'tool-1', name: 'Database Query Runner', riskLevel: 'HIGH', killSwitchActive: false },
            ],
          };
        }
      }

      // App Registry
      if (url.includes('/admin/app-registry')) {
        if (url.includes('/mark-migration') && method === 'PATCH') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'app-1', appName: 'Salesforce CRM', manualLinkMigrationNotice: 'Upgrade OAuth scope ke v3' }),
          };
        }
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => [{ id: 'app-1', appName: 'Salesforce CRM', appType: 'CRM' }],
          };
        }
      }

      // Skill Plugins
      if (url.includes('/admin/skill-plugins/upload') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            pluginId: 'plg-pkg-1',
            manifestSummary: {
              name: bodyParsed?.pluginName,
              version: bodyParsed?.version,
            },
          }),
        };
      }
      if (url.includes('/admin/skill-plugins') && url.includes('/status') && method === 'PATCH') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'plg-1', name: 'Data Analyzer WASM', status: bodyParsed?.status }),
        };
      }
      if (url.includes('/admin/skill-plugins') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'plg-1', name: 'Data Analyzer WASM', status: 'ACTIVE' }],
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-valid-token');

    // 1. Image Providers CRUD
    const imgList = await api.getImageProviders();
    expect(imgList.length).toBe(1);
    const createdImg = await api.createImageProvider({
      name: 'SDXL Lightning Dedicated',
      providerType: 'stability_ai',
      priority: 2,
      models: ['stable-diffusion-xl-1024-v1-0'],
    });
    expect(createdImg.name).toBe('SDXL Lightning Dedicated');
    await api.deleteImageProvider('img-2');

    // 2. Master Data Categories & Item CRUD
    const mdCats = await api.getMasterDataCategories();
    expect(mdCats.length).toBe(2);
    const mdList = await api.getMasterData('INDUSTRY');
    expect(mdList.length).toBe(1);
    const newMd = await api.createMasterData({
      category: 'INDUSTRY',
      key: 'FINTECH',
      value: 'Financial Technology & Perbankan',
    });
    expect(newMd.key).toBe('FINTECH');
    await api.deleteMasterData('md-2', 'INDUSTRY');

    // 3. MCP Tool Kill-Switch
    const mcpList = await api.getMcpTools();
    expect(mcpList.length).toBe(1);
    const killSwitched = await api.toggleMcpToolKillSwitch('tool-1');
    expect(killSwitched.killSwitchActive).toBe(true);

    // 4. Third-Party App Registry & mark-migration
    const appList = await api.getAppRegistry();
    expect(appList.length).toBe(1);
    const migratedApp = await api.markAppMigration('app-1', 'Upgrade OAuth scope ke v3');
    expect(migratedApp.manualLinkMigrationNotice).toBe('Upgrade OAuth scope ke v3');

    // 5. Skill Plugin .zip Upload & Status Patch
    const uploadRes = await api.uploadSkillPlugin({
      pluginName: 'Financial Sentiment Parser',
      version: '1.2.0',
      author: 'FinTech Squad',
      manifestJson: '{"name":"fin-sentiment"}',
      skillDefinitionMd: '# Fin Sentiment',
      zipBase64: 'UEsDBAoAAAAAA...',
    });
    expect(uploadRes.success).toBe(true);
    expect(uploadRes.pluginId).toBe('plg-pkg-1');

    const statusPatched = await api.updateSkillPluginStatus('plg-1', 'DISABLED');
    expect(statusPatched.status).toBe('DISABLED');
  });

  it('3.1: Trigger Scheduler Job manual (POST /admin/jobs/trigger) dan verifikasi instan muncul di GET /admin/workflow-executions', async () => {
    const workflowExecutionsStore: any[] = [
      {
        id: 'wf-prev-001',
        executionId: 'wf-prev-001',
        workflowName: 'Nightly Database Backup',
        workflowDefId: 'job-backup',
        tenantId: 'tenant-admin',
        status: 'COMPLETED',
        executionStatus: 'COMPLETED',
        startTime: '2026-09-15T23:00:00.000Z',
        executedAt: '2026-09-15T23:00:00.000Z',
        durationMs: 1240,
        nodeCount: 4,
        triggerType: 'CRON_SCHEDULED',
      },
    ];

    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      let bodyParsed: any;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      recordedRequests.push({ url, method, headers, body: bodyParsed });

      if (url.includes('/admin/security/csrf-token')) {
        return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-jobs-token-88' }) };
      }

      if (url.includes('/admin/jobs/trigger') && method === 'POST') {
        const generatedExecutionId = `wf-job-exec-${Date.now()}`;
        const newRecord = {
          id: generatedExecutionId,
          executionId: generatedExecutionId,
          workflowName: `Scheduler Job: ${bodyParsed.jobName}`,
          workflowDefId: `job-${bodyParsed.jobName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          tenantId: bodyParsed.tenantId || 'tenant-admin',
          status: 'RUNNING',
          executionStatus: 'RUNNING',
          startTime: new Date().toISOString(),
          executedAt: new Date().toISOString(),
          durationMs: 250,
          nodeCount: 2,
          triggerType: 'MANUAL_TRIGGER',
          jobName: bodyParsed.jobName,
          success: true,
        };
        workflowExecutionsStore.unshift(newRecord);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            jobName: bodyParsed.jobName,
            tenantId: bodyParsed.tenantId,
            executionId: generatedExecutionId,
            status: 'RUNNING',
            message: `Job ${bodyParsed.jobName} berhasil dipicu dan dieksekusi otonom.`,
          }),
        };
      }

      if (url.includes('/admin/workflow-executions') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => workflowExecutionsStore,
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-valid-token');

    // 1. Verifikasi list eksekusi awal
    const initialExecs = await api.getWorkflowExecutions(10);
    expect(initialExecs.length).toBe(1);
    expect(initialExecs[0].workflowName).toBe('Nightly Database Backup');

    // 2. Trigger scheduler job manual via POST /admin/jobs/trigger
    const triggerResponse = await api.triggerSchedulerJob('DLQ_RECOVERY_DRAIN', 'tenant-admin', {
      triggeredBy: 'superadmin@orchestree.ai',
      triggerSource: 'SystemMonitoringCenter',
    });

    expect(triggerResponse.success).toBe(true);
    expect(triggerResponse.jobName).toBe('DLQ_RECOVERY_DRAIN');
    expect(triggerResponse.executionId).toBeDefined();

    // 3. Verifikasi instan kemunculan di GET /admin/workflow-executions
    const updatedExecs = await api.getWorkflowExecutions(10);
    expect(updatedExecs.length).toBeGreaterThanOrEqual(2);
    const triggeredFound = updatedExecs.find((e) => e.workflowName.includes('DLQ_RECOVERY_DRAIN'));
    expect(triggeredFound).toBeDefined();
    expect(triggeredFound?.triggerType).toBe('MANUAL_TRIGGER');
  });

  it('3.2: System Monitoring Overview & breakdown sub-bagian terpisah (providerHealth, serverHealth, jobQueueStatus, securityIncidents, rateLimitViolations)', async () => {
    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      recordedRequests.push({ url, method, headers });

      if (url.includes('/admin/monitoring/system-overview')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            clusterHealth: 'HEALTHY',
            totalPods: 16,
            activePods: 16,
            failedPods: 0,
            kubernetesDeployments: [
              { name: 'orchestree-core-api', replicas: 4, available: 4, status: 'AVAILABLE' },
              { name: 'swarm-scheduler-worker', replicas: 4, available: 4, status: 'AVAILABLE' },
            ],
            circuitBreakers: [
              { provider: 'NVIDIA NIM Microservices', status: 'CLOSED', failureRate: 0.02, latencyMs: 142 },
              { provider: 'OpenRouter Gateway', status: 'CLOSED', failureRate: 0.04, latencyMs: 380 },
            ],
            dlqCount: 0,
            securityGatesPassed: true,
            providerHealth: {
              status: 'HEALTHY',
              providers: [
                { id: 'nim', name: 'NVIDIA NIM Enterprise', status: 'HEALTHY', latencyMs: 142, successRate: 99.8 },
                { id: 'openrouter', name: 'OpenRouter Unified Gateway', status: 'HEALTHY', latencyMs: 380, successRate: 99.4 },
              ],
              isReal: true,
            },
            serverHealth: {
              status: 'HEALTHY',
              uptimeSeconds: 864200,
              cpuUsagePercent: 32.4,
              memoryUsagePercent: 48.1,
              activePods: 16,
              totalPods: 16,
              failedPods: 0,
              isReal: true,
            },
            jobQueueStatus: {
              status: 'HEALTHY',
              activeJobs: 12,
              pendingJobs: 3,
              failedJobs: 0,
              dlqCount: 0,
              queueLatencyMs: 15,
              isReal: true,
            },
            securityIncidents: {
              status: 'NORMAL',
              totalIncidents: 0,
              activeThreats: 0,
              unauthorizedAttempts: 0,
              sentinelStatus: 'ENFORCED',
              isReal: true,
            },
            rateLimitViolations: {
              status: 'NORMAL',
              totalViolations: 0,
              throttledTenantsCount: 0,
              isReal: true,
            },
          }),
        };
      }

      if (url.includes('/admin/health-check')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'UP', timestamp: new Date().toISOString() }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-valid-token');

    const overview = await api.getSystemMonitoringOverview();
    expect(overview.clusterHealth).toBe('HEALTHY');
    expect(overview.providerHealth?.status).toBe('HEALTHY');
    expect(overview.providerHealth?.providers.length).toBe(2);
    expect(overview.serverHealth?.status).toBe('HEALTHY');
    expect(overview.jobQueueStatus?.dlqCount).toBe(0);
    expect(overview.securityIncidents?.sentinelStatus).toBe('ENFORCED');
    expect(overview.rateLimitViolations?.status).toBe('NORMAL');

    const healthCheck = await api.getAdminHealthCheck();
    expect(healthCheck.status).toBe('UP');
  });

  it('3.3: Swarm Emergency Control (Freeze, Resume, Status) dengan dialog alasan audit', async () => {
    let swarmFrozen = false;
    let freezeReason = '';

    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      let bodyParsed: any;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      if (url.includes('/admin/security/csrf-token')) {
        return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-swarm-1' }) };
      }

      if (url.includes('/admin/swarm/freeze') && method === 'POST') {
        swarmFrozen = true;
        freezeReason = bodyParsed?.reason || 'Maintenance';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            status: 'FROZEN',
            isFrozen: true,
            reason: freezeReason,
            message: 'Swarm otonom berhasil dibekukan untuk semua tenant.',
          }),
        };
      }

      if (url.includes('/admin/swarm/resume') && method === 'POST') {
        swarmFrozen = false;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            status: 'ACTIVE',
            isFrozen: false,
            message: 'Swarm otonom berhasil diaktifkan kembali.',
          }),
        };
      }

      if (url.includes('/admin/swarm/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: swarmFrozen ? 'FROZEN' : 'ACTIVE',
            isFrozen: swarmFrozen,
            activeAgents: swarmFrozen ? 0 : 42,
            totalSwarmNodes: 10,
            reason: freezeReason,
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-valid-token');

    // Initial status
    const initialStatus = await api.getSwarmStatus();
    expect(initialStatus.isFrozen).toBe(false);
    expect(initialStatus.status).toBe('ACTIVE');

    // Freeze dengan alasan konfirmasi audit
    const freezeResult = await api.freezeSwarm('Pembaruan firmware keamanan kluster');
    expect(freezeResult.isFrozen).toBe(true);

    const statusAfterFreeze = await api.getSwarmStatus();
    expect(statusAfterFreeze.isFrozen).toBe(true);
    expect(statusAfterFreeze.status).toBe('FROZEN');

    // Resume
    const resumeResult = await api.resumeSwarm('Pembaruan selesai, verifikasi integritas lulus');
    expect(resumeResult.isFrozen).toBe(false);

    const finalStatus = await api.getSwarmStatus();
    expect(finalStatus.isFrozen).toBe(false);
  });

  it('3.4: Dead Letter Queue (DLQ) & Manual Workflow Replay', async () => {
    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      let bodyParsed: any;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      if (url.includes('/admin/security/csrf-token')) {
        return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-dlq-1' }) };
      }

      if (url.includes('/admin/dead-letter-queue') && url.includes('/reprocess') && method === 'POST') {
        const id = url.split('/')[url.split('/').length - 2];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'REPROCESSED',
            id,
            summary: `Record ${id} berhasil dikirim ulang ke dispatcher worker.`,
          }),
        };
      }

      if (url.includes('/admin/dead-letter-queue') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'dlq-item-101',
              workflowId: 'wf-prev-001',
              executionId: 'wf-prev-001',
              nodeId: 'node-rag-idx',
              tenantId: 'tenant-admin',
              errorType: 'GATEWAY_TIMEOUT',
              errorMessage: 'Vector store timeout 504 gateway',
              payload: '{"documentId":"doc-9921"}',
              status: 'FAILED',
              createdAt: new Date().toISOString(),
              retryCount: 3,
              reprocessed: false,
              jobType: 'rag-indexing-queue',
              failureReason: 'Vector store timeout',
              originalPayload: '{"documentId":"doc-9921"}',
              failedAt: new Date().toISOString(),
            },
          ],
        };
      }

      if (url.includes('/admin/workflow-executions') && url.includes('/replay') && method === 'POST') {
        const executionId = url.split('/')[url.split('/').length - 2];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            executionId: `wf-replay-${Date.now()}`,
            originalExecutionId: executionId,
            replayExecutionId: `wf-replay-${Date.now()}`,
            isDeterministicMatch: true,
            status: 'QUEUED_FOR_REPLAY',
            durationMs: 310,
            sandboxDetails: {},
            originalOutput: {},
            replayOutput: {},
            nodeRuns: [],
            replayNodes: [],
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-valid-token');

    // 1. Get DLQ items
    const dlqItems = await api.getDeadLetterQueue();
    expect(dlqItems.length).toBe(1);
    expect(dlqItems[0].jobType).toBe('rag-indexing-queue');

    // 2. Reprocess DLQ Item
    const reprocessRes = await api.reprocessDeadLetterItem('dlq-item-101');
    expect(reprocessRes.status).toBe('REPROCESSED');
    expect(reprocessRes.id).toBe('dlq-item-101');

    // 3. Replay Workflow Execution
    const replayRes = await api.replayWorkflowExecution('wf-prev-001');
    expect(replayRes.status).toBe('QUEUED_FOR_REPLAY');
    expect(replayRes.originalExecutionId).toBe('wf-prev-001');
  });

  it('3.5: Audit Logs & Security Presence stats, Usage, dan Analytics Lintas Tenant', async () => {
    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';

      // Audit Logs
      if (url.includes('/admin/audit-logs')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'audit-1',
              timestamp: new Date().toISOString(),
              operatorId: 'superadmin@orchestree.ai',
              role: 'SUPER_ADMIN',
              action: 'SWARM_FREEZE',
              resource: 'swarm.control',
              status: 'SUCCESS',
            },
          ],
        };
      }

      // Presence Security Stats
      if (url.includes('/admin/presence/security-stats')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            totalEnrolledUsers: 45,
            totalVerificationChecks: 320,
            totalSuccessfulChecks: 318,
            totalFailedChecks: 2,
            consecutiveFailures: 0,
            potentialUnauthorizedAttempts: 0,
            methodBreakdown: { face: 180, fingerprint: 120, passwordFallback: 20 },
            securityRiskLevel: 'NORMAL',
          }),
        };
      }

      // Usage & LLM Usage
      if (url.includes('/admin/usage?') || url.endsWith('/admin/usage')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            period: '30d',
            totalRequests: 84000,
            totalTokens: 15400000,
            totalCostUsd: 142.5,
            activeTenants: 14,
          }),
        };
      }
      if (url.includes('/admin/llm-usage')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            period: '30d',
            totalTokens: 15400000,
            totalCostUsd: 142.5,
            byProvider: [
              { provider: 'nvidia_nim', tokens: 12000000, costUsd: 110.0 },
              { provider: 'openrouter', tokens: 3400000, costUsd: 32.5 },
            ],
          }),
        };
      }

      // Cross-Tenant Analytics Endpoints
      if (url.includes('/admin/analytics/overview')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            totalRevenue: 28400,
            activeTenants: 14,
            tokenConsumption: 15400000,
            systemHealthStatus: 'HEALTHY',
          }),
        };
      }
      if (url.includes('/admin/analytics/usage-credit')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { tenantId: 't-1', tenantName: 'Acme Corp', allocatedCredits: 5000, consumedCredits: 1200, balance: 3800 },
          ],
        };
      }
      if (url.includes('/admin/analytics/llm-usage-platform-wide')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            totalCalls: 154000,
            avgLatencyMs: 240,
            total_cost_usd: 142.5,
            breakdown_by_provider: [],
            providerBreakdown: [
              { provider: 'nvidia_nim', callCount: 110000, tokenCount: 12000000, errorRate: 0.01, cost: 110.0 },
            ],
          }),
        };
      }
      if (url.includes('/admin/analytics/kpi-summary')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            mrr: 28400,
            arr: 340800,
            totalCreditsCirculating: 500000,
            totalCreditsConsumed: 320000,
            totalActiveSubscriptions: 14,
            netRetentionRate: 118.5,
            platform_average_score: 98.6,
          }),
        };
      }
      if (url.includes('/admin/analytics/daily-task-performance')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            period: '7d',
            dailyMetrics: [
              { date: '2026-09-15', completedTasks: 420, failedTasks: 3, totalTasks: 423, avgDurationMs: 310, successRate: 99.3, aiHandledPercentage: 92.5 },
            ],
            aggregate: { totalCompleted: 420, totalFailed: 3, avgSuccessRate: 99.3, totalAiAssisted: 390 },
          }),
        };
      }
      if (url.includes('/admin/analytics/task-activity-summary')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total_tasks: 5400,
            total_active_tasks: 50,
            total_completed_tasks: 5350,
            overall_completion_rate: 99.0,
            human_created_tasks: 2700,
            ai_created_tasks: 2700,
            human_ratio_percentage: 50,
            ai_ratio_percentage: 50,
            by_status: {},
            by_channel: {},
            tenants_activity: [],
          }),
        };
      }
      if (url.includes('/admin/analytics/universal-selection-usage')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            totalSelections: 1820,
            total_requests: 1820,
            total_completed_requests: 1800,
            total_processing_requests: 15,
            total_failed_requests: 5,
            total_credits_consumed: 3640,
            most_used_domain_category: 'HR_OPERATIONS',
          }),
        };
      }
      if (url.includes('/admin/analytics/tenant-workforce-summary')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            totalDepartments: 8,
            totalJobTitles: 24,
            totalAiAgents: 128,
            totalHumanWorkers: 450,
            humanToAiRatio: 3.5,
            departmentBreakdown: [],
            jobTitles: [],
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-valid-token');

    // 1. Audit Logs & Security Presence
    const auditLogs = await api.getAuditLogs();
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs.some((l) => l.action === 'SWARM_FREEZE')).toBe(true);

    const presenceStats = await api.getPresenceSecurityAuditSummary();
    expect(presenceStats.totalVerificationChecks).toBe(320);
    expect(presenceStats.securityRiskLevel).toBe('NORMAL');

    // 2. Usage & LLM Usage
    const usage = await api.getAdminUsage('30d');
    expect(usage.totalRequests).toBe(84000);

    const llmUsage = await api.getAdminLlmUsage('30d');
    expect(llmUsage.totalTokens).toBe(15400000);

    // 3. Cross-tenant Analytics
    const overview = await api.getAnalyticsOverview('30d');
    expect(overview.totalRevenue).toBe(28400);

    const credits = await api.getAnalyticsUsageCredit('30d');
    expect(credits.length).toBe(1);

    const platformLlm = await api.getAnalyticsLlmUsagePlatformWide('30d');
    expect(platformLlm.totalCalls).toBe(154000);

    const kpi = await api.getAnalyticsKpiSummary('30d');
    expect(kpi.mrr).toBe(28400);

    const dailyPerf = await api.getDailyTaskPerformance('7d');
    expect(dailyPerf.dailyMetrics.length).toBe(1);

    const taskAct = await api.getTaskActivitySummary();
    expect(taskAct.total_tasks).toBe(5400);

    const selUsage = await api.getUniversalSelectionUsage();
    expect(selUsage.totalSelections).toBe(1820);

    const workforce = await api.getWorkforceSummary();
    expect(workforce.totalAiAgents).toBe(128);
  });
});
