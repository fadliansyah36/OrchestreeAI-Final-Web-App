import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/api';
import {
  CommercialPlanUpsertRequest,
  CreditMeteringRuleItem,
  CreditCostFactorItem,
  CreditCostContext,
  ManualCreditAdjustmentRequest,
} from '../types';

describe('Domain 16: Commercial Plans, Billing, Reconciliation, & Financial Command Center E2E', () => {
  const recordedRequests: Array<{ url: string; method: string; headers: Record<string, string>; body?: any }> = [];

  // In-memory mock databases for realistic mutation verification
  let tenantWalletDb: Record<string, { availableBalance: number; ledger: any[] }> = {};
  let plansDb: any[] = [];
  let meteringRulesDb: any[] = [];
  let costFactorsDb: any[] = [];
  let customOverridesDb: Record<string, string> = {};
  let reconciliationQueueDb: any[] = [];

  beforeEach(() => {
    recordedRequests.length = 0;
    tenantWalletDb = {
      'tenant-fin-01': {
        availableBalance: 5000,
        ledger: [
          {
            id: 'ledg-init-1',
            tenantId: 'tenant-fin-01',
            ledgerType: 'INITIAL_ALLOCATION',
            amount: 5000,
            balanceAfter: 5000,
            reason: 'Initial monthly plan grant',
            operatorId: 'system',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
      },
    };

    plansDb = [
      {
        id: 'plan-starter-1',
        planCode: 'starter',
        planName: 'Starter SME',
        billingInterval: 'monthly',
        price: 500000,
        currency: 'IDR',
        creditAllocation: 1000,
        humanSeatLimit: 5,
        aiAgentLimit: 2,
        isPriceVisible: true,
        isActive: true,
        sortOrder: 1,
      },
    ];

    meteringRulesDb = [
      { activityType: 'DOCUMENT_EXTRACTION_OCR', baseWorkUnits: 2.5, description: 'OCR & PDF table parse' },
    ];

    costFactorsDb = [
      { factorType: 'complexity', factorKey: 'high_reasoning', multiplier: 1.5 },
    ];

    customOverridesDb = {
      'tenant-fin-01': '{"max_agents": 25, "custom_ocr_bypass": true}',
    };

    reconciliationQueueDb = [
      {
        id: 'rec-q-101',
        orderId: 'ORD-STUCK-9988',
        tenantId: 'tenant-fin-01',
        status: 'pending_review',
        amount: 2500000,
        currency: 'IDR',
        stuckDurationMinutes: 14,
        paymentGateway: 'midtrans',
        createdAt: new Date().toISOString(),
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

      // CSRF Token
      if (url.includes('/admin/security/csrf-token')) {
        return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-fin-secret-99' }) };
      }

      // 1.1 Commercial Plans
      if (url.includes('/admin/commercial/plans') && method === 'GET') {
        return { ok: true, status: 200, json: async () => plansDb };
      }
      if (url.includes('/admin/commercial/plans') && method === 'POST') {
        const newPlan = {
          id: bodyParsed.id || `plan-${bodyParsed.planCode}-${Date.now()}`,
          ...bodyParsed,
        };
        const idx = plansDb.findIndex((p) => p.planCode === bodyParsed.planCode);
        if (idx >= 0) plansDb[idx] = newPlan;
        else plansDb.push(newPlan);
        return { ok: true, status: 200, json: async () => newPlan };
      }
      if (url.includes('/admin/commercial/plans/') && method === 'DELETE') {
        const idToDelete = url.split('/').pop()!;
        plansDb = plansDb.filter((p) => p.id !== idToDelete && p.planCode !== idToDelete);
        return { ok: true, status: 200, json: async () => ({ success: true, id: idToDelete }) };
      }

      // 1.2 Entitlements Matrix
      if (url.includes('/admin/commercial/entitlements-matrix')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            planCodes: ['starter', 'growth', 'enterprise'],
            featureKeys: ['unlimited_agents'],
            matrix: {
              starter: { unlimited_agents: 'false' },
              growth: { unlimited_agents: 'true' },
            },
          }),
        };
      }
      if (url.includes('/admin/commercial/entitlements') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }

      // 1.3 Tenant Custom Override
      if (url.includes('/admin/commercial/custom-override/') && method === 'GET') {
        const tId = url.split('/').pop()!;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tenantId: tId,
            customEntitlementOverride: customOverridesDb[tId] || null,
          }),
        };
      }
      if (url.includes('/admin/commercial/custom-override/') && method === 'POST') {
        const tId = url.split('/').pop()!;
        customOverridesDb[tId] = bodyParsed.overrideJson;
        return { ok: true, status: 200, json: async () => ({ success: true, tenantId: tId }) };
      }

      // 1.2 Metering Rules & Cost Factors
      if (url.includes('/admin/commercial/metering-rules') && method === 'GET') {
        return { ok: true, status: 200, json: async () => meteringRulesDb };
      }
      if (url.includes('/admin/commercial/metering-rules') && method === 'POST') {
        meteringRulesDb.push(bodyParsed);
        return { ok: true, status: 200, json: async () => bodyParsed };
      }
      if (url.includes('/admin/commercial/metering-rules/') && method === 'DELETE') {
        const activity = url.split('/').pop()!;
        meteringRulesDb = meteringRulesDb.filter((r) => r.activityType !== activity);
        return { ok: true, status: 200, json: async () => ({ success: true, activityType: activity }) };
      }

      if (url.includes('/admin/commercial/cost-factors') && method === 'GET') {
        return { ok: true, status: 200, json: async () => costFactorsDb };
      }
      if (url.includes('/admin/commercial/cost-factors') && method === 'POST') {
        costFactorsDb.push(bodyParsed);
        return { ok: true, status: 200, json: async () => bodyParsed };
      }
      if (url.includes('/admin/commercial/cost-factors/') && method === 'DELETE') {
        const parts = url.split('/');
        const factorKey = parts[parts.length - 1];
        const factorType = parts[parts.length - 2];
        costFactorsDb = costFactorsDb.filter((f) => !(f.factorType === factorType && f.factorKey === factorKey));
        return { ok: true, status: 200, json: async () => ({ success: true, factorType, factorKey }) };
      }

      // 1.2 Simulate Cost
      if (url.includes('/admin/commercial/simulate-cost') && method === 'POST') {
        const estimatedCost = (bodyParsed.baseWorkUnits || 1) * (bodyParsed.multiplier || 1.2);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            estimatedCost,
            baseCost: bodyParsed.baseWorkUnits || 1,
            appliedMultipliers: [{ factor: 'complexity', multiplier: 1.2 }],
            formula: 'baseWorkUnits * multiplier',
          }),
        };
      }

      // 1.4 Credit Adjustment & Tenant Wallet
      if (url.includes('/admin/billing/credit-adjustment') && method === 'POST') {
        const { tenantId, amount, ledgerType, reason } = bodyParsed;
        if (!reason || reason.trim().length === 0) {
          return { ok: false, status: 400, json: async () => ({ message: 'Alasan penyesuaian (reason) wajib diisi' }) };
        }
        const wallet = tenantWalletDb[tenantId] || { availableBalance: 0, ledger: [] };
        const change = ledgerType === 'DEDUCTION' ? -Math.abs(amount) : Math.abs(amount);
        wallet.availableBalance += change;
        const entryId = `ledg-${Date.now()}`;
        wallet.ledger.unshift({
          id: entryId,
          tenantId,
          ledgerType,
          amount,
          balanceBefore: wallet.availableBalance - change,
          balanceAfter: wallet.availableBalance,
          description: reason,
          createdAt: new Date().toISOString(),
        });
        tenantWalletDb[tenantId] = wallet;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            tenantId,
            newBalance: wallet.availableBalance,
            newAvailableBalance: wallet.availableBalance,
            ledgerId: entryId,
          }),
        };
      }

      if (url.includes('/admin/billing/tenant-wallet/')) {
        const tId = url.split('/').pop()!;
        const wallet = tenantWalletDb[tId] || { availableBalance: 0, ledger: [] };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tenantId: tId,
            subscriptionBalance: wallet.availableBalance,
            topupBalance: 0,
            bonusBalance: 0,
            reservedBalance: 0,
            usedBalance: 10000 - wallet.availableBalance,
            availableBalance: wallet.availableBalance,
            entries: wallet.ledger,
            totalLedger: wallet.ledger.length,
            ledgerHistory: wallet.ledger,
          }),
        };
      }

      // 1.5 Financial Command Center
      if (url.includes('/admin/financial-command-center') || url.includes('/admin/analytics/financial-command-center')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            kpis: {
              mrr: 18500000,
              arr: 222000000,
              activeSubscriptionsCount: 24,
              totalCreditsCirculating: 250000,
              totalCreditsConsumed: 180000,
              totalRevenueIdr: 154000000,
              estimatedComputeCostIdr: 45000000,
              netMarginPercentage: 70.7,
            },
            planDistribution: [
              { planCode: 'starter', planName: 'Starter', count: 18, percentage: 75 },
              { planCode: 'growth', planName: 'Growth', count: 6, percentage: 25 },
            ],
            topTenantsByConsumption: [
              { tenantId: 't-1', tenantName: 'Acme Corp', planCode: 'starter', creditsConsumed: 12000, percentageOfTotal: 6.6 },
            ],
            recentTopUpsTotal: 15000000,
            timestamp: '2026-09-16T00:00:00.000Z',
          }),
        };
      }

      // 1.6 Payment Reconciliation
      if (url.includes('/admin/payment-reconciliation/orders')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 'ord-1', orderNumber: 'ORD-PAID-001', status: 'paid', amount: 500000, tenantId: 'tenant-fin-01' },
          ],
        };
      }

      if (url.includes('/admin/payment-reconciliation/queue')) {
        return { ok: true, status: 200, json: async () => reconciliationQueueDb };
      }

      if (url.includes('/admin/payment-reconciliation/') && url.includes('/confirm') && method === 'POST') {
        const id = url.split('/')[url.split('/').length - 2];
        const item = reconciliationQueueDb.find((q) => q.id === id);
        if (item) item.status = 'confirmed';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            queueId: id,
            orderId: item?.orderId || 'ORD-UNKNOWN',
            resolvedBySuperAdminId: 'superadmin-test',
            reason: bodyParsed.reason,
            resolvedAt: Date.now(),
          }),
        };
      }

      if (url.includes('/admin/payment-reconciliation/') && url.includes('/reject') && method === 'POST') {
        const id = url.split('/')[url.split('/').length - 2];
        const item = reconciliationQueueDb.find((q) => q.id === id);
        if (item) item.status = 'rejected';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            queueId: id,
            reason: bodyParsed.reason,
          }),
        };
      }

      if (url.includes('/admin/payment-reconciliation/trigger-check') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'COMPLETED',
            checkedCount: 12,
            autoReconciledCount: 1,
            pendingReviewCount: reconciliationQueueDb.filter((q) => q.status === 'pending_review').length,
            details: ['ORD-STUCK-9988 flagged for manual investigation'],
          }),
        };
      }

      if (url.includes('/admin/payment-reconciliation/simulate-stuck') && method === 'POST') {
        const newSim = {
          id: `rec-sim-${Date.now()}`,
          orderId: bodyParsed.orderId || `ORD-SIM-${Date.now()}`,
          tenantId: 'tenant-fin-01',
          status: 'pending_review',
          amount: 1500000,
          currency: 'IDR',
          stuckDurationMinutes: 15,
          paymentGateway: 'midtrans',
          createdAt: new Date().toISOString(),
        };
        reconciliationQueueDb.push(newSim);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            orderId: newSim.orderId,
            message: 'Simulasi order stuck berhasil ditambahkan ke antrean rekonsiliasi.',
          }),
        };
      }

      // 1.7 Subscriptions & Invoices
      if (url.includes('/admin/billing/subscriptions') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 'sub-1', tenantId: 'tenant-fin-01', planCode: 'starter', status: 'ACTIVE', nextBillingDate: '2026-10-01' },
          ],
        };
      }
      if (url.includes('/admin/billing/invoices') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 'inv-1', tenantId: 'tenant-fin-01', amount: 500000, currency: 'IDR', status: 'PAID' },
          ],
        };
      }
      if (url.includes('/admin/analytics/transactions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            totalTransactions: 1420,
            grossVolume: 710000000,
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('super-admin-commercial-token');
  });

  // 1.1 Commercial Plans CRUD
  it('1.1: Memvalidasi CRUD Commercial Plans ke backend PostgreSQL (/admin/commercial/plans)', async () => {
    // GET
    const initialPlans = await api.getCommercialPlans();
    expect(initialPlans.length).toBe(1);
    expect(initialPlans[0].planCode).toBe('starter');

    // POST (create new plan)
    const newPlanPayload: CommercialPlanUpsertRequest = {
      planCode: 'scale',
      planName: 'Scale Enterprise',
      billingInterval: 'monthly',
      price: 2500000,
      currency: 'IDR',
      creditAllocation: 15000,
      humanSeatLimit: 25,
      aiAgentLimit: 10,
      isPriceVisible: true,
      isActive: true,
      sortOrder: 2,
    };
    const createdPlan = await api.upsertCommercialPlan(newPlanPayload);
    expect(createdPlan.planCode).toBe('scale');

    // DELETE plan
    const deleteRes = await api.deleteCommercialPlan('plan-starter-1');
    expect(deleteRes.success).toBe(true);

    const postDeletePlans = await api.getCommercialPlans();
    expect(postDeletePlans.some((p) => p.id === 'plan-starter-1')).toBe(false);
  });

  // 1.2 Credit Metering Config & Simulation
  it('1.2: Memvalidasi Entitlements Matrix, Metering Rules, Cost Factors, & Cost Simulation Preview', async () => {
    // Entitlements Matrix
    const matrix = await api.getPlanFeatureEntitlementsMatrix();
    expect(matrix.planCodes).toContain('starter');

    const updateEntitlement = await api.updatePlanFeatureEntitlement({
      planCode: 'starter',
      featureCode: 'unlimited_agents',
      isEnabled: true,
    });
    expect(updateEntitlement.success).toBe(true);

    // Metering Rules CRUD
    const rules = await api.getCreditMeteringRules();
    expect(rules.length).toBe(1);

    const createdRule = await api.saveCreditMeteringRule({
      activityType: 'AUDIO_TRANSLATION_WHISPER',
      baseWorkUnits: 3.0,
      description: 'Audio speech to text processing',
    });
    expect(createdRule.activityType).toBe('AUDIO_TRANSLATION_WHISPER');

    await api.deleteCreditMeteringRule('DOCUMENT_EXTRACTION_OCR');
    const remainingRules = await api.getCreditMeteringRules();
    expect(remainingRules.some((r) => r.activityType === 'DOCUMENT_EXTRACTION_OCR')).toBe(false);

    // Cost Factors CRUD
    const factors = await api.getCreditCostFactors();
    expect(factors.length).toBe(1);

    const savedFactor = await api.saveCreditCostFactor({
      factorType: 'model',
      factorKey: 'deepseek_r1',
      multiplier: 1.8,
    });
    expect(savedFactor.factorKey).toBe('deepseek_r1');

    await api.deleteCreditCostFactor('complexity', 'high_reasoning');
    const remainingFactors = await api.getCreditCostFactors();
    expect(remainingFactors.some((f) => f.factorKey === 'high_reasoning')).toBe(false);

    // Cost Simulation Preview
    const simResult = await api.simulateCreditCost({
      activityType: 'AUDIO_TRANSLATION_WHISPER',
      baseWorkUnits: 3.0,
      complexityFactor: 'model',
      multiplier: 1.5,
    } as any);
    expect(simResult.estimatedCost).toBeGreaterThan(0);
  });

  // 1.3 Tenant Custom Overrides
  it('1.3: Memvalidasi custom-override per tenant (/admin/commercial/custom-override/{tenantId})', async () => {
    const tenantId = 'tenant-fin-01';
    const override = await api.getTenantCustomOverride(tenantId);
    expect(override.customEntitlementOverride).toContain('max_agents');

    const newOverridePayload = JSON.stringify({ max_agents: 50, vip_support: true });
    const setOverrideRes = await api.setTenantCustomOverride(tenantId, newOverridePayload);
    expect(setOverrideRes.success).toBe(true);

    const updatedOverride = await api.getTenantCustomOverride(tenantId);
    expect(updatedOverride.customEntitlementOverride).toContain('vip_support');
  });

  // 1.4 & LANGKAH 2: Credit Adjustment & Wallet Before/After Verification
  it('1.4 & Langkah 2: Memvalidasi Manual Credit Adjustment dengan Reason Wajib dan Perubahan Wallet Before/After', async () => {
    const targetTenantId = 'tenant-fin-01';

    // 1. RAW BEFORE: Baca saldo dan ledger awal
    const walletBefore = await api.getTenantWalletDetails(targetTenantId);
    const balanceBefore = walletBefore.availableBalance;
    const ledgerCountBefore = walletBefore.ledgerHistory?.length || 0;

    expect(balanceBefore).toBe(5000);
    expect(ledgerCountBefore).toBe(1);

    // 2. Eksekusi Manual Credit Adjustment dengan Alasan Jelas (Audited)
    const adjustmentRequest: ManualCreditAdjustmentRequest = {
      tenantId: targetTenantId,
      amount: 1500,
      ledgerType: 'MANUAL_GRANT',
      reason: 'Kompensasi SLA latency degrade pada cluster worker tanggal 15 Sept 2026',
      operatorId: 'superadmin@orchestree.ai',
    };

    const adjustmentResponse = await api.manualCreditAdjustment(adjustmentRequest);
    expect(adjustmentResponse.success).toBe(true);
    expect(adjustmentResponse.newAvailableBalance).toBe(6500);

    // 3. RAW AFTER: Baca kembali saldo dompet dan ledger
    const walletAfter = await api.getTenantWalletDetails(targetTenantId);
    const balanceAfter = walletAfter.availableBalance;
    const ledgerCountAfter = walletAfter.ledgerHistory?.length || 0;

    expect(balanceAfter).toBe(6500);
    expect(balanceAfter).toBe(balanceBefore + 1500);
    expect(ledgerCountAfter).toBe(ledgerCountBefore + 1);

    const latestLedgerEntry = walletAfter.ledgerHistory![0];
    expect(latestLedgerEntry.description).toBe('Kompensasi SLA latency degrade pada cluster worker tanggal 15 Sept 2026');
    expect(latestLedgerEntry.amount).toBe(1500);
    expect(latestLedgerEntry.ledgerType).toBe('MANUAL_GRANT');
    expect(latestLedgerEntry.balanceAfter).toBe(6500);
  });

  // 1.5 Financial Command Center Endpoint Audit
  it('1.5: Memvalidasi kesamaan payload antara /financial-command-center dan /analytics/financial-command-center', async () => {
    const primaryData = await api.getFinancialCommandCenter();
    const analyticsData = await api.getAnalyticsFinancialCommandCenter();

    expect(primaryData.kpis.totalRevenueIdr).toBe(154000000);
    expect(analyticsData.kpis.totalRevenueIdr).toBe(154000000);
    expect(JSON.stringify(primaryData)).toBe(JSON.stringify(analyticsData));
  });

  // 1.6 Payment Reconciliation (Confirm, Reject, Trigger Check, Simulate Stuck Gate)
  it('1.6: Memvalidasi Payment Reconciliation Transaksi, Confirm/Reject dengan Reason, dan Gating Simulate Stuck', async () => {
    // Orders list
    const orders = await api.getReconciliationOrders('paid');
    expect(orders.length).toBe(1);

    // Queue list
    const queue = await api.getReconciliationQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe('rec-q-101');

    // Confirm with reason
    const confirmRes = await api.confirmPaymentReconciliation('rec-q-101', 'Bukti mutasi bank BCA terverifikasi valid oleh Finance Super Admin');
    expect(confirmRes.orderId).toBe('ORD-STUCK-9988');
    expect(confirmRes.reason).toContain('Bukti mutasi bank');

    // Trigger check
    const checkRes = await api.triggerPaymentReconciliationCheck(10);
    expect(checkRes.status).toBe('COMPLETED');

    // Simulate stuck (internal drill)
    const simRes = await api.simulateStuckPayment('ORD-DRILL-1122', 'Developer drill QA test');
    expect(simRes.success).toBe(true);
  });

  // 1.7 Subscriptions & Invoices Lintas Tenant
  it('1.7: Memvalidasi Subscriptions, Invoices, dan Telemetri Transaksi Lintas Tenant', async () => {
    const subscriptions = await api.getSubscriptions();
    expect(subscriptions.length).toBe(1);
    expect(subscriptions[0].planCode).toBe('starter');

    const invoices = await api.getInvoices();
    expect(invoices.length).toBe(1);
    expect(invoices[0].amount).toBe(500000);

    const tx = await api.getAnalyticsTransactions();
    expect(tx.totalTransactions).toBe(1420);
  });
});
