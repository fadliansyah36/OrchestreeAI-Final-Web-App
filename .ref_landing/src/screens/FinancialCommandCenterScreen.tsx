import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  Building2,
  RefreshCw,
  Layers,
  ArrowUpRight,
  Zap,
  Target,
  BarChart3,
  Compass,
  PieChart,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  CreditCard,
  FileText,
  Plus,
  X,
  Check,
  Search,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  FinancialCommandCenterResponse,
  RevenueIntelligenceSummary,
  LeadPipelineMonitoringSummary,
} from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const FinancialCommandCenterScreen: React.FC = () => {
  // Tab State
  const [activeTab, setActiveTab] = useState<
    'financial' | 'revenue_intelligence' | 'lead_pipeline' | 'subscriptions' | 'invoices' | 'transactions'
  >('financial');

  // Tab 1: Financial Command Center State
  const [data, setData] = useState<FinancialCommandCenterResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [financialError, setFinancialError] = useState<HonestErrorInfo | null>(null);
  const [endpointAuditInfo, setEndpointAuditInfo] = useState<{
    tested: boolean;
    primaryStatus: number | string;
    analyticsStatus: number | string;
    isIdentical: boolean;
    notes: string;
  }>({
    tested: false,
    primaryStatus: '-',
    analyticsStatus: '-',
    isIdentical: false,
    notes: 'Belum diaudit',
  });

  // Tab 2: Revenue Intelligence State
  const [revenueData, setRevenueData] = useState<RevenueIntelligenceSummary | null>(null);
  const [isRevenueLoading, setIsRevenueLoading] = useState<boolean>(false);
  const [revenueError, setRevenueError] = useState<HonestErrorInfo | null>(null);

  // Tab 3: Lead Pipeline State
  const [pipelineData, setPipelineData] = useState<LeadPipelineMonitoringSummary | null>(null);
  const [isPipelineLoading, setIsPipelineLoading] = useState<boolean>(false);
  const [pipelineError, setPipelineError] = useState<HonestErrorInfo | null>(null);

  // Tab 4: Subscriptions Lintas-Tenant
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [isSubsLoading, setIsSubsLoading] = useState<boolean>(false);
  const [subsError, setSubsError] = useState<HonestErrorInfo | null>(null);
  const [isCreateSubModalOpen, setIsCreateSubModalOpen] = useState(false);
  const [subFormData, setSubFormData] = useState({
    tenantId: '',
    planCode: 'pro',
    billingInterval: 'monthly',
    status: 'active',
  });

  // Tab 5: Invoices Lintas-Tenant
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isInvoicesLoading, setIsInvoicesLoading] = useState<boolean>(false);
  const [invoicesError, setInvoicesError] = useState<HonestErrorInfo | null>(null);
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false);
  const [invoiceFormData, setInvoiceFormData] = useState({
    tenantId: '',
    amount: 1500000,
    currency: 'IDR',
    description: 'Langganan Pro Bulanan + Kredit Tambahan',
  });

  // Tab 6: Transactions Analytics
  const [transactions, setTransactions] = useState<any>(null);
  const [isTxLoading, setIsTxLoading] = useState<boolean>(false);
  const [txError, setTxError] = useState<HonestErrorInfo | null>(null);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ---------------------------------------------------------------------------
  // Fetchers
  // ---------------------------------------------------------------------------
  const fetchFinancialData = useCallback(async () => {
    setIsLoading(true);
    setFinancialError(null);

    // Audit comparison: /admin/financial-command-center vs /admin/analytics/financial-command-center
    let pStatus: number | string = '200';
    let aStatus: number | string = '200';
    let pData: any = null;
    let aData: any = null;

    try {
      pData = await api.getFinancialCommandCenter();
      setData(pData);
      pStatus = 200;
    } catch (err: any) {
      pStatus = err?.status || 502;
      setFinancialError({
        endpoint: '/admin/financial-command-center',
        status: err?.status || 502,
        message: err?.message || 'Gagal memuat data Financial Command Center.',
        rawDetails: err?.rawDetails || err,
      });
    }

    try {
      aData = await api.getAnalyticsFinancialCommandCenter();
      aStatus = 200;
    } catch (err: any) {
      aStatus = err?.status || 502;
    }

    const isIdentical =
      pStatus === aStatus &&
      JSON.stringify(pData) === JSON.stringify(aData);

    let auditNote = '';
    if (pStatus === 200 && aStatus === 200) {
      auditNote = isIdentical
        ? 'TERKONSOLIDASI (A6.2): Endpoint alias /analytics/financial-command-center telah dikonsolidasikan ke rute standar final /admin/financial-command-center. Keduanya mengembalikan struktur & payload data yang konsisten.'
        : 'Kedua endpoint mengembalikan respon sukses dengan variasi atribut analytics.';
    } else if (pStatus === 502 && aStatus === 502) {
      auditNote = 'KEDUA ENDPOINT OFFLINE (502): /admin/financial-command-center dan /admin/analytics/financial-command-center saat ini tidak dapat dihubungi melalui gateway.';
    } else {
      auditNote = `STATUS BERBEDA: Endpoint primer status ${pStatus}, endpoint analytics status ${aStatus}.`;
    }

    setEndpointAuditInfo({
      tested: true,
      primaryStatus: pStatus,
      analyticsStatus: aStatus,
      isIdentical,
      notes: auditNote,
    });

    setIsLoading(false);
  }, []);

  const fetchRevenueData = useCallback(async () => {
    setIsRevenueLoading(true);
    setRevenueError(null);
    try {
      const res = await api.getRevenueIntelligence();
      setRevenueData(res);
    } catch (err: any) {
      setRevenueError({
        endpoint: '/admin/revenue-intelligence',
        status: err?.status || 502,
        message: err?.message || 'Gagal memuat telemetri Revenue Intelligence.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsRevenueLoading(false);
    }
  }, []);

  const fetchPipelineData = useCallback(async () => {
    setIsPipelineLoading(true);
    setPipelineError(null);
    try {
      const res = await api.getLeadPipelineMonitoring();
      setPipelineData(res);
    } catch (err: any) {
      setPipelineError({
        endpoint: '/admin/lead-pipeline/monitoring',
        status: err?.status || 502,
        message: err?.message || 'Gagal memuat telemetri Lead Pipeline Funnel.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsPipelineLoading(false);
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    setIsSubsLoading(true);
    setSubsError(null);
    try {
      const res = await api.getSubscriptions();
      setSubscriptions(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setSubsError({
        endpoint: '/admin/billing/subscriptions',
        status: err?.status || 502,
        message: err?.message || 'Gagal memuat daftar subscriptions lintas tenant.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsSubsLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setIsInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const res = await api.getInvoices();
      setInvoices(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setInvoicesError({
        endpoint: '/admin/billing/invoices',
        status: err?.status || 502,
        message: err?.message || 'Gagal memuat daftar invoices lintas tenant.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsInvoicesLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setIsTxLoading(true);
    setTxError(null);
    try {
      const res = await api.getAnalyticsTransactions();
      setTransactions(res);
    } catch (err: any) {
      setTxError({
        endpoint: '/admin/analytics/transactions',
        status: err?.status || 502,
        message: err?.message || 'Gagal memuat telemetri transaksi finansial.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'financial') {
      fetchFinancialData();
    } else if (activeTab === 'revenue_intelligence') {
      fetchRevenueData();
    } else if (activeTab === 'lead_pipeline') {
      fetchPipelineData();
    } else if (activeTab === 'subscriptions') {
      fetchSubscriptions();
    } else if (activeTab === 'invoices') {
      fetchInvoices();
    } else if (activeTab === 'transactions') {
      fetchTransactions();
    }
  }, [activeTab, fetchFinancialData, fetchRevenueData, fetchPipelineData, fetchSubscriptions, fetchInvoices, fetchTransactions]);

  const handleRefresh = () => {
    if (activeTab === 'financial') fetchFinancialData();
    else if (activeTab === 'revenue_intelligence') fetchRevenueData();
    else if (activeTab === 'lead_pipeline') fetchPipelineData();
    else if (activeTab === 'subscriptions') fetchSubscriptions();
    else if (activeTab === 'invoices') fetchInvoices();
    else if (activeTab === 'transactions') fetchTransactions();
  };

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subFormData.tenantId.trim()) {
      setNotification({ type: 'error', message: 'Tenant ID wajib diisi.' });
      return;
    }
    try {
      await api.createSubscription(subFormData);
      setNotification({ type: 'success', message: `Subscription tenant ${subFormData.tenantId} berhasil dibuat.` });
      setIsCreateSubModalOpen(false);
      setSubFormData({ tenantId: '', planCode: 'pro', billingInterval: 'monthly', status: 'active' });
      await fetchSubscriptions();
    } catch (err: any) {
      setNotification({ type: 'error', message: `Gagal membuat subscription: ${err.message}` });
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceFormData.tenantId.trim() || invoiceFormData.amount <= 0) {
      setNotification({ type: 'error', message: 'Tenant ID dan nominal faktur valid wajib diisi.' });
      return;
    }
    try {
      await api.createInvoice(invoiceFormData);
      setNotification({ type: 'success', message: `Invoice untuk tenant ${invoiceFormData.tenantId} berhasil diterbitkan.` });
      setIsCreateInvoiceModalOpen(false);
      setInvoiceFormData({ tenantId: '', amount: 1500000, currency: 'IDR', description: 'Langganan Pro Bulanan' });
      await fetchInvoices();
    } catch (err: any) {
      setNotification({ type: 'error', message: `Gagal menerbitkan invoice: ${err.message}` });
    }
  };

  const currentLoading =
    activeTab === 'financial'
      ? isLoading
      : activeTab === 'revenue_intelligence'
      ? isRevenueLoading
      : activeTab === 'lead_pipeline'
      ? isPipelineLoading
      : activeTab === 'subscriptions'
      ? isSubsLoading
      : activeTab === 'invoices'
      ? isInvoicesLoading
      : isTxLoading;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span>Financial & Commercial Revenue Command Center</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            MRR, ARR, Margin Komputasi, Subscriptions, Invoices, dan Pipeline Revenue Intelligence lintas-tenant.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={currentLoading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start sm:self-auto"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${currentLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {notification && (
        <div
          className={`p-3 text-xs rounded-lg border flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {notification.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 flex-wrap">
        <button
          onClick={() => setActiveTab('financial')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'financial'
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Finansial & Float Kredit</span>
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'subscriptions'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Subscriptions Lintas Tenant</span>
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'invoices'
              ? 'bg-purple-600/20 text-purple-400 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Invoices Lintas Tenant</span>
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'transactions'
              ? 'bg-amber-600/20 text-amber-400 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Transactions Analytics</span>
        </button>
        <button
          onClick={() => setActiveTab('revenue_intelligence')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'revenue_intelligence'
              ? 'bg-teal-600/20 text-teal-400 border border-teal-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Revenue Intelligence</span>
        </button>
        <button
          onClick={() => setActiveTab('lead_pipeline')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'lead_pipeline'
              ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Lead Pipeline Funnel</span>
        </button>
      </div>

      {/* TAB 1: Financial Command Center */}
      {activeTab === 'financial' && (
        <div className="space-y-6">
          {/* Endpoint Comparison & Duplicate Audit Box */}
          {endpointAuditInfo.tested && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wide">
                    Audit Endpoint: /admin/financial-command-center vs /admin/analytics/financial-command-center
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Primer: HTTP {endpointAuditInfo.primaryStatus}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Analytics: HTTP {endpointAuditInfo.analyticsStatus}
                  </span>
                  {endpointAuditInfo.isIdentical && (
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                      Duplikat Terdeteksi
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-mono">
                {endpointAuditInfo.notes}
              </p>
            </div>
          )}

          <HonestErrorBanner
            error={financialError}
            onRetry={fetchFinancialData}
            isRetrying={isLoading}
            title="Telemetri Financial Command Center (Status Backend Nyata)"
          />

          {data && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">MRR (Monthly Run Rate)</span>
                  <div className="text-2xl font-bold text-white tracking-tight mt-1">
                    Rp {data.kpis.mrr.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-2 font-mono">
                    ARR: Rp {data.kpis.arr.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Kredit Beredar (Circulating)</span>
                  <div className="text-2xl font-bold text-indigo-400 tracking-tight mt-1 font-mono">
                    {data.kpis.totalCreditsCirculating.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2 font-mono">
                    Terpakai: {data.kpis.totalCreditsConsumed.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Net Computational Margin</span>
                  <div className="text-2xl font-bold text-emerald-400 tracking-tight mt-1">
                    {data.kpis.netMarginPercentage.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2 font-mono">
                    Cost: Rp {data.kpis.estimatedComputeCostIdr.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Subscriptions Aktif</span>
                  <div className="text-2xl font-bold text-cyan-400 tracking-tight mt-1 font-mono">
                    {data.kpis.activeSubscriptionsCount}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2 font-mono">
                    Rev: Rp {data.kpis.totalRevenueIdr.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              {/* Top Consuming Tenants Table */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <span>Top Tenant Konsumsi Kredit (Live Telemetry)</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {data.topTenantsByConsumption?.length || 0} Tenant Teratas
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Tenant</th>
                        <th className="px-4 py-3">Paket</th>
                        <th className="px-4 py-3 text-right">Kredit Digunakan</th>
                        <th className="px-4 py-3 text-right">Porsi Penggunaan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {data.topTenantsByConsumption?.map((t, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 font-semibold text-white">
                            <div>{t.tenantName}</div>
                            <span className="text-[10px] text-slate-500 font-mono">{t.tenantId}</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-emerald-400 uppercase font-bold">{t.planCode}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-200">
                            {t.creditsConsumed.toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">
                            {t.percentageOfTotal.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: Subscriptions Lintas Tenant */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Subscriptions Lintas-Tenant</h3>
              <p className="text-xs text-slate-400">GET/POST /admin/billing/subscriptions</p>
            </div>
            <button
              onClick={() => setIsCreateSubModalOpen(true)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Subscription Tenant</span>
            </button>
          </div>

          <HonestErrorBanner
            error={subsError}
            onRetry={fetchSubscriptions}
            isRetrying={isSubsLoading}
            title="Telemetri Subscriptions Lintas-Tenant"
          />

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tenant ID</th>
                  <th className="py-3 px-4">Plan Code</th>
                  <th className="py-3 px-4">Interval</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Masa Aktif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      {isSubsLoading ? 'Memuat langganan...' : 'Belum ada data subscription aktif.'}
                    </td>
                  </tr>
                ) : (
                  subscriptions.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono font-bold text-white">{s.tenantId || s.tenant_id}</td>
                      <td className="py-3 px-4 font-mono text-emerald-400 uppercase">{s.planCode || s.plan_code}</td>
                      <td className="py-3 px-4 capitalize">{s.billingInterval || s.billing_interval || 'monthly'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {s.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString('id-ID') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Invoices Lintas Tenant */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Faktur & Invoices Lintas-Tenant</h3>
              <p className="text-xs text-slate-400">GET/POST /admin/billing/invoices</p>
            </div>
            <button
              onClick={() => setIsCreateInvoiceModalOpen(true)}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Terbitkan Faktur Baru</span>
            </button>
          </div>

          <HonestErrorBanner
            error={invoicesError}
            onRetry={fetchInvoices}
            isRetrying={isInvoicesLoading}
            title="Telemetri Faktur / Invoices Lintas-Tenant"
          />

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Tenant ID</th>
                  <th className="py-3 px-4">Deskripsi</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-4">Status Pembayaran</th>
                  <th className="py-3 px-4">Tanggal Terbit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      {isInvoicesLoading ? 'Memuat faktur...' : 'Belum ada data faktur terbit.'}
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-400">{inv.invoiceNumber || inv.id}</td>
                      <td className="py-3 px-4 font-mono text-white">{inv.tenantId}</td>
                      <td className="py-3 px-4 text-slate-300">{inv.description || 'Commercial Invoice'}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400 font-bold">
                        Rp {(inv.amount || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {inv.status || 'PAID'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('id-ID') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Transactions Analytics */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Platform Transactions Analytics</h3>
              <p className="text-xs text-slate-400">GET/POST /admin/analytics/transactions</p>
            </div>
            <button
              onClick={fetchTransactions}
              disabled={isTxLoading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center space-x-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTxLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <HonestErrorBanner
            error={txError}
            onRetry={fetchTransactions}
            isRetrying={isTxLoading}
            title="Telemetri Transaksi Finansial Platform"
          />

          {transactions && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 font-mono text-xs text-slate-300 overflow-x-auto">
              <pre className="text-emerald-400">{JSON.stringify(transactions, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Revenue Intelligence */}
      {activeTab === 'revenue_intelligence' && (
        <div className="space-y-6">
          <HonestErrorBanner
            error={revenueError}
            onRetry={fetchRevenueData}
            isRetrying={isRevenueLoading}
            title="Telemetri Sales & Revenue Intelligence"
          />

          {revenueData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                <span className="text-xs font-semibold text-slate-400">Pipeline Nilai Prospek</span>
                <div className="text-2xl font-bold text-emerald-400 tracking-tight mt-1 font-mono">
                  Rp {(revenueData.totalPipelineValueIdr || 0).toLocaleString('id-ID')}
                </div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                <span className="text-xs font-semibold text-slate-400">AI Influenced Revenue</span>
                <div className="text-2xl font-bold text-cyan-400 tracking-tight mt-1 font-mono">
                  Rp {(revenueData.aiInfluencedRevenueIdr || 0).toLocaleString('id-ID')}
                </div>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                <span className="text-xs font-semibold text-slate-400">Win Rate Konversi</span>
                <div className="text-2xl font-bold text-indigo-400 tracking-tight mt-1 font-mono">
                  {revenueData.overallWinRatePercentage || 0}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: Lead Pipeline */}
      {activeTab === 'lead_pipeline' && (
        <div className="space-y-6">
          <HonestErrorBanner
            error={pipelineError}
            onRetry={fetchPipelineData}
            isRetrying={isPipelineLoading}
            title="Telemetri Lead Pipeline Funnel"
          />

          {pipelineData && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-cyan-400" />
                <span>Kecepatan Pipeline Prospek Lintas Tenant</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3 text-right">Total Lead</th>
                      <th className="px-4 py-3 text-right">MQL → SQL Konversi</th>
                      <th className="px-4 py-3 text-right">Avg Hari Penutupan</th>
                      <th className="px-4 py-3 text-center">Status Kesehatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {pipelineData.tenantPipelineVelocity?.map((org, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 font-semibold text-white">
                          <div>{org.tenantName}</div>
                          <span className="text-[10px] text-slate-500 font-mono">{org.tenantId}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">
                          {org.totalLeads.toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">
                          {org.mqlToSqlRate}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-cyan-400">
                          {org.avgCloseDays} Hari
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {org.pipelineHealth}
                          </span>
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

      {/* Modal Buat Subscription */}
      {isCreateSubModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Buat Langganan Tenant</h3>
              <button onClick={() => setIsCreateSubModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubscription} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Tenant ID</label>
                <input
                  type="text"
                  required
                  value={subFormData.tenantId}
                  onChange={(e) => setSubFormData({ ...subFormData, tenantId: e.target.value })}
                  placeholder="e.g. tenant-techcorp"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Plan Code</label>
                <select
                  value={subFormData.planCode}
                  onChange={(e) => setSubFormData({ ...subFormData, planCode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Billing Interval</label>
                <select
                  value={subFormData.billingInterval}
                  onChange={(e) => setSubFormData({ ...subFormData, billingInterval: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateSubModalOpen(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition"
                >
                  Simpan Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Terbitkan Invoice */}
      {isCreateInvoiceModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Terbitkan Faktur Tagihan</h3>
              <button onClick={() => setIsCreateInvoiceModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateInvoice} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Tenant ID</label>
                <input
                  type="text"
                  required
                  value={invoiceFormData.tenantId}
                  onChange={(e) => setInvoiceFormData({ ...invoiceFormData, tenantId: e.target.value })}
                  placeholder="e.g. tenant-techcorp"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Nominal (IDR)</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={invoiceFormData.amount}
                  onChange={(e) => setInvoiceFormData({ ...invoiceFormData, amount: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Deskripsi Faktur</label>
                <input
                  type="text"
                  required
                  value={invoiceFormData.description}
                  onChange={(e) => setInvoiceFormData({ ...invoiceFormData, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateInvoiceModalOpen(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition"
                >
                  Terbitkan Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
