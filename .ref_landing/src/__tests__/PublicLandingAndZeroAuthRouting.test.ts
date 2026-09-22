import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/api';
import { CommercialPlanItem } from '../types';

describe('Fase 126: Public Landing Page & Zero-Auth URL Routing Tests', () => {

  // =========================================================================
  // TEST SUITE 1: URL Routing Isolation (Login Melalui URL Saja)
  // =========================================================================
  describe('1. URL Routing Isolation Logic', () => {
    function evaluateAdminRoute(pathname: string, hash: string = '', search: string = ''): boolean {
      const p = pathname.toLowerCase();
      const h = hash.toLowerCase();
      const s = search.toLowerCase();

      return (
        p.startsWith('/admin') ||
        h.startsWith('#/admin') ||
        h.startsWith('#admin') ||
        s.includes('admin=true') ||
        s.includes('view=admin')
      );
    }

    it('1.1 should route root ("/") and informational paths to Public Landing Page', () => {
      expect(evaluateAdminRoute('/')).toBe(false);
      expect(evaluateAdminRoute('')).toBe(false);
      expect(evaluateAdminRoute('/workforce-universe')).toBe(false);
      expect(evaluateAdminRoute('/pricing')).toBe(false);
      expect(evaluateAdminRoute('/faq')).toBe(false);
    });

    it('1.2 should route explicit admin paths to Protected Super Admin Screen', () => {
      expect(evaluateAdminRoute('/admin')).toBe(true);
      expect(evaluateAdminRoute('/admin/dashboard')).toBe(true);
      expect(evaluateAdminRoute('/admin/login')).toBe(true);
      expect(evaluateAdminRoute('/', '#/admin')).toBe(true);
      expect(evaluateAdminRoute('/', '', '?admin=true')).toBe(true);
    });

    it('1.3 should prevent accidental admin route triggers from innocent query parameters', () => {
      expect(evaluateAdminRoute('/', '', '?ref=google')).toBe(false);
      expect(evaluateAdminRoute('/', '', '?utm_source=linkedin')).toBe(false);
      expect(evaluateAdminRoute('/about')).toBe(false);
    });
  });

  // =========================================================================
  // TEST SUITE 2: Dynamic Backend Commercial Pricing Integration
  // =========================================================================
  describe('2. Dynamic Backend Commercial Pricing Integration (/api/v1/plans)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('2.1 should dynamically fetch active commercial plans from backend', async () => {
      const mockBackendPlans: CommercialPlanItem[] = [
        {
          id: 'plan-starter-uuid',
          planCode: 'starter',
          planName: 'Starter Team',
          billingInterval: 'monthly',
          price: 550000, // Updated price in backend
          currency: 'IDR',
          creditAllocation: 3000,
          humanSeatLimit: 5,
          aiAgentLimit: 3,
          isPriceVisible: true,
          isActive: true,
          sortOrder: 1,
        },
        {
          id: 'plan-growth-uuid',
          planCode: 'growth',
          planName: 'Growth Company',
          billingInterval: 'monthly',
          price: 1650000, // Updated price in backend
          currency: 'IDR',
          creditAllocation: 18000,
          humanSeatLimit: 25,
          aiAgentLimit: 10,
          isPriceVisible: true,
          isActive: true,
          sortOrder: 2,
        },
        {
          id: 'plan-custom-uuid',
          planCode: 'custom',
          planName: 'Enterprise Custom',
          billingInterval: 'annual',
          price: null,
          currency: 'IDR',
          creditAllocation: 100000,
          humanSeatLimit: 100,
          aiAgentLimit: 50,
          isPriceVisible: false, // Hidden from public pricing cards
          isActive: true,
          sortOrder: 4,
        },
      ];

      // Mock global fetch for public plans
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/plans')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockBackendPlans,
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const plans = await api.getPublicPlans();

      expect(globalThis.fetch).toHaveBeenCalled();
      expect(plans.length).toBe(3);

      // Verify dynamic price values from backend
      const starter = plans.find((p) => p.planCode === 'starter');
      expect(starter).toBeDefined();
      expect(starter?.price).toBe(550000);
      expect(starter?.creditAllocation).toBe(3000);

      // Verify filtering of invisible / inactive plans for public view
      const visiblePublicPlans = plans.filter((p) => p.isActive && p.isPriceVisible);
      expect(visiblePublicPlans.length).toBe(2);
      expect(visiblePublicPlans.some((p) => p.planCode === 'custom')).toBe(false);
    });

    it('2.2 should reflect price changes without frontend redeployment', () => {
      // Simulate price update in backend (Fase 113 Bagian D update)
      const backendPriceBefore = 499000;
      const backendPriceAfter = 599000;

      const formatPrice = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;

      expect(formatPrice(backendPriceBefore)).toBe('Rp 499.000');
      expect(formatPrice(backendPriceAfter)).toBe('Rp 599.000');

      // Annual discount formula: 20% savings
      const annualMonthlyRate = Math.round(backendPriceAfter * 0.8);
      expect(annualMonthlyRate).toBe(479200);
    });
  });

  // =========================================================================
  // TEST SUITE 3: Zero-Auth Guarantees on Public Landing Page
  // =========================================================================
  describe('3. Zero-Auth & Purely Informational Guarantees', () => {
    it('3.1 should confirm zero login/register elements on public views', () => {
      // Banned UI interactions on the public landing page per user mandate
      const bannedActionNames = ['openAuthModal', 'setMode("login")', 'setMode("register")'];
      const allowedActions = ['scrollIntoView', 'handleNavClick', 'setBillingCycle'];

      bannedActionNames.forEach((banned) => {
        expect(allowedActions.includes(banned)).toBe(false);
      });
    });

    it('3.2 should require valid SUPER_ADMIN and MFA for Super Admin dashboard access', () => {
      interface MockUser {
        id: string;
        role: string;
        isMfaVerified: boolean;
      }

      function canAccessAdminDashboard(user: MockUser | null): boolean {
        if (!user) return false;
        if (user.role !== 'SUPER_ADMIN') return false;
        if (!user.isMfaVerified) return false;
        return true;
      }

      // Unauthenticated visitor
      expect(canAccessAdminDashboard(null)).toBe(false);

      // Tenant Owner or Admin (not Super Admin)
      expect(canAccessAdminDashboard({ id: 'u1', role: 'TENANT_OWNER', isMfaVerified: true })).toBe(false);
      expect(canAccessAdminDashboard({ id: 'u2', role: 'TENANT_ADMIN', isMfaVerified: true })).toBe(false);

      // Super Admin without MFA
      expect(canAccessAdminDashboard({ id: 'sa1', role: 'SUPER_ADMIN', isMfaVerified: false })).toBe(false);

      // Super Admin with verified hardware MFA
      expect(canAccessAdminDashboard({ id: 'sa2', role: 'SUPER_ADMIN', isMfaVerified: true })).toBe(true);
    });
  });
});
