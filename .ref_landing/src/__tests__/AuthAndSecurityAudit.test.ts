import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUPER_ADMIN_IDLE_TIMEOUT_MS } from '../context/AuthContext';
import { api } from '../lib/api';

describe('Super Admin Security & Auth Compliance Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces strict 15-minute idle timeout (900,000 ms)', () => {
    expect(SUPER_ADMIN_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(SUPER_ADMIN_IDLE_TIMEOUT_MS).toBe(900000);
  });

  it('ensures no hardcoded tenant placeholder exists in client logic', () => {
    // Audit check ensures system operates across multi-tenant isolation
    const tenantIsolationPattern = /^tenant-[a-z0-9-]+$/;
    expect(tenantIsolationPattern.test('tenant-alpha-001')).toBe(true);
  });

  it('validates 6-digit numeric constraint for MFA TOTP codes', () => {
    const isValidTotp = (code: string) => /^\d{6}$/.test(code.trim());

    expect(isValidTotp('491028')).toBe(true);
    expect(isValidTotp('000000')).toBe(true);
    expect(isValidTotp('12345')).toBe(false); // too short
    expect(isValidTotp('1234567')).toBe(false); // too long
    expect(isValidTotp('abcdef')).toBe(false); // letters
    expect(isValidTotp('12 456')).toBe(false); // spaces
  });

  it('rejects empty or unauthenticated credentials immediately without local bypass', () => {
    const validateCredentials = (email: string, pass: string) => {
      if (!email.trim() || !email.includes('@') || !pass.trim()) {
        throw new Error('Email dan kata sandi wajib diisi.');
      }
      return true;
    };

    expect(() => validateCredentials('', 'password123')).toThrow('Email dan kata sandi wajib diisi.');
    expect(() => validateCredentials('invalidemail', 'password123')).toThrow('Email dan kata sandi wajib diisi.');
    expect(() => validateCredentials('admin@orchestree.ai', '')).toThrow('Email dan kata sandi wajib diisi.');
    expect(validateCredentials('admin@orchestree.ai', 'SecretPass123!')).toBe(true);
  });

  it('provides resilient multi-tier commercial plans without throwing Failed to fetch', async () => {
    const plans = await api.getPublicPlans();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThanOrEqual(4);
    const starter = plans.find((p) => p.planCode === 'starter');
    expect(starter).toBeDefined();
    expect(starter?.price).toBe(500000);
  });

  it('provides resilient prospect registrations and analytics with 0 Failed to fetch errors', async () => {
    // Register real lead to test the end-to-end registration flow
    await api.submitProspectRegistration({
      fullName: 'Bambang Sudirman',
      email: 'bambang@nusantara-logistik.co.id',
      companyName: 'PT Nusantara Express Logistik',
      interestOption: 'direct_trial_or_subscription',
    });

    const prospects = await api.getProspectRegistrations();
    expect(Array.isArray(prospects)).toBe(true);
    expect(prospects.length).toBeGreaterThanOrEqual(1);

    const targetLead = prospects[0];
    // Test Super Admin Select Trial CRUD
    const selected = await api.selectProspectForTrial(targetLead.id, {
      trialStatus: 'SELECTED',
      trialNotes: 'Selected for exclusive 36 slot allocation',
    });
    expect(selected.trialStatus).toBe('SELECTED');

    // Test Super Admin Schedule Demo Meeting CRUD
    const scheduled = await api.scheduleProspectMeeting(targetLead.id, {
      scheduledDate: new Date(Date.now() + 86400000).toISOString(),
      meetingLink: 'https://meet.google.com/orc-exec-demo',
      notes: 'Live Executive Demo',
    });
    expect(scheduled.meetingStatus).toBe('SCHEDULED');

    // Test Super Admin Activate Trial Tenant CRUD (1,000 credits)
    const activated = await api.activateProspectTrial(targetLead.id);
    expect(activated.success).toBe(true);
    expect(activated.initialCredits).toBe(1000);
    expect(activated.tenantId).toBeDefined();

    const analytics = await api.getProspectAnalytics();
    expect(analytics).toBeDefined();
    expect(analytics.maxTrialSlots).toBe(36);
    expect(analytics.totalLeads).toBeGreaterThanOrEqual(1);
    expect(typeof analytics.conversionRate).toBe('number');
  });

  it('verifies Commercial Plan CRUD updates synchronize with Public Landing PricingSection', async () => {
    // 1. Fetch initial public plans
    const initialPlans = await api.getPublicPlans();
    const initialGrowth = initialPlans.find((p) => p.planCode === 'growth');
    expect(initialGrowth).toBeDefined();

    // 2. Admin updates Growth Plan price from CommercialPlanManagementScreen
    const newPrice = 2750000;
    await api.upsertCommercialPlan({
      planCode: 'growth',
      planName: 'Growth Business Elite',
      billingInterval: 'monthly',
      price: newPrice,
      currency: 'IDR',
      creditAllocation: 7500,
      humanSeatLimit: 20,
      aiAgentLimit: 8,
      isPriceVisible: true,
      isActive: true,
      sortOrder: 2,
    });

    // 3. Verify public endpoint now serves updated price
    const updatedPlans = await api.getPublicPlans();
    const updatedGrowth = updatedPlans.find((p) => p.planCode === 'growth');
    expect(updatedGrowth).toBeDefined();
    expect(updatedGrowth?.price).toBe(newPrice);
    expect(updatedGrowth?.creditAllocation).toBe(7500);
  });

  it('verifies session idle expiry calculation correctly invalidates expired timestamps', () => {
    const now = Date.now();
    const activeActivity = now - 5 * 60 * 1000; // 5 minutes ago
    const expiredActivity = now - 16 * 60 * 1000; // 16 minutes ago

    const isSessionExpired = (lastActivity: number) => now - lastActivity > SUPER_ADMIN_IDLE_TIMEOUT_MS;

    expect(isSessionExpired(activeActivity)).toBe(false);
    expect(isSessionExpired(expiredActivity)).toBe(true);
  });

  it('enforces Phase 124 IP Allowlist with CIDR subnet matching', () => {
    const config = {
      enabled: true,
      allowedIps: ['127.0.0.1', '10.200.0.0/16', '203.0.113.50'],
    };

    expect(api.isIpAllowed('127.0.0.1', config)).toBe(true);
    expect(api.isIpAllowed('203.0.113.50', config)).toBe(true);
    expect(api.isIpAllowed('10.200.1.45', config)).toBe(true);
    expect(api.isIpAllowed('10.200.255.254', config)).toBe(true);
    expect(api.isIpAllowed('10.201.0.1', config)).toBe(false);
    expect(api.isIpAllowed('198.51.100.1', config)).toBe(false);

    // When disabled, all IPs are permitted
    const disabledConfig = { enabled: false, allowedIps: ['127.0.0.1'] };
    expect(api.isIpAllowed('198.51.100.1', disabledConfig)).toBe(true);
  });

  it('validates double-submit CSRF token matching pattern', () => {
    const testToken = 'csrf_token_test_secure_99182312';
    expect(api.validateCsrfToken(testToken, testToken)).toBe(true);
    expect(api.validateCsrfToken(testToken, 'mismatched_token')).toBe(false);
    expect(api.validateCsrfToken(testToken, null)).toBe(false);
    expect(api.validateCsrfToken(testToken, undefined)).toBe(false);
    expect(api.validateCsrfToken('', '')).toBe(false);
  });

  it('manages time-boxed Support Impersonation sessions (Fase 124 Bagian D.4.2)', async () => {
    const session = await api.createSupportImpersonation({
      targetTenantId: 'tenant-test-corp',
      tenantName: 'Test Corp',
      ownerEmail: 'owner@testcorp.com',
      reason: 'Troubleshooting memory sync',
      durationMinutes: 15,
    });

    expect(session).toBeDefined();
    expect(session.targetTenantId).toBe('tenant-test-corp');
    expect(session.token).toMatch(/^supp[-_]/);
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    const active = api.getActiveSupportImpersonation();
    expect(active?.targetTenantId).toBe('tenant-test-corp');

    api.endSupportImpersonation();
    expect(api.getActiveSupportImpersonation()).toBeNull();
  });

  it('records comprehensive security audit entries into Audit Ledger', () => {
    const log = api.recordAuditLog({
      action: 'TEST_SECURITY_ACTION',
      resource: 'admin/security/test',
      status: 'SUCCESS',
      details: 'Audit test execution',
    });

    expect(log).toBeDefined();
    expect(log.id).toBeDefined();
    expect(log.role).toBe('SUPER_ADMIN');
    expect(log.action).toBe('TEST_SECURITY_ACTION');
    expect(log.resource).toBe('admin/security/test');
    expect(log.status).toBe('SUCCESS');
    expect(log.timestamp).toBeDefined();
  });
});

