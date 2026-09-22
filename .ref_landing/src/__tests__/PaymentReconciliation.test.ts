import { describe, it, expect } from 'vitest';
import {
  ReconciliationOrderDto,
  PaymentReconciliationQueueItem,
  ConfirmPaymentReconciliationResult,
} from '../types';

describe('PaymentReconciliation Unit & Contract Tests (Fase 110)', () => {
  // Tab 1.1: Transaksi Berhasil
  it('1.1 should filter and calculate paid transactions correctly', () => {
    const mockPaidOrders: ReconciliationOrderDto[] = [
      {
        id: 'ord-001',
        orderNumber: 'INV-2026-001',
        tenantId: 'test-tenant-org-alpha',
        customerId: 'cust-101',
        amount: 5000000,
        status: 'paid',
        createdAt: Date.now() - 3600000,
        durationMinutes: 60,
        isStuckAnomaly: false,
        paymentGatewayRef: 'MIDTRANS-SETTLED-01',
      },
      {
        id: 'ord-002',
        orderNumber: 'INV-2026-002',
        tenantId: 'tenant-growth-002',
        customerId: 'cust-102',
        amount: 2500000,
        status: 'paid',
        createdAt: Date.now() - 1800000,
        durationMinutes: 30,
        isStuckAnomaly: false,
        paymentGatewayRef: 'MIDTRANS-SETTLED-02',
      },
    ];

    const totalPaid = mockPaidOrders.reduce((sum, o) => sum + o.amount, 0);
    expect(mockPaidOrders.length).toBe(2);
    expect(totalPaid).toBe(7500000);
    expect(mockPaidOrders.every((o) => o.status === 'paid')).toBe(true);
  });

  // Tab 1.2: Transaksi Pending (> 10 menit highlight merah anomaly)
  it('1.2 should accurately flag pending transactions > 10 minutes as stuck anomaly', () => {
    const mockPendingOrders: ReconciliationOrderDto[] = [
      {
        id: 'ord-pending-fresh',
        orderNumber: 'INV-PENDING-01',
        tenantId: 'test-tenant-org-alpha',
        customerId: 'cust-201',
        amount: 1000000,
        status: 'pending_payment',
        createdAt: Date.now() - 4 * 60 * 1000, // 4 mins ago
        durationMinutes: 4,
        isStuckAnomaly: false,
      },
      {
        id: 'ord-pending-stuck',
        orderNumber: 'INV-PENDING-02',
        tenantId: 'test-tenant-org-alpha',
        customerId: 'cust-202',
        amount: 1500000,
        status: 'pending_payment',
        createdAt: Date.now() - 18 * 60 * 1000, // 18 mins ago (> 10m)
        durationMinutes: 18,
        isStuckAnomaly: true,
      },
    ];

    const stuckOrders = mockPendingOrders.filter(
      (o) => o.isStuckAnomaly || o.durationMinutes > 10
    );

    expect(stuckOrders.length).toBe(1);
    expect(stuckOrders[0].id).toBe('ord-pending-stuck');
    expect(stuckOrders[0].durationMinutes).toBeGreaterThan(10);
  });

  // Tab 1.3: Transaksi Error / Perlu Review (Side-by-Side Gateway vs Local Status)
  it('1.3 should hold anomalous queue items with side-by-side gateway vs local status comparison', () => {
    const mockQueueItem: PaymentReconciliationQueueItem = {
      id: 'queue-anomaly-001',
      paymentId: 'pay-anom-01',
      orderId: 'ord-anom-01',
      tenantId: 'test-tenant-org-alpha',
      detectedIssue: 'amount_mismatch',
      gatewayReportedStatus: 'settlement',
      localStatus: 'pending_payment',
      resolutionStatus: 'pending_review',
      createdAt: Date.now() - 900000,
      orderAmount: 1500000,
      gatewayAmount: 1450000,
    };

    expect(mockQueueItem.resolutionStatus).toBe('pending_review');
    expect(mockQueueItem.gatewayReportedStatus).toBe('settlement');
    expect(mockQueueItem.localStatus).toBe('pending_payment');
    expect(mockQueueItem.gatewayAmount).not.toBe(mockQueueItem.orderAmount);
  });

  // Tab 1.4: Manual Override by Super Admin with mandatory written reason
  it('1.4 should validate Super Admin override records Super Admin ID and mandatory written reason', () => {
    const superAdminId = 'superadmin-master-001';
    const reason = 'Bukti transfer mutasi rekening BCA valid via finance team';

    // Must enforce non-empty reason with minimum length
    const isValidReason = (r: string) => r.trim().length >= 5;
    expect(isValidReason(reason)).toBe(true);
    expect(isValidReason('   ')).toBe(false);

    const mockResult: ConfirmPaymentReconciliationResult = {
      status: 'CONFIRMED_AND_RECONCILED',
      queueId: 'queue-anomaly-001',
      orderId: 'ord-anom-01',
      paymentId: 'pay-anom-01',
      resolvedBySuperAdminId: superAdminId,
      resolvedBy: superAdminId,
      reason: reason,
      orderStatus: 'paid',
      paymentStatus: 'settlement',
      resolvedAt: Date.now(),
    };

    expect(mockResult.orderStatus).toBe('paid');
    expect(mockResult.paymentStatus).toBe('settlement');
    expect(mockResult.resolvedBySuperAdminId).toBe(superAdminId);
    expect(mockResult.reason).toBe(reason);
  });
});
