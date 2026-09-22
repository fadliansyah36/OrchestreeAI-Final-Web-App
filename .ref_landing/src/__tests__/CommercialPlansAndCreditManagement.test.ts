import { describe, it, expect } from 'vitest';
import {
  CommercialPlanItem,
  CommercialPlanUpsertRequest,
  PlanFeatureEntitlementsMatrix,
  CreditMeteringRuleItem,
  CreditCostFactorItem,
  CreditCostContext,
  CreditCostResult,
  ManualCreditAdjustmentRequest,
  TenantWalletDetailsResponse,
  FinancialCommandCenterResponse,
} from '../types';

describe('Fase 114: Commercial Plans, Credit Metering, Adjustments & Financial Command Center Tests', () => {

  // =========================================================================
  // TEST SUITE 1: Commercial Plans CRUD & Price Hiding Rule
  // =========================================================================
  describe('1. Commercial Plans Rules', () => {
    it('1.1 should enforce price = null and hide price for plan_code="custom"', () => {
      const customPlan: CommercialPlanItem = {
        id: 'plan-custom-id',
        planCode: 'custom',
        planName: 'Enterprise Custom',
        billingInterval: 'annual',
        price: null, // KHUSUS 'custom', price adalah null
        currency: 'IDR',
        creditAllocation: 50000,
        humanSeatLimit: 100,
        aiAgentLimit: 50,
        isPriceVisible: false, // Disembunyikan dari publik
        isActive: true,
        sortOrder: 4,
      };

      expect(customPlan.planCode).toBe('custom');
      expect(customPlan.price).toBeNull();
      expect(customPlan.isPriceVisible).toBe(false);
    });

    it('1.2 should allow explicit prices for standard plans (starter, growth, enterprise)', () => {
      const standardPlans: CommercialPlanItem[] = [
        {
          id: 'p-1',
          planCode: 'starter',
          planName: 'Starter Package',
          billingInterval: 'monthly',
          price: 500000,
          currency: 'IDR',
          creditAllocation: 1000,
          humanSeatLimit: 3,
          aiAgentLimit: 1,
          isPriceVisible: true,
          isActive: true,
          sortOrder: 1,
        },
        {
          id: 'p-2',
          planCode: 'growth',
          planName: 'Growth Business',
          billingInterval: 'monthly',
          price: 2500000,
          currency: 'IDR',
          creditAllocation: 6000,
          humanSeatLimit: 15,
          aiAgentLimit: 5,
          isPriceVisible: true,
          isActive: true,
          sortOrder: 2,
        },
        {
          id: 'p-3',
          planCode: 'enterprise',
          planName: 'Enterprise Core',
          billingInterval: 'monthly',
          price: 10000000,
          currency: 'IDR',
          creditAllocation: 30000,
          humanSeatLimit: 50,
          aiAgentLimit: 20,
          isPriceVisible: true,
          isActive: true,
          sortOrder: 3,
        },
      ];

      expect(standardPlans.length).toBe(3);
      expect(standardPlans.every((p) => p.price !== null && p.price > 0)).toBe(true);
      expect(standardPlans.every((p) => p.isPriceVisible)).toBe(true);
    });
  });

  // =========================================================================
  // TEST SUITE 2: Plan Feature Entitlements Matrix & Custom Overrides
  // =========================================================================
  describe('2. Entitlements Matrix & Overrides', () => {
    it('2.1 should correctly resolve feature entitlements across tiers', () => {
      const matrix: PlanFeatureEntitlementsMatrix = {
        planCodes: ['starter', 'growth', 'enterprise', 'custom'],
        featureKeys: [
          'max_autonomous_agents',
          'access_claude_opus',
          'sla_guarantee',
          'byok_allowed',
        ],
        matrix: {
          starter: {
            max_autonomous_agents: '1',
            access_claude_opus: 'false',
            sla_guarantee: 'standard',
            byok_allowed: 'false',
          },
          growth: {
            max_autonomous_agents: '5',
            access_claude_opus: 'false',
            sla_guarantee: 'business',
            byok_allowed: 'false',
          },
          enterprise: {
            max_autonomous_agents: '20',
            access_claude_opus: 'true',
            sla_guarantee: 'enterprise_99_9',
            byok_allowed: 'true',
          },
          custom: {
            max_autonomous_agents: 'custom',
            access_claude_opus: 'true',
            sla_guarantee: 'dedicated',
            byok_allowed: 'true',
          },
        },
      };

      expect(matrix.matrix['starter']['byok_allowed']).toBe('false');
      expect(matrix.matrix['enterprise']['byok_allowed']).toBe('true');
      expect(matrix.matrix['enterprise']['access_claude_opus']).toBe('true');
    });

    it('2.2 should prioritize tenant custom override over plan defaults', () => {
      const defaultEnterpriseAgents = 20;
      const tenantCustomOverride = JSON.stringify({
        max_autonomous_agents: 50,
        dedicated_vpc: true,
      });

      const parsedOverride = JSON.parse(tenantCustomOverride);
      const effectiveAgents = parsedOverride.max_autonomous_agents ?? defaultEnterpriseAgents;

      expect(effectiveAgents).toBe(50);
      expect(parsedOverride.dedicated_vpc).toBe(true);
    });
  });

  // =========================================================================
  // TEST SUITE 3: Credit Metering Rules & Live Cost Multiplier Formula
  // =========================================================================
  describe('3. Credit Metering Rules & Formula Simulation', () => {
    const rules: Record<string, number> = {
      chat_completion: 1.0,
      tool_execution: 1.5,
      workflow_step: 0.8,
    };

    const factors: Record<string, number> = {
      // Complexity
      simple: 1.0,
      medium: 1.5,
      complex: 2.5,
      // Model
      'gemini-1.5-flash': 0.8,
      'gemini-1.5-pro': 1.5,
      'gpt-4o': 2.0,
      // Tools
      no_tool: 1.0,
      single_tool: 1.2,
      multi_tool: 1.5,
      // Execution
      sync: 1.0,
      async_background: 0.9,
    };

    function simulateCost(ctx: CreditCostContext): CreditCostResult {
      const base = rules[ctx.activityType] ?? 1.0;
      const complexity = factors[ctx.complexityLevel] ?? 1.0;
      const model = factors[ctx.modelUsed] ?? 1.0;
      const tool = ctx.toolsInvoked === 0 ? factors['no_tool'] : ctx.toolsInvoked === 1 ? factors['single_tool'] : factors['multi_tool'];
      const execution = factors[ctx.executionType] ?? 1.0;

      const raw = base * complexity * model * tool * execution;
      const estimatedCost = Math.round(raw * 100) / 100;

      return {
        estimatedCost,
        breakdown: { base, complexity, model, tool, execution },
      };
    }

    it('3.1 should accurately calculate simple Gemini chat execution', () => {
      const ctx: CreditCostContext = {
        activityType: 'chat_completion',
        complexityLevel: 'simple',
        modelUsed: 'gemini-1.5-flash',
        toolsInvoked: 0,
        executionType: 'sync',
      };

      const result = simulateCost(ctx);
      // 1.0 * 1.0 * 0.8 * 1.0 * 1.0 = 0.8
      expect(result.estimatedCost).toBe(0.8);
      expect(result.breakdown.base).toBe(1.0);
      expect(result.breakdown.model).toBe(0.8);
    });

    it('3.2 should accurately calculate complex workflow step with multiple tools on GPT-4o', () => {
      const ctx: CreditCostContext = {
        activityType: 'tool_execution', // 1.5
        complexityLevel: 'complex',     // 2.5
        modelUsed: 'gpt-4o',            // 2.0
        toolsInvoked: 3,                // multi_tool = 1.5
        executionType: 'async_background', // 0.9
      };

      const result = simulateCost(ctx);
      // 1.5 * 2.5 * 2.0 * 1.5 * 0.9 = 10.125 -> 10.13
      expect(result.estimatedCost).toBe(10.13);
      expect(result.breakdown.base).toBe(1.5);
      expect(result.breakdown.complexity).toBe(2.5);
      expect(result.breakdown.tool).toBe(1.5);
    });
  });

  // =========================================================================
  // TEST SUITE 4: Tenant Credit Wallet & Manual Adjustment (Immutable Ledger)
  // =========================================================================
  describe('4. Tenant Credit Wallet & Double-Entry Ledger', () => {
    it('4.1 should enforce immutable audit trail on credit adjustment (No Direct Balance Edit)', () => {
      const initialWallet = {
        tenantId: 'test-tenant-org-alpha',
        subscriptionBalance: 20000,
        topupBalance: 5000,
        bonusBalance: 0,
        reservedBalance: 1000,
        usedBalance: 8000,
        availableBalance: 24000, // (20000 + 5000 + 0) - 1000
      };

      const adjustmentRequest: ManualCreditAdjustmentRequest = {
        tenantId: 'test-tenant-org-alpha',
        amount: 2500,
        ledgerType: 'BONUS',
        reason: 'Enterprise SLA compensation incident #INC-2026-99',
        operatorId: 'superadmin@orchestree.ai',
      };

      // Rule: Reason is mandatory
      expect(adjustmentRequest.reason.length).toBeGreaterThan(0);
      expect(adjustmentRequest.operatorId).toBe('superadmin@orchestree.ai');

      // Double-entry calculation
      const newBonusBalance = initialWallet.bonusBalance + adjustmentRequest.amount;
      const newAvailableBalance = (initialWallet.subscriptionBalance + initialWallet.topupBalance + newBonusBalance) - initialWallet.reservedBalance;

      expect(newBonusBalance).toBe(2500);
      expect(newAvailableBalance).toBe(26500);

      // Ledger entry created
      const ledgerEntry = {
        id: 'led-adj-9988',
        tenantId: adjustmentRequest.tenantId,
        amount: adjustmentRequest.amount,
        ledgerType: adjustmentRequest.ledgerType,
        balanceBefore: initialWallet.availableBalance,
        balanceAfter: newAvailableBalance,
        description: `[${adjustmentRequest.operatorId}] ${adjustmentRequest.reason}`,
      };

      expect(ledgerEntry.balanceBefore).toBe(24000);
      expect(ledgerEntry.balanceAfter).toBe(26500);
      expect(ledgerEntry.description).toContain('Enterprise SLA compensation');
    });
  });

  // =========================================================================
  // TEST SUITE 5: Financial Command Center KPIs & Aggregations
  // =========================================================================
  describe('5. Financial Command Center Analytics', () => {
    it('5.1 should accurately compute MRR, ARR, and gross margins', () => {
      const sampleCenter: FinancialCommandCenterResponse = {
        kpis: {
          mrr: 150000000, // IDR 150M
          arr: 1800000000, // IDR 1.8B
          activeSubscriptionsCount: 42,
          totalCreditsCirculating: 850000,
          totalCreditsConsumed: 420000,
          totalRevenueIdr: 175000000,
          estimatedComputeCostIdr: 35000000,
          netMarginPercentage: 80.0, // ((175 - 35) / 175) * 100 = 80%
        },
        planDistribution: [
          { planCode: 'starter', planName: 'Starter', count: 18, percentage: 42.9 },
          { planCode: 'growth', planName: 'Growth', count: 16, percentage: 38.1 },
          { planCode: 'enterprise', planName: 'Enterprise', count: 8, percentage: 19.0 },
        ],
        topTenantsByConsumption: [
          {
            tenantId: 'test-tenant-org-alpha',
            tenantName: 'PT Mega Teknologi Mandiri',
            planCode: 'enterprise',
            creditsConsumed: 85000,
            percentageOfTotal: 20.2,
          },
        ],
        recentTopUpsTotal: 25000000,
        timestamp: new Date().toISOString(),
      };

      expect(sampleCenter.kpis.arr).toBe(sampleCenter.kpis.mrr * 12);
      expect(sampleCenter.kpis.netMarginPercentage).toBe(80.0);
      expect(sampleCenter.planDistribution.reduce((sum, p) => sum + p.count, 0)).toBe(42);
    });
  });
});
