'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Bot,
  RotateCcw,
  Cpu,
  RefreshCw,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  X,
  CreditCard,
  Building2,
  Calendar,
  Layers,
  Sparkles,
  BarChart3,
  PieChart as PieIcon,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';
import {
  PlatformAnalyticsOverviewResponse,
  TenantRankingItem,
  LLMUsageBreakdownResponse,
} from '../types';

export interface PlatformAnalyticsHubScreenProps {
  apiBaseUrl?: string;
}

export function PlatformAnalyticsHubScreen({ apiBaseUrl = '' }: PlatformAnalyticsHubScreenProps) {
  // Global filter state
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [chartView, setChartView] = useState<'revenue-transactions' | 'tenant-growth' | 'credit-liquidity'>('revenue-transactions');

  // Loading & error states
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [loadingTenants, setLoadingTenants] = useState<boolean>(true);
  const [loadingLlm, setLoadingLlm] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<PlatformAnalyticsOverviewResponse | null>(null);
  const [tenants, setTenants] = useState<TenantRankingItem[]>([]);
  const [tenantSortBy, setTenantSortBy] = useState<'revenue' | 'credit_usage' | 'staff_count' | 'ai_agent_count' | 'transaction_count'>('revenue');
  const [tenantSortOrder, setTenantSortOrder] = useState<'desc' | 'asc'>('desc');
  const [tenantSearch, setTenantSearch] = useState<string>('');

  // LLM panel state
  const [llmGroupBy, setLlmGroupBy] = useState<'provider' | 'model' | 'tenant'>('provider');
  const [llmData, setLlmData] = useState<LLMUsageBreakdownResponse | null>(null);

  // Drill-down Modal state
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantDetail, setTenantDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Real-time live status
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [lastLivePulse, setLastLivePulse] = useState<string>('');

  // Fetch Overview Data
  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    setErrorMsg(null);
    try {
      let url = `${apiBaseUrl}/api/v1/admin/analytics/overview?range=${dateRange}`;
      if (dateRange === 'custom' && customStart && customEnd) {
        url += `&start_date=${customStart}&end_date=${customEnd}`;
      }
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('orchestree_admin_token') || localStorage.getItem('sb-access-token')
        : null;

      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'PLATFORM_SUPERADMIN',
          'X-User-Capabilities': 'admin.analytics.view,platform.admin.manage',
          'X-MFA-Verified': 'true',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        throw new Error(`Gagal memuat ringkasan analitik (${res.status})`);
      }
      const json = await res.json();
      setOverview(json);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kendala saat memuat data analitik.');
    } finally {
      setLoadingOverview(false);
    }
  }, [apiBaseUrl, dateRange, customStart, customEnd]);

  // Fetch Tenant Rankings
  const fetchTenants = useCallback(async () => {
    setLoadingTenants(true);
    try {
      const url = `${apiBaseUrl}/api/v1/admin/analytics/tenants?sort_by=${tenantSortBy}&order=${tenantSortOrder}&limit=50`;
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('orchestree_admin_token') || localStorage.getItem('sb-access-token')
        : null;

      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'PLATFORM_SUPERADMIN',
          'X-User-Capabilities': 'admin.analytics.view,platform.admin.manage',
          'X-MFA-Verified': 'true',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const json = await res.json();
        setTenants(json.tenants || []);
      }
    } catch {
      // Ditangani oleh state lokal
    } finally {
      setLoadingTenants(false);
    }
  }, [apiBaseUrl, tenantSortBy, tenantSortOrder]);

  // Fetch LLM Usage Breakdown
  const fetchLlmUsage = useCallback(async () => {
    setLoadingLlm(true);
    try {
      const url = `${apiBaseUrl}/api/v1/admin/analytics/llm-usage?groupBy=${llmGroupBy}&range=${dateRange}`;
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('orchestree_admin_token') || localStorage.getItem('sb-access-token')
        : null;

      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'PLATFORM_SUPERADMIN',
          'X-User-Capabilities': 'admin.analytics.view,platform.admin.manage',
          'X-MFA-Verified': 'true',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const json = await res.json();
        setLlmData(json);
      }
    } catch {
      // Ditangani oleh state lokal
    } finally {
      setLoadingLlm(false);
    }
  }, [apiBaseUrl, llmGroupBy, dateRange]);

  // Drill-down Tenant Detail Fetch
  const openTenantDetail = async (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setLoadingDetail(true);
    try {
      const url = `${apiBaseUrl}/api/v1/admin/analytics/tenants/${tenantId}/detail`;
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('orchestree_admin_token') || localStorage.getItem('sb-access-token')
        : null;

      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'PLATFORM_SUPERADMIN',
          'X-User-Capabilities': 'admin.analytics.view,platform.admin.manage',
          'X-MFA-Verified': 'true',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const json = await res.json();
        setTenantDetail(json);
      }
    } catch {
      // Ditangani oleh dialog detail
    } finally {
      setLoadingDetail(false);
    }
  };

  // Trigger manual Rollup recalculation
  const handleRefreshRollup = async () => {
    setIsRefreshing(true);
    try {
      const url = `${apiBaseUrl}/api/v1/admin/analytics/rollup/refresh`;
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('orchestree_admin_token') || localStorage.getItem('sb-access-token')
        : null;

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'PLATFORM_SUPERADMIN',
          'X-User-Capabilities': 'admin.analytics.manage,platform.admin.manage',
          'X-MFA-Verified': 'true',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({})
      });
      await Promise.all([fetchOverview(), fetchTenants(), fetchLlmUsage()]);
    } catch {
      // Ditangani oleh penyegaran
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load & filter trigger
  useEffect(() => {
    fetchOverview();
    fetchTenants();
    fetchLlmUsage();
  }, [fetchOverview, fetchTenants, fetchLlmUsage]);

  // WebSocket Live Analytics Listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/v1/admin/analytics/live`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setIsLiveConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'analytics_heartbeat' && payload.timestamp) {
            setLastLivePulse(new Date(payload.timestamp).toLocaleTimeString('id-ID'));
            if (payload.kpi && overview) {
              setOverview((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  kpi: {
                    ...prev.kpi,
                    total_transactions: payload.kpi.total_transactions ?? prev.kpi.total_transactions,
                    total_revenue_idr: payload.kpi.total_revenue_idr ?? prev.kpi.total_revenue_idr,
                  }
                };
              });
            }
          }
        } catch {
          // Abaikan parsing tak valid
        }
      };
      ws.onclose = () => {
        setIsLiveConnected(false);
      };
      ws.onerror = () => {
        setIsLiveConnected(false);
      };
    } catch {
      setIsLiveConnected(false);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [overview]);

  // Filtered tenants for table search
  const filteredTenants = useMemo(() => {
    if (!tenantSearch.trim()) return tenants;
    const q = tenantSearch.toLowerCase();
    return tenants.filter(
      (t) =>
        t.display_name.toLowerCase().includes(q) ||
        t.legal_name.toLowerCase().includes(q) ||
        t.plan_code.toLowerCase().includes(q)
    );
  }, [tenants, tenantSearch]);

  // Format helpers
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const formatUSD = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(val || 0);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('id-ID').format(val || 0);
  };

  // Color constants
  const PIE_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];

  return (
    <div className="space-y-6">
      {/* Header & Global Time Range Controls */}
      <div className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-blue-950/70 text-blue-300 border border-blue-800/60">
                Pusat Analisis & Audit Platform
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="flex items-center gap-1.5 text-xs font-mono">
                <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className={isLiveConnected ? 'text-emerald-400' : 'text-slate-400'}>
                  {isLiveConnected ? `Kanal Langsung Aktif (${lastLivePulse || 'Live'})` : 'Pembaruan Terjadwal'}
                </span>
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Metrik Kinerja & Pertumbuhan Organisasi</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Visualisasi waktu-nyata atas transaksi bisnis, konsumsi likuiditas kredit, adopsi pekerja AI, dan audit pengeluaran model komputasi.
            </p>
          </div>

          {/* Time Range Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5 bg-slate-900/90 p-2 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-1">
              {(['7d', '30d', '90d', 'custom'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    dateRange === r
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {r === '7d' && '7 Hari'}
                  {r === '30d' && '30 Hari'}
                  {r === '90d' && '90 Hari'}
                  {r === 'custom' && 'Rentang Khusus'}
                </button>
              ))}
            </div>

            {dateRange === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs text-slate-300 pl-1 border-l border-slate-800">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <span>—</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleRefreshRollup}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
              title="Perbarui komputasi rollup dari database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden sm:inline">Segarkan</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1. Baris KPI Utama (Kartu Angka Besar + Sparkline Mini Recharts) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Transaksi */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 hover:border-slate-700 transition relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Transaksi</span>
              <div className="w-8 h-8 rounded-xl bg-blue-950/60 border border-blue-800/50 flex items-center justify-center text-blue-400">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              {loadingOverview ? (
                <SkeletonLoader width="100px" height="32px" />
              ) : (
                formatNumber(overview?.kpi.total_transactions || 0)
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium mt-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Pesanan komersial & invoice lunas</span>
            </div>
          </div>
          {/* Mini Sparkline */}
          <div className="h-10 mt-3">
            {overview?.sparklines.transactions && overview.sparklines.transactions.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.sparklines.transactions.map((v, i) => ({ i, v }))}>
                  <Line type="monotone" dataKey="v" stroke="#3B82F6" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* KPI 2: Total Pendapatan */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 hover:border-slate-700 transition relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Pendapatan</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white tracking-tight truncate">
              {loadingOverview ? (
                <SkeletonLoader width="120px" height="32px" />
              ) : (
                formatIDR(overview?.kpi.total_revenue_idr || 0)
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-1">
              <span>Akumulasi nominal transaksi sah</span>
            </div>
          </div>
          {/* Mini Sparkline */}
          <div className="h-10 mt-3">
            {overview?.sparklines.revenue && overview.sparklines.revenue.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview.sparklines.revenue.map((v, i) => ({ i, v }))}>
                  <Area type="monotone" dataKey="v" stroke="#10B981" fill="#10B981" fillOpacity={0.2} isAnimationActive={true} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* KPI 3: Jumlah Tenant (Total, Aktif, Trial) */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 hover:border-slate-700 transition relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Organisasi Tenant</span>
              <div className="w-8 h-8 rounded-xl bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-400">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-2">
              {loadingOverview ? (
                <SkeletonLoader width="80px" height="32px" />
              ) : (
                <>
                  <span>{formatNumber(overview?.kpi.tenants.total || 0)}</span>
                  <span className="text-xs font-normal text-slate-400">Total</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
              <span className="text-emerald-400 font-semibold">{overview?.kpi.tenants.active || 0} Aktif</span>
              <span>•</span>
              <span className="text-amber-400 font-semibold">{overview?.kpi.tenants.trial || 0} Uji Coba</span>
            </div>
          </div>
          {/* Mini Sparkline */}
          <div className="h-10 mt-3">
            {overview?.sparklines.tenants && overview.sparklines.tenants.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.sparklines.tenants.map((v, i) => ({ i, v }))}>
                  <Line type="monotone" dataKey="v" stroke="#8B5CF6" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* KPI 4: Staf Manusia & AI Agent */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 hover:border-slate-700 transition relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Kolaborasi Tenaga Kerja</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-3">
              {loadingOverview ? (
                <SkeletonLoader width="110px" height="32px" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-sky-400 inline" />
                    <span>{formatNumber(overview?.kpi.total_human_staff || 0)}</span>
                  </div>
                  <span className="text-slate-600">/</span>
                  <div className="flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-purple-400 inline" />
                    <span>{formatNumber(overview?.kpi.total_ai_agents_active || 0)}</span>
                  </div>
                </>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span>Rasio Staf Manusia terhadap Agen AI Aktif</span>
            </div>
          </div>
          {/* Mini Sparkline */}
          <div className="h-10 mt-3">
            {overview?.sparklines.ai_agents && overview.sparklines.ai_agents.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.sparklines.ai_agents.map((v, i) => ({ i, v }))}>
                  <Line type="monotone" dataKey="v" stroke="#A78BFA" strokeWidth={2} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Sub Baris KPI Sekunder: Repeat Orders, Total Biaya LLM, Kredit Terpakai */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-950/50 border border-amber-800/40 flex items-center justify-center text-amber-400">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Pesanan Berulang (Repeat Orders)</div>
              <div className="text-lg font-bold text-white">
                {formatNumber(overview?.kpi.total_repeat_orders || 0)}
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono">
            {overview?.kpi.total_transactions && overview.kpi.total_transactions > 0
              ? `${Math.round(((overview.kpi.total_repeat_orders || 0) / overview.kpi.total_transactions) * 100)}% Rasio`
              : '0% Rasio'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-950/50 border border-rose-800/40 flex items-center justify-center text-rose-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Biaya Komputasi Model AI (Riil)</div>
              <div className="text-lg font-bold text-white">
                {formatUSD(overview?.kpi.total_llm_cost_usd || 0)}
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            NVIDIA, OpenRouter, Gemini
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-950/50 border border-teal-800/40 flex items-center justify-center text-teal-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Kredit Terpakai (Seluruh Tenant)</div>
              <div className="text-lg font-bold text-white">
                {formatNumber(Math.round(overview?.kpi.total_credit_consumed || 0))} Poin
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-teal-400 font-mono">
            Metered Usage
          </div>
        </div>
      </div>

      {/* 2. Chart Tren Interaktif dengan Tab Switcher */}
      <div className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span>Analisis Tren & Proyeksi Operasional</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Grafik interaktif beranimasi berdasarkan agregasi harian terverifikasi di database.
            </p>
          </div>

          <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setChartView('revenue-transactions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                chartView === 'revenue-transactions'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pendapatan & Transaksi
            </button>
            <button
              type="button"
              onClick={() => setChartView('tenant-growth')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                chartView === 'tenant-growth'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pertumbuhan Organisasi
            </button>
            <button
              type="button"
              onClick={() => setChartView('credit-liquidity')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                chartView === 'credit-liquidity'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Likuiditas Kredit
            </button>
          </div>
        </div>

        {/* Area Grafik */}
        <div className="h-80 w-full pt-2">
          {loadingOverview ? (
            <div className="h-full flex items-center justify-center">
              <SkeletonLoader width="100%" height="100%" />
            </div>
          ) : !overview?.time_series || overview.time_series.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                id="empty-analytics-chart"
                icon={Calendar}
                title="Belum Ada Data Rollup untuk Rentang Ini"
                description="Lakukan penyegaran komputasi rollup untuk mengompilasi data transaksi mentah ke tabel agregasi harian."
                actionLabel="Segarkan Rollup Sekarang"
                onAction={handleRefreshRollup}
              />
            </div>
          ) : chartView === 'revenue-transactions' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview.time_series} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  stroke="#64748B"
                  fontSize={11}
                  tickFormatter={(v) => `Rp${(v / 1000000).toFixed(1)}jt`}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                  formatter={(val: any, name: any) => {
                    if (name === 'Pendapatan (IDR)') return [formatIDR(Number(val)), name];
                    return [val, name];
                  }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue_idr"
                  name="Pendapatan (IDR)"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#10B981' }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={true}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="transactions"
                  name="Jumlah Transaksi"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3B82F6' }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : chartView === 'tenant-growth' ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview.time_series} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="total_tenants"
                  name="Total Organisasi"
                  stroke="#8B5CF6"
                  fill="#8B5CF6"
                  fillOpacity={0.15}
                  isAnimationActive={true}
                />
                <Area
                  type="monotone"
                  dataKey="active_tenants"
                  name="Organisasi Aktif"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.25}
                  isAnimationActive={true}
                />
                <Area
                  type="monotone"
                  dataKey="trial_tenants"
                  name="Masa Uji Coba"
                  stroke="#F59E0B"
                  fill="#F59E0B"
                  fillOpacity={0.2}
                  isAnimationActive={true}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={tenants.slice(0, 10).map((t) => ({
                  name: t.display_name.length > 14 ? `${t.display_name.substring(0, 12)}...` : t.display_name,
                  credit_consumed: t.credit_consumed,
                  credit_available: t.credit_available,
                }))}
                margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} angle={-15} textAnchor="end" />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                  formatter={(val: any, name: any) => [`${formatNumber(Number(val))} Poin`, name]}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="credit_consumed" name="Kredit Terpakai" fill="#EC4899" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                <Bar dataKey="credit_available" name="Kredit Tersedia (Saldo)" fill="#06B6D4" radius={[4, 4, 0, 0]} isAnimationActive={true} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 3. Tabel Ranking Tenant (Sortable & Drill-down) */}
      <div className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              <span>Peringkat Organisasi Tenant</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Urutan organisasi berdasarkan kinerja pendapatan, alokasi kredit, dan pemanfaatan tenaga kerja. Klik baris untuk audit mendalam.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                aria-label="Cari organisasi"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 w-48 sm:w-56"
              />
            </div>

            <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
              {(
                [
                  { id: 'revenue', label: 'Pendapatan' },
                  { id: 'credit_usage', label: 'Kredit' },
                  { id: 'staff_count', label: 'Staf' },
                  { id: 'ai_agent_count', label: 'Agen AI' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (tenantSortBy === s.id) {
                      setTenantSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
                    } else {
                      setTenantSortBy(s.id);
                      setTenantSortOrder('desc');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    tenantSortBy === s.id
                      ? 'bg-purple-950/80 text-purple-200 border border-purple-800/60'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label} {tenantSortBy === s.id && (tenantSortOrder === 'desc' ? '↓' : '↑')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabel Data Tenant */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Organisasi</th>
                <th className="py-3 px-4">Status & Paket</th>
                <th className="py-3 px-4 text-right">Transaksi</th>
                <th className="py-3 px-4 text-right">Pendapatan</th>
                <th className="py-3 px-4 text-right">Kredit Terpakai</th>
                <th className="py-3 px-4 text-right">Saldo Tersedia</th>
                <th className="py-3 px-4 text-center">Staf Manusia</th>
                <th className="py-3 px-4 text-center">Agen AI</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loadingTenants ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    <SkeletonLoader width="100%" height="160px" />
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <EmptyState
                      id="empty-tenant-ranking"
                      icon={Building2}
                      title="Tidak Ada Organisasi yang Ditemukan"
                      description="Data organisasi belum tersedia atau tidak cocok dengan filter pencarian saat ini."
                    />
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => (
                  <tr
                    key={t.tenant_id}
                    onClick={() => openTenantDetail(t.tenant_id)}
                    className="hover:bg-slate-900/50 transition cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                        {t.display_name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{t.legal_name}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            t.status === 'active'
                              ? 'bg-emerald-400'
                              : t.status === 'trial'
                              ? 'bg-amber-400'
                              : 'bg-slate-500'
                          }`}
                        />
                        <span className="capitalize font-medium text-slate-300">{t.status}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                          {t.plan_code}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-white">
                      {formatNumber(t.transaction_count)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      {formatIDR(t.revenue_idr)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-rose-300">
                      {formatNumber(Math.round(t.credit_consumed))}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-cyan-300">
                      {formatNumber(Math.round(t.credit_available))}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-sky-400">
                      {t.active_human_staff_count}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-purple-400">
                      {t.active_ai_agent_count}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 group-hover:text-blue-400 font-medium">
                        Audit <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Panel Biaya LLM (Breakdown Provider/Model & Analisis Margin Bisnis) */}
      <div className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>Audit Pengeluaran Komputasi Model AI & Margin Bisnis</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Rincian biaya aktual yang dibayarkan ke penyedia LLM (NVIDIA NIM, OpenRouter, Gemini, GPT-Image-2) guna memantau profitabilitas.
            </p>
          </div>

          <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
            {(
              [
                { id: 'provider', label: 'Per Penyedia' },
                { id: 'model', label: 'Per Model AI' },
                { id: 'tenant', label: 'Per Organisasi' },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setLlmGroupBy(g.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  llmGroupBy === g.id
                    ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-800/60 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
          {/* Donut Chart Recharts */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center">
            <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Distribusi Biaya Komputasi
            </div>
            <div className="h-60 w-full">
              {loadingLlm ? (
                <div className="h-full flex items-center justify-center">
                  <SkeletonLoader width="180px" height="180px" />
                </div>
              ) : !llmData?.breakdown || llmData.breakdown.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Belum ada log penggunaan LLM tercatat
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={llmData.breakdown}
                      dataKey="cost_usd"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      isAnimationActive={true}
                    >
                      {llmData.breakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                      formatter={(val: any) => [formatUSD(Number(val)), 'Biaya']}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tabel Detail LLM Breakdown */}
          <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Nama Sumber</th>
                  <th className="py-3 px-4 text-right">Panggilan API</th>
                  <th className="py-3 px-4 text-right">Total Token</th>
                  <th className="py-3 px-4 text-right">Latensi Rata-rata</th>
                  <th className="py-3 px-4 text-right">Total Biaya (USD)</th>
                  <th className="py-3 px-4 text-right">Porsi (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {loadingLlm ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center">
                      <SkeletonLoader width="100%" height="120px" />
                    </td>
                  </tr>
                ) : !llmData?.breakdown || llmData.breakdown.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      Tidak ada data penggunaan model untuk rentang tanggal terpilih.
                    </td>
                  </tr>
                ) : (
                  llmData.breakdown.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-4 font-semibold text-white flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span>{item.name}</span>
                        {item.provider && item.provider !== item.name && (
                          <span className="text-[10px] text-slate-500 font-mono">({item.provider})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatNumber(item.call_count)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-400">{formatNumber(item.token_count)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-400">{item.avg_latency_ms} ms</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-400">
                        {formatUSD(item.cost_usd)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-emerald-400 font-semibold">
                        {item.percentage}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. Modal Drill-down Detail Satu Organisasi Tenant */}
      {selectedTenantId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0B1220] border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            <button
              type="button"
              onClick={() => setSelectedTenantId(null)}
              className="absolute top-6 right-6 p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            {loadingDetail ? (
              <div className="py-16 text-center space-y-3">
                <SkeletonLoader width="60%" height="32px" />
                <SkeletonLoader width="100%" height="200px" />
              </div>
            ) : !tenantDetail || tenantDetail.error ? (
              <div className="py-12">
                <EmptyState
                  id="error-detail-modal"
                  icon={AlertCircle}
                  title="Gagal Mengambil Detail Organisasi"
                  description={tenantDetail?.error || 'Data detail organisasi tidak dapat ditampilkan saat ini.'}
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header Modal */}
                <div className="border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/60">
                      Audit Organisasi
                    </span>
                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs text-slate-400 font-mono">ID: {tenantDetail.tenant.id}</span>
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {tenantDetail.tenant.display_name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Nama Legal: {tenantDetail.tenant.legal_name} | Paket: {tenantDetail.tenant.plan_name} ({tenantDetail.tenant.plan_code})
                  </p>
                </div>

                {/* Saldo Kredit Dompet */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">Saldo Kredit Tersedia</div>
                    <div className="text-xl font-black text-cyan-400 font-mono mt-1">
                      {formatNumber(Math.round(tenantDetail.tenant.credit_balance))} Poin
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">Kredit Dalam Reservasi Transaksi</div>
                    <div className="text-xl font-black text-amber-400 font-mono mt-1">
                      {formatNumber(Math.round(tenantDetail.tenant.credit_reserved))} Poin
                    </div>
                  </div>
                </div>

                {/* AI Agents & Staff Human Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Agen AI */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5 uppercase font-mono">
                      <Bot className="w-3.5 h-3.5" />
                      <span>Agen AI Aktif per Jabatan Utama</span>
                    </div>
                    {tenantDetail.ai_agent_breakdown.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3">Belum ada agen AI aktif terdaftar.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {tenantDetail.ai_agent_breakdown.map((ag: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                            <span className="text-slate-300">{ag.job_title}</span>
                            <span className="font-mono text-purple-400 font-bold">{ag.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Staf Manusia */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5 uppercase font-mono">
                      <Users className="w-3.5 h-3.5" />
                      <span>Staf Manusia per Departemen</span>
                    </div>
                    {tenantDetail.human_staff_breakdown.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3">Belum ada anggota staf manusia terdaftar.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {tenantDetail.human_staff_breakdown.map((st: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                            <span className="text-slate-300">{st.department}</span>
                            <span className="font-mono text-sky-400 font-bold">{st.count} Staf</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Histori Transaksi Terbaru */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-white uppercase font-mono">
                    Histori Transaksi Terbaru (Pesanan Komersial & Invoice)
                  </div>
                  {tenantDetail.transactions.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3">Belum ada catatan transaksi untuk organisasi ini.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 font-mono text-[11px]">
                          <tr>
                            <th className="py-2.5 px-3">Nomor Referensi</th>
                            <th className="py-2.5 px-3">Jenis</th>
                            <th className="py-2.5 px-3 text-right">Nominal</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                            <th className="py-2.5 px-3 text-right">Tanggal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {tenantDetail.transactions.map((tr: any) => (
                            <tr key={tr.id}>
                              <td className="py-2 px-3 font-mono font-medium text-white">{tr.reference}</td>
                              <td className="py-2 px-3 text-slate-400">{tr.type}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                                {formatIDR(tr.amount)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                                  {tr.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right text-slate-400 font-mono text-[11px]">
                                {new Date(tr.date).toLocaleDateString('id-ID')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
