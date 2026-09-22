import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  FileCheck2,
  XCircle,
  TrendingUp,
  Zap,
  DollarSign,
  Building2,
  ExternalLink,
  Info,
  Layers,
  Radio,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  ReconciliationOrderDto,
  PaymentReconciliationQueueItem,
  ConfirmPaymentReconciliationResult,
} from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export type ReconciliationTab = 'paid' | 'pending' | 'review';

export const PaymentReconciliationScreen: React.FC = () => {
  const { user } = useAuth();

  // Active Tab
  const [activeTab, setActiveTab] = useState<ReconciliationTab>('review');

  // Data States
  const [paidOrders, setPaidOrders] = useState<ReconciliationOrderDto[]>([]);
  const [pendingOrders, setPendingOrders] = useState<ReconciliationOrderDto[]>([]);
  const [queueItems, setQueueItems] = useState<PaymentReconciliationQueueItem[]>([]);

  // Loading States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCheckingAuto, setIsCheckingAuto] = useState<boolean>(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tenantFilter, setTenantFilter] = useState<string>('ALL');

  // Realtime & Metrics
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [realtimePulse, setRealtimePulse] = useState<boolean>(false);
  const [realtimeCount, setRealtimeCount] = useState<number>(0);

  // Modals & Action States
  const [confirmModalItem, setConfirmModalItem] = useState<PaymentReconciliationQueueItem | null>(null);
  const [confirmReason, setConfirmReason] = useState<string>('');
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState<boolean>(false);

  const [rejectModalItem, setRejectModalItem] = useState<PaymentReconciliationQueueItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [isSubmittingReject, setIsSubmittingReject] = useState<boolean>(false);

  // Audit Feedback Banner
  const [auditSuccessBanner, setAuditSuccessBanner] = useState<{
    queueId: string;
    orderId: string;
    superAdminId: string;
    reason: string;
    timestamp: number;
  } | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);

  // Internal Drill / Developer Mode Gate (Protects Production from simulate-stuck)
  const [isDevDrillEnabled, setIsDevDrillEnabled] = useState<boolean>(() => {
    return (
      import.meta.env.MODE !== 'production' &&
      localStorage.getItem('orchestree_dev_drill_enabled') === 'true'
    );
  });
  const [isSimulatingStuck, setIsSimulatingStuck] = useState<boolean>(false);
  const [simStuckOrderId, setSimStuckOrderId] = useState<string>('');

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    setActionError(null);

    try {
      setBackendError(null);
      const [paidRes, pendingRes, queueRes] = await Promise.all([
        api.getReconciliationOrders('paid'),
        api.getReconciliationOrders('pending_payment'),
        api.getReconciliationQueue('all'),
      ]);

      setPaidOrders(paidRes || []);
      setPendingOrders(pendingRes || []);
      setQueueItems(queueRes || []);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Error fetching reconciliation data', err);
      setBackendError({
        endpoint: '/admin/reconciliation/orders & /admin/reconciliation/queue',
        status: err?.status || err?.statusCode || 500,
        message: err?.message || 'Gagal memuat data rekonsiliasi pembayaran dari backend.',
        rawDetails: err?.rawDetails || err?.stack || err?.toString(),
        timestamp: new Date().toLocaleTimeString(),
      });
      setActionError(err.message || 'Gagal memuat data rekonsiliasi pembayaran');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // 10s auto polling for guaranteed synchronization
    const interval = setInterval(() => {
      fetchData(true);
    }, 10000);

    // Supabase Realtime Subscription for instant feedback
    try {
      const channel = supabase
        .channel('admin-payment-reconciliation-stream')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          () => {
            setRealtimePulse(true);
            setRealtimeCount((c) => c + 1);
            fetchData(true);
            setTimeout(() => setRealtimePulse(false), 2000);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          () => {
            setRealtimePulse(true);
            setRealtimeCount((c) => c + 1);
            fetchData(true);
            setTimeout(() => setRealtimePulse(false), 2000);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payment_reconciliation_queue' },
          () => {
            setRealtimePulse(true);
            setRealtimeCount((c) => c + 1);
            fetchData(true);
            setTimeout(() => setRealtimePulse(false), 2000);
          }
        )
        .subscribe();

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    } catch (e) {
      console.warn('Realtime subscription not available, using periodic polling', e);
      return () => clearInterval(interval);
    }
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Actions: Confirm & Reject
  // ---------------------------------------------------------------------------
  const handleConfirmOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmModalItem) return;
    if (confirmReason.trim().length < 5) {
      setActionError('Alasan tertulis wajib diisi minimal 5 karakter untuk audit trail legal.');
      return;
    }

    setIsSubmittingConfirm(true);
    setActionError(null);

    try {
      const res: ConfirmPaymentReconciliationResult = await api.confirmPaymentReconciliation(
        confirmModalItem.id,
        confirmReason.trim()
      );

      setAuditSuccessBanner({
        queueId: res.queueId,
        orderId: res.orderId,
        superAdminId: res.resolvedBySuperAdminId || user?.id || 'superadmin-001',
        reason: res.reason,
        timestamp: res.resolvedAt || Date.now(),
      });

      setConfirmModalItem(null);
      setConfirmReason('');
      await fetchData(true);
    } catch (err: any) {
      console.error('Failed to confirm reconciliation override', err);
      setActionError(err.message || 'Gagal melakukan konfirmasi override pembayaran');
    } finally {
      setIsSubmittingConfirm(false);
    }
  };

  const handleRejectOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (rejectReason.trim().length < 5) {
      setActionError('Alasan penolakan / investigasi wajib diisi minimal 5 karakter.');
      return;
    }

    setIsSubmittingReject(true);
    setActionError(null);

    try {
      await api.rejectPaymentReconciliation(rejectModalItem.id, rejectReason.trim());
      setRejectModalItem(null);
      setRejectReason('');
      await fetchData(true);
    } catch (err: any) {
      console.error('Failed to reject reconciliation item', err);
      setActionError(err.message || 'Gagal menolak item rekonsiliasi');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  // ---------------------------------------------------------------------------
  // DoD Simulation & Manual Auto-Check Triggers
  // ---------------------------------------------------------------------------
  const handleTriggerAutoCheck = async () => {
    setIsCheckingAuto(true);
    setActionError(null);
    try {
      const res = await api.triggerPaymentReconciliationCheck(10);
      await fetchData(true);
      setAuditSuccessBanner({
        queueId: 'JOB-TRIGGERED',
        orderId: `Checked: ${res.checkedCount}, Auto-reconciled: ${res.autoReconciledCount}, Pending Review: ${res.pendingReviewCount}`,
        superAdminId: user?.id || 'superadmin-001',
        reason: 'Payment Reconciliation Auto-Check Job completed successfully',
        timestamp: Date.now(),
      });
    } catch (err: any) {
      setActionError(`Gagal menjalankan auto-check: ${err.message}`);
    } finally {
      setIsCheckingAuto(false);
    }
  };

  const handleSimulateStuck = async () => {
    // Safety check: ensure developer flag is set
    if (!isDevDrillEnabled) {
      setActionError('AKSES DITOLAK: Fitur simulate-stuck diproteksi untuk environment non-produksi.');
      return;
    }

    const confirmPrompt = window.confirm(
      '⚠️ PERINGATAN DRILL INTERNAL / NON-PRODUCTION:\n' +
        'Anda akan mengirim sinyal simulasi transaksi stuck ke endpoint:\n' +
        'POST /admin/payment-reconciliation/simulate-stuck\n\n' +
        'Aksi ini akan memasukkan order pengujian ke dalam antrean investigasi.\n' +
        'Apakah Anda yakin ingin melanjutkan simulasi?'
    );
    if (!confirmPrompt) return;

    setIsSimulatingStuck(true);
    setActionError(null);
    try {
      const res = await api.simulateStuckPayment(
        simStuckOrderId.trim() || undefined,
        'Internal QA Drill: Simulated stuck order test'
      );
      setAuditSuccessBanner({
        queueId: 'DRILL-SIMULATE-STUCK',
        orderId: res?.orderId || simStuckOrderId || 'SIM-TEST-ORDER',
        superAdminId: user?.id || 'superadmin-drill',
        reason: 'Simulate stuck order triggered via internal QA drill harness',
        timestamp: Date.now(),
      });
      setSimStuckOrderId('');
      await fetchData(true);
    } catch (err: any) {
      setActionError(`Simulate stuck drill gagal: ${err.message}`);
    } finally {
      setIsSimulatingStuck(false);
    }
  };

  const toggleDevDrill = () => {
    const nextState = !isDevDrillEnabled;
    setIsDevDrillEnabled(nextState);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('orchestree_dev_drill_enabled', nextState ? 'true' : 'false');
    }
  };

  // ---------------------------------------------------------------------------
  // Computations & Filterings
  // ---------------------------------------------------------------------------
  const pendingReviewQueueItems = useMemo(() => {
    return queueItems.filter((it) => it.resolutionStatus === 'pending_review');
  }, [queueItems]);

  const resolvedQueueItems = useMemo(() => {
    return queueItems.filter((it) => it.resolutionStatus !== 'pending_review');
  }, [queueItems]);

  const stuckPendingOrdersCount = useMemo(() => {
    return pendingOrders.filter((o) => o.isStuckAnomaly || o.durationMinutes > 10).length;
  }, [pendingOrders]);

  const totalPaidAmount = useMemo(() => {
    return paidOrders.reduce((acc, curr) => acc + curr.amount, 0);
  }, [paidOrders]);

  // Filtered List based on tab, search, and tenant
  const filteredPaidOrders = useMemo(() => {
    return paidOrders.filter((o) => {
      const matchSearch =
        searchQuery === '' ||
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.tenantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.paymentGatewayRef && o.paymentGatewayRef.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchTenant = tenantFilter === 'ALL' || o.tenantId === tenantFilter;
      return matchSearch && matchTenant;
    });
  }, [paidOrders, searchQuery, tenantFilter]);

  const filteredPendingOrders = useMemo(() => {
    return pendingOrders.filter((o) => {
      const matchSearch =
        searchQuery === '' ||
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.tenantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.paymentGatewayRef && o.paymentGatewayRef.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchTenant = tenantFilter === 'ALL' || o.tenantId === tenantFilter;
      return matchSearch && matchTenant;
    });
  }, [pendingOrders, searchQuery, tenantFilter]);

  const filteredQueueItems = useMemo(() => {
    return pendingReviewQueueItems.filter((q) => {
      const matchSearch =
        searchQuery === '' ||
        q.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.paymentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.tenantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.detectedIssue.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTenant = tenantFilter === 'ALL' || q.tenantId === tenantFilter;
      return matchSearch && matchTenant;
    });
  }, [pendingReviewQueueItems, searchQuery, tenantFilter]);

  const availableTenants = useMemo(() => {
    const set = new Set<string>();
    paidOrders.forEach((o) => o.tenantId && set.add(o.tenantId));
    pendingOrders.forEach((o) => o.tenantId && set.add(o.tenantId));
    pendingReviewQueueItems.forEach((q) => q.tenantId && set.add(q.tenantId));
    return Array.from(set);
  }, [paidOrders, pendingOrders, pendingReviewQueueItems]);

  const formatIdr = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatTimeAgo = (minutes: number) => {
    if (minutes < 1) return 'Baru saja (< 1 m)';
    if (minutes < 60) return `${minutes} menit yang lalu`;
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `${hours}j ${remMin}m yang lalu`;
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* Top Banner & Control Bar                                            */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-xl shadow-md shadow-emerald-950/40">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Payment Reconciliation & Anomaly Review
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                  Reconciliation Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Audit rekonsiliasi otomatis gateway Midtrans/Xendit vs database lokal, deteksi transaksi stuck, dan override Super Admin berizin.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Auto-Check & Refresh */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Internal Dev Drill Toggle (Only in Non-Prod or Explicit Dev Toggle) */}
          <button
            onClick={toggleDevDrill}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isDevDrillEnabled
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Aktifkan mode drill internal developer (simulate-stuck)"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>{isDevDrillEnabled ? 'Dev Drill: AKTIF' : 'Dev Drill Mode'}</span>
          </button>

          <button
            onClick={handleTriggerAutoCheck}
            disabled={isCheckingAuto}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all disabled:opacity-50"
            title="Jalankan job deteksi anomali pada order stuck > 10 menit sekarang"
          >
            <Zap className={`w-3.5 h-3.5 ${isCheckingAuto ? 'animate-spin' : ''}`} />
            <span>{isCheckingAuto ? 'Mengecek Gateway...' : 'Jalankan Auto-Check (10m)'}</span>
          </button>

          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Internal Drill Testing Panel (STRICTLY GATED) */}
      {isDevDrillEnabled && (
        <div className="bg-amber-950/30 border border-amber-700/60 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                Internal Drill Testing Panel (Non-Production / Developer Only)
              </span>
            </div>
            <span className="text-[10px] font-mono bg-amber-950 text-amber-400 border border-amber-800 px-2 py-0.5 rounded">
              POST /admin/payment-reconciliation/simulate-stuck
            </span>
          </div>
          <p className="text-xs text-amber-200/80">
            Fitur ini mensimulasikan webhook gateway yang tidak terkirim atau transaksi yang stuck &gt; 10 menit untuk menguji circuit breaker dan auto-check. <strong>HANYA</strong> untuk keperluan pengujian lokal/staging, tidak diizinkan pada operasional normal produksi.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
            <input
              type="text"
              value={simStuckOrderId}
              onChange={(e) => setSimStuckOrderId(e.target.value)}
              placeholder="Order ID opsional (cth: ORD-TEST-9988)"
              className="w-full sm:w-80 bg-slate-950 border border-amber-900/60 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
            />
            <button
              onClick={handleSimulateStuck}
              disabled={isSimulatingStuck}
              className="w-full sm:w-auto px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg text-xs transition disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{isSimulatingStuck ? 'Mengirim Simulasi...' : 'Simulasikan Order Stuck'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Realtime Live Pulse Indicator & Timestamp                           */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex items-center justify-between text-xs px-1 text-slate-400">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                realtimePulse ? 'bg-emerald-400 ring-4 ring-emerald-500/30' : 'bg-emerald-500'
              } transition-all duration-300`}
            />
            <span className="text-emerald-400 font-semibold tracking-wide uppercase text-[10px]">
              Realtime Sync Live
            </span>
          </div>
          {realtimeCount > 0 && (
            <span className="text-slate-500 text-[11px]">
              ({realtimeCount} event terdeteksi via live stream)
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          Pembaruan Terakhir: {lastUpdated.toLocaleTimeString('id-ID')}
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Honest Error Banner (Super Admin Backend Diagnostics)               */}
      {/* ------------------------------------------------------------------- */}
      {backendError && (
        <HonestErrorBanner
          error={backendError}
          onRetry={() => fetchData(false)}
          isRetrying={isLoading || isRefreshing}
          title="Status Endpoint Rekonsiliasi (/admin/reconciliation)"
        />
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Action Error Banner                                                 */}
      {/* ------------------------------------------------------------------- */}
      {actionError && !backendError && (
        <div className="bg-rose-950/40 border border-rose-800/80 text-rose-300 p-4 rounded-xl flex items-center justify-between text-sm">
          <div className="flex items-center space-x-3">
            <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-semibold px-2 py-1"
          >
            Tutup
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Audit Trail Success Banner (MANDATORY PROOF FOR DoD)                */}
      {/* ------------------------------------------------------------------- */}
      {auditSuccessBanner && (
        <div className="bg-emerald-950/40 border border-emerald-700/70 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg shadow-emerald-950/20">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-emerald-900/60 text-emerald-300 rounded-lg shrink-0 mt-0.5 border border-emerald-700/60">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-700">
                  Audit Ledger Recorded
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(auditSuccessBanner.timestamp).toLocaleTimeString('id-ID')}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-200 mt-1">
                Override Sukses: Order <span className="text-emerald-300 font-mono">{auditSuccessBanner.orderId}</span> status berubah menjadi <span className="text-emerald-400 font-bold">PAID</span>.
              </p>
              <p className="text-xs text-slate-300 mt-0.5">
                <span className="text-slate-400 font-semibold">Super Admin ID:</span>{' '}
                <span className="font-mono text-purple-300 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/60">
                  {auditSuccessBanner.superAdminId}
                </span>{' '}
                • <span className="text-slate-400 font-semibold">Alasan Audit:</span> "{auditSuccessBanner.reason}"
              </p>
            </div>
          </div>
          <button
            onClick={() => setAuditSuccessBanner(null)}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 self-end md:self-center px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800"
          >
            Tutup Notifikasi
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 3 Metric Cards                                                      */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Metric 1: Transaksi Berhasil */}
        <div
          onClick={() => setActiveTab('paid')}
          className={`cursor-pointer bg-slate-900 border ${
            activeTab === 'paid' ? 'border-emerald-500/80 ring-1 ring-emerald-500/30' : 'border-slate-800'
          } hover:border-slate-700 p-5 rounded-2xl transition-all relative overflow-hidden group`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <CheckCircle2 className="w-16 h-16 text-emerald-400" />
          </div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 rounded-lg bg-emerald-950/70 border border-emerald-800/60 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tab 1.1</span>
              <h3 className="text-sm font-semibold text-slate-200">Transaksi Berhasil</h3>
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">{paidOrders.length}</div>
              <div className="text-xs text-emerald-400 font-medium mt-0.5">
                Total: {formatIdr(totalPaidAmount)}
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
              Status: Paid
            </span>
          </div>
        </div>

        {/* Metric 2: Transaksi Pending (Highlight Anomali Stuck) */}
        <div
          onClick={() => setActiveTab('pending')}
          className={`cursor-pointer bg-slate-900 border ${
            activeTab === 'pending'
              ? 'border-amber-500/80 ring-1 ring-amber-500/30'
              : stuckPendingOrdersCount > 0
              ? 'border-rose-900/60 bg-rose-950/10'
              : 'border-slate-800'
          } hover:border-slate-700 p-5 rounded-2xl transition-all relative overflow-hidden group`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Clock className="w-16 h-16 text-amber-400" />
          </div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 rounded-lg bg-amber-950/70 border border-amber-800/60 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tab 1.2</span>
              <h3 className="text-sm font-semibold text-slate-200">Transaksi Pending</h3>
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">{pendingOrders.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Menunggu respon gateway
              </div>
            </div>
            {stuckPendingOrdersCount > 0 ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/80 animate-pulse">
                {stuckPendingOrdersCount} Stuck (&gt;10m)
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-800/60">
                Lancar (&lt;10m)
              </span>
            )}
          </div>
        </div>

        {/* Metric 3: Antrean Review / Anomali (Bagian D Focus) */}
        <div
          onClick={() => setActiveTab('review')}
          className={`cursor-pointer bg-slate-900 border ${
            activeTab === 'review'
              ? 'border-indigo-500/80 ring-1 ring-indigo-500/30'
              : pendingReviewQueueItems.length > 0
              ? 'border-rose-500/50 ring-1 ring-rose-500/20'
              : 'border-slate-800'
          } hover:border-slate-700 p-5 rounded-2xl transition-all relative overflow-hidden group`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertTriangle className="w-16 h-16 text-rose-400" />
          </div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 rounded-lg bg-rose-950/70 border border-rose-800/60 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tab 1.3</span>
              <h3 className="text-sm font-semibold text-slate-200">Error / Perlu Review</h3>
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">
                {pendingReviewQueueItems.length}
              </div>
              <div className="text-xs text-rose-400 font-medium mt-0.5">
                Menunggu Tindakan Super Admin
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/80">
              Pending Review
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Tab Navigation & Search Filter                                      */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          {/* Tab 1 */}
          <button
            onClick={() => setActiveTab('paid')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'paid'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Transaksi Berhasil</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === 'paid' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {paidOrders.length}
            </span>
          </button>

          {/* Tab 2 */}
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'pending'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Transaksi Pending</span>
            {stuckPendingOrdersCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-bold animate-pulse">
                {stuckPendingOrdersCount} stuck
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === 'pending' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {pendingOrders.length}
            </span>
          </button>

          {/* Tab 3 */}
          <button
            onClick={() => setActiveTab('review')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'review'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Error / Perlu Review</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === 'review'
                  ? 'bg-rose-700 text-white'
                  : pendingReviewQueueItems.length > 0
                  ? 'bg-rose-900/80 text-rose-300 border border-rose-700'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {pendingReviewQueueItems.length}
            </span>
          </button>
        </div>

        {/* Search & Tenant Filter */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Order / Tenant / Ref..."
              className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-52"
            />
          </div>

          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Semua Tenant</option>
            {availableTenants.map((tId) => (
              <option key={tId} value={tId}>
                {tId}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* TAB 1: Transaksi Berhasil (status='paid')                           */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'paid' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-slate-200 text-sm">
                Daftar Pesanan Berstatus PAID (Tersinkronisasi Realtime)
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Total {filteredPaidOrders.length} transaksi berhasil
            </span>
          </div>

          {filteredPaidOrders.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Tidak ada transaksi berstatus paid yang cocok dengan filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">No. Order</th>
                    <th className="py-3.5 px-4">Tenant / Pelanggan</th>
                    <th className="py-3.5 px-4">Total Nominal</th>
                    <th className="py-3.5 px-4">Gateway Reference</th>
                    <th className="py-3.5 px-4">Waktu Transaksi</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredPaidOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {order.orderNumber}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200 font-medium">{order.tenantName || order.tenantId}</div>
                        <div className="text-[11px] text-slate-500">{order.customerId}</div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-emerald-400">
                        {formatIdr(order.amount)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {order.paymentGatewayRef || 'MIDTRANS-SETTLED'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {new Date(order.createdAt).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-800/80">
                          PAID / SETTLEMENT
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 2: Transaksi Pending (Highlight Merah jika > 10 min)             */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {/* Information banner explaining the 10m threshold anomaly */}
          <div className="bg-amber-950/30 border border-amber-800/60 p-4 rounded-xl flex items-start space-x-3 text-xs text-amber-200/90">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300 mb-0.5">
                Monitoring Transaksi Pending &amp; Deteksi Anomali Webhook (&gt; 10 Menit):
              </p>
              <p>
                Transaksi dengan status <code className="bg-amber-950 px-1 py-0.5 rounded text-amber-300">pending_payment</code>{' '}
                yang telah dibuat lebih dari <strong>10 menit</strong> yang lalu otomatis ditandai{' '}
                <span className="text-rose-400 font-bold">MERAH (Highlight Anomali)</span>. Hal ini mengindikasikan webhook gateway gagal sampai ke backend atau pembayaran terhambat.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-slate-200 text-sm">
                  Daftar Transaksi Pending &amp; Durasi Menunggu
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                {filteredPendingOrders.length} transaksi pending
              </span>
            </div>

            {filteredPendingOrders.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Tidak ada transaksi berstatus pending saat ini.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="py-3.5 px-4">No. Order</th>
                      <th className="py-3.5 px-4">Tenant / Pelanggan</th>
                      <th className="py-3.5 px-4">Nominal Tagihan</th>
                      <th className="py-3.5 px-4">Durasi Sejak Dibuat</th>
                      <th className="py-3.5 px-4">Gateway Reference</th>
                      <th className="py-3.5 px-4">Status &amp; Indikasi</th>
                      <th className="py-3.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {filteredPendingOrders.map((order) => {
                      const isAnomaly = order.isStuckAnomaly || order.durationMinutes > 10;
                      return (
                        <tr
                          key={order.id}
                          className={`transition-colors ${
                            isAnomaly
                              ? 'bg-rose-950/20 hover:bg-rose-950/30 border-l-4 border-l-rose-500'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-white">
                            {order.orderNumber}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-slate-200 font-medium">{order.tenantName || order.tenantId}</div>
                            <div className="text-[11px] text-slate-500">{order.customerId}</div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-200">
                            {formatIdr(order.amount)}
                          </td>
                          <td className="py-3.5 px-4">
                            <div
                              className={`font-semibold flex items-center space-x-1.5 ${
                                isAnomaly ? 'text-rose-400' : 'text-amber-300'
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>{formatTimeAgo(order.durationMinutes)}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {new Date(order.createdAt).toLocaleTimeString('id-ID')}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                            {order.paymentGatewayRef || 'WAITING_PAYMENT'}
                          </td>
                          <td className="py-3.5 px-4">
                            {isAnomaly ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/80 shadow-sm shadow-rose-950/40">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span>⚠️ STUCK (&gt;10m) ANOMALI WEBHOOK</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                                Menunggu Pembayaran
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {isAnomaly ? (
                              <button
                                onClick={() => setActiveTab('review')}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                              >
                                <span>Cek Antrean Review</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                onClick={handleTriggerAutoCheck}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium transition-all"
                              >
                                Cek Gateway
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 3: Transaksi Error / Perlu Review (Side-by-side & Override)    */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'review' && (
        <div className="space-y-4">
          {/* Header Explanation for Tab 1.3 */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-rose-950/70 border border-rose-800/60 text-rose-400 rounded-xl mt-0.5">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  Antrean Rekonsiliasi Pembayaran (payment_reconciliation_queue)
                  <span className="text-[10px] font-mono font-normal text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">
                    WHERE resolution_status='pending_review'
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tinjau detail ketidakcocokan antara <strong>Status Gateway</strong> dan <strong>Database Lokal</strong>. Lakukan manual override setelah verifikasi mutasi rekening.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 self-end md:self-center">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-rose-950/70 text-rose-300 border border-rose-800/80">
                {filteredQueueItems.length} Menunggu Review
              </span>
            </div>
          </div>

          {filteredQueueItems.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white">Tidak Ada Transaksi Anomali Menunggu Review</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                Semua transaksi riil telah tersinkronisasi otomatis dengan payment gateway dan status terverifikasi normal.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQueueItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-rose-900/60 rounded-2xl p-5 hover:border-rose-700/80 transition-all shadow-sm"
                >
                  {/* Top Bar of Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60">
                        QUEUE ID: {item.id}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs font-medium text-slate-300 font-mono">
                        Order: {item.orderId}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs font-medium text-slate-300 font-mono">
                        Payment: {item.paymentId}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800">
                        {item.detectedIssue.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(item.createdAt).toLocaleTimeString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {/* SIDE-BY-SIDE COMPARISON (Mandatory 1.3) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3">
                    {/* Left: Gateway Reported Status */}
                    <div className="bg-slate-950/60 border border-emerald-900/40 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Status Gateway (Midtrans / Xendit)
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">API Gateway Source</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Status Laporan:</span>
                          <span className="font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 uppercase">
                            {item.gatewayReportedStatus || 'settlement'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Nominal Gateway:</span>
                          <span className="font-bold text-slate-200">
                            {item.gatewayAmount ? formatIdr(item.gatewayAmount) : 'N/A'}
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-400/90 pt-1">
                          ✓ Gateway mencatat dana telah berhasil ditransfer oleh nasabah.
                        </div>
                      </div>
                    </div>

                    {/* Right: Local Status (Mismatch Indicator) */}
                    <div className="bg-slate-950/60 border border-rose-900/40 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Status Database Lokal (Client Database)
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">Local Orders Table</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Status Lokal:</span>
                          <span className="font-bold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800 uppercase">
                            {item.localStatus || 'pending_payment'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Nominal Tagihan:</span>
                          <span className="font-bold text-slate-200">
                            {item.orderAmount ? formatIdr(item.orderAmount) : 'N/A'}
                          </span>
                        </div>
                        <div className="text-[11px] text-rose-400/90 pt-1">
                          ⚠️ Webhook belum berhasil memperbarui status lokal secara otomatis.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Nominal Mismatch Alert if amounts differ */}
                  {item.gatewayAmount && item.orderAmount && item.gatewayAmount !== item.orderAmount && (
                    <div className="p-2.5 bg-rose-950/30 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center space-x-2 my-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        <strong>Peringatan Nominal Mismatch:</strong> Nominal gateway ({formatIdr(item.gatewayAmount)}) berbeda dengan tagihan lokal ({formatIdr(item.orderAmount)}). Harap verifikasi bukti transfer asli sebelum override!
                      </span>
                    </div>
                  )}

                  {/* Bottom Actions: Manual Override vs Reject */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800 mt-3">
                    <div className="text-xs text-slate-400">
                      Tenant: <span className="text-slate-200 font-semibold">{item.tenantId}</span>
                    </div>

                    <div className="flex items-center space-x-2 self-end sm:self-auto">
                      <button
                        onClick={() => {
                          setRejectModalItem(item);
                          setRejectReason('');
                        }}
                        className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-rose-300 border border-slate-700 text-xs font-semibold transition-all"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Tolak / Investigasi Lanjut</span>
                      </button>

                      <button
                        onClick={() => {
                          setConfirmModalItem(item);
                          setConfirmReason('');
                        }}
                        className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-950/40"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Konfirmasi Sudah Bayar (Manual Override)</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Historical Resolved Queue Table */}
          {resolvedQueueItems.length > 0 && (
            <div className="mt-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileCheck2 className="w-4 h-4 text-slate-400" />
                  <h4 className="font-semibold text-slate-300 text-xs uppercase tracking-wider">
                    Riwayat Resolusi Rekonsiliasi (Audit Ledger History)
                  </h4>
                </div>
                <span className="text-xs text-slate-500">{resolvedQueueItems.length} diselesaikan</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-400">
                  <thead className="bg-slate-950/60 text-slate-500 uppercase font-semibold border-b border-slate-800 text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Queue ID</th>
                      <th className="py-2.5 px-4">Order ID</th>
                      <th className="py-2.5 px-4">Status Resolusi</th>
                      <th className="py-2.5 px-4">Super Admin ID</th>
                      <th className="py-2.5 px-4">Alasan Tertulis</th>
                      <th className="py-2.5 px-4 text-right">Waktu Resolusi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {resolvedQueueItems.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono text-slate-300">{r.id}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-300">{r.orderId}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.resolutionStatus === 'resolved_confirmed'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {r.resolutionStatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-purple-300">
                          {r.resolvedBySuperAdminId || r.resolvedBy || 'superadmin-001'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300 max-w-xs truncate" title={r.resolutionReason || ''}>
                          {r.resolutionReason || '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-500 text-[11px]">
                          {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString('id-ID') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 1: Konfirmasi Sudah Bayar (Manual Override Super Admin)       */}
      {/* ------------------------------------------------------------------- */}
      {confirmModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-900/60 text-emerald-400 rounded-xl border border-emerald-700/60">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Konfirmasi Sudah Bayar (Manual Override)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Audit Trail Wajib: POST /api/v1/admin/payment-reconciliation/{'{id}'}/confirm
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmModalItem(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmOverride} className="p-5 space-y-4">
              {/* Order Details Preview */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Queue ID:</span>
                  <span className="font-mono text-purple-300 font-bold">{confirmModalItem.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Order ID:</span>
                  <span className="font-mono text-slate-200 font-bold">{confirmModalItem.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tenant ID:</span>
                  <span className="text-slate-200">{confirmModalItem.tenantId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nominal Tagihan:</span>
                  <span className="font-bold text-emerald-400">
                    {confirmModalItem.orderAmount ? formatIdr(confirmModalItem.orderAmount) : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Gateway Reported:</span>
                  <span className="font-bold text-emerald-300 uppercase">
                    {confirmModalItem.gatewayReportedStatus || 'settlement'}
                  </span>
                </div>
              </div>

              {/* Legal Notice of Super Admin Identity */}
              <div className="bg-purple-950/30 border border-purple-800/60 p-3 rounded-xl text-xs text-purple-200 flex items-start space-x-2.5">
                <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-purple-300">Jejak Audit Kekal:</p>
                  <p className="mt-0.5 text-purple-300/90">
                    Identitas Super Admin Anda (
                    <span className="font-mono font-bold text-white">{user?.id || 'superadmin-001'}</span>)
                    dan alasan tertulis di bawah akan dicatat permanen ke dalam Audit Ledger.
                  </p>
                </div>
              </div>

              {/* Written Reason Input (MANDATORY REQUIREMENT 1.4) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Alasan Tertulis Override <span className="text-rose-400">* (Wajib diisi, min. 5 karakter)</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={confirmReason}
                  onChange={(e) => setConfirmReason(e.target.value)}
                  placeholder="Contoh: Sudah verifikasi mutasi rekening BCA & bukti screenshot transaksi Midtrans via merchant dashboard. Dana telah masuk sah."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModalItem(null)}
                  disabled={isSubmittingConfirm}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingConfirm || confirmReason.trim().length < 5}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/40 disabled:opacity-50 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmittingConfirm ? 'Menyimpan & Audit...' : 'Konfirmasi & Ubah ke PAID'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 2: Tolak / Investigasi Lanjut                                 */}
      {/* ------------------------------------------------------------------- */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-rose-900/60 text-rose-400 rounded-xl border border-rose-700/60">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Tolak / Investigasi Lanjut</h3>
                  <p className="text-xs text-slate-400">Order {rejectModalItem.orderId}</p>
                </div>
              </div>
              <button
                onClick={() => setRejectModalItem(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRejectOverride} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Alasan Penolakan / Catatan Investigasi <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Contoh: Bukti transfer mencurigakan / nominal tidak sesuai / eskalasi ke finance merchant."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalItem(null)}
                  disabled={isSubmittingReject}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReject || rejectReason.trim().length < 5}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-950/40 disabled:opacity-50 transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  <span>{isSubmittingReject ? 'Menyimpan...' : 'Simpan Penolakan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
