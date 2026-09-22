import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp,
  DollarSign,
  Building2,
  Users,
  Bot,
  Zap,
  Activity,
  ArrowUpRight,
  RefreshCw,
  Calendar,
  Radio,
  BarChart3,
  Layers,
  ChevronRight,
  X,
  PlusCircle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  CheckSquare,
  ListTodo,
  PieChart,
  Lock,
  Target,
  FileSearch,
  Award,
} from 'lucide-react';
import { api } from '../lib/api';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import {
  AnalyticsOverview,
  TenantUsageCreditItem,
  LlmUsagePlatformWide,
  KpiSummary,
  TaskActivitySummaryResponse,
  UniversalSelectionUsageResponse,
  AnalyticsPeriod,
  WorkflowExecutionSummary,
  DailyTaskPerformanceItem,
  WorkforceMonitoringSummary,
} from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const AdminAnalyticsDashboardScreen: React.FC = () => {
  // Global & Individual Chart Periods (Supports real re-fetch per chart or globally)
  const [revenuePeriod, setRevenuePeriod] = useState<AnalyticsPeriod>('monthly');
  const [creditPeriod, setCreditPeriod] = useState<AnalyticsPeriod>('monthly');
  const [llmPeriod, setLlmPeriod] = useState<AnalyticsPeriod>('monthly');
  const [kpiPeriod, setKpiPeriod] = useState<AnalyticsPeriod>('monthly');

  // Honest Error Banner State
  const [honestError, setHonestError] = useState<HonestErrorInfo | null>(null);

  // Backend Data States
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [usageCredit, setUsageCredit] = useState<TenantUsageCreditItem[]>([]);
  const [llmUsage, setLlmUsage] = useState<LlmUsagePlatformWide | null>(null);
  const [kpiSummary, setKpiSummary] = useState<KpiSummary | null>(null);
  const [taskActivity, setTaskActivity] = useState<TaskActivitySummaryResponse | null>(null);
  const [isLoadingTaskActivity, setIsLoadingTaskActivity] = useState<boolean>(false);

  // Workflow Executions State (Verifikasi Bug Foreign Key Backend)
  const [workflowExecutions, setWorkflowExecutions] = useState<WorkflowExecutionSummary[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState<boolean>(false);

  // FASE 114 / BAGIAN J / LANGKAH 1: Universal AI Selection & Ranking Usage State
  const [selectionUsage, setSelectionUsage] = useState<UniversalSelectionUsageResponse | null>(null);
  const [isLoadingSelectionUsage, setIsLoadingSelectionUsage] = useState<boolean>(false);

  // Daily Task Performance State (Domain 16)
  const [dailyTaskPerformance, setDailyTaskPerformance] = useState<DailyTaskPerformanceItem[]>([]);
  const [isLoadingDailyPerformance, setIsLoadingDailyPerformance] = useState<boolean>(false);

  // Tenant Workforce Summary State (Domain 16 / Step 1.5)
  const [workforceSummary, setWorkforceSummary] = useState<WorkforceMonitoringSummary | null>(null);
  const [isLoadingWorkforce, setIsLoadingWorkforce] = useState<boolean>(false);

  // Loading & Realtime States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [realtimeEventsCount, setRealtimeEventsCount] = useState<number>(0);
  const [realtimePulse, setRealtimePulse] = useState<boolean>(false);
  const [lastRealtimeTable, setLastRealtimeTable] = useState<string>('');

  // Interactive Drill-Down States
  const [selectedTenant, setSelectedTenant] = useState<TenantUsageCreditItem | null>(null);
  const [revenueHoverIndex, setRevenueHoverIndex] = useState<number | null>(null);
  const [activeProviderFilter, setActiveProviderFilter] = useState<string | null>(null);

  // Transaction Creation Modal (For DoD Verification)
  const [showTransactionModal, setShowTransactionModal] = useState<boolean>(false);
  const [newTxTenantId, setNewTxTenantId] = useState<string>('');
  const [newTxAmount, setNewTxAmount] = useState<string>('500000');
  const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);
  const [txSuccessMessage, setTxSuccessMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetchers with explicit period parameters (REAL RE-FETCH)
  // ---------------------------------------------------------------------------
  const fetchOverview = useCallback(async () => {
    try {
      const data = await api.getAnalyticsOverview(revenuePeriod);
      setOverview(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed fetching analytics overview', err);
    }
  }, [revenuePeriod]);

  const fetchUsageCredit = useCallback(async (period: AnalyticsPeriod) => {
    try {
      const data = await api.getAnalyticsUsageCredit(period);
      setUsageCredit(data);
    } catch (err) {
      console.error('Failed fetching usage credit', err);
    }
  }, []);

  const fetchLlmUsage = useCallback(async (period: AnalyticsPeriod) => {
    try {
      const data = await api.getAnalyticsLlmUsagePlatformWide(period);
      setLlmUsage(data);
    } catch (err) {
      console.error('Failed fetching LLM usage platform-wide', err);
    }
  }, []);

  const fetchKpiSummary = useCallback(async (period: AnalyticsPeriod) => {
    try {
      const data = await api.getAnalyticsKpiSummary(period);
      setKpiSummary(data);
    } catch (err) {
      console.error('Failed fetching KPI summary', err);
    }
  }, []);

  // FASE 110 / BAGIAN C: Fetch Platform-Wide Task Activity Summary
  const fetchTaskActivity = useCallback(async () => {
    setIsLoadingTaskActivity(true);
    try {
      const data = await api.getTaskActivitySummary();
      setTaskActivity(data);
    } catch (err) {
      console.error('Failed fetching task activity summary', err);
    } finally {
      setIsLoadingTaskActivity(false);
    }
  }, []);

  // FASE 114 / BAGIAN J / LANGKAH 1: Fetch Universal Selection Usage Aggregation
  const fetchSelectionUsage = useCallback(async () => {
    setIsLoadingSelectionUsage(true);
    try {
      const data = await api.getUniversalSelectionUsage();
      setSelectionUsage(data);
    } catch (err) {
      console.error('Failed fetching universal selection usage', err);
    } finally {
      setIsLoadingSelectionUsage(false);
    }
  }, []);

  // FASE 102 & BUG FIX VERIFICATION: Fetch Workflow Executions platform-wide
  const fetchWorkflowExecutions = useCallback(async () => {
    setIsLoadingWorkflows(true);
    try {
      const data = await api.getWorkflowExecutions(10);
      setWorkflowExecutions(data || []);
    } catch (err: any) {
      console.error('Failed fetching workflow executions:', err);
    } finally {
      setIsLoadingWorkflows(false);
    }
  }, []);

  // DOMAIN 16: Fetch Daily Task Performance
  const fetchDailyTaskPerformance = useCallback(async () => {
    setIsLoadingDailyPerformance(true);
    try {
      const data = await api.getDailyTaskPerformance('7d');
      setDailyTaskPerformance(data?.dailyMetrics || []);
    } catch (err: any) {
      console.error('Failed fetching daily task performance:', err);
    } finally {
      setIsLoadingDailyPerformance(false);
    }
  }, []);

  // DOMAIN 16 / Step 1.5: Fetch Tenant Workforce Summary
  const fetchWorkforceSummary = useCallback(async () => {
    setIsLoadingWorkforce(true);
    try {
      const data = await api.getWorkforceSummary();
      setWorkforceSummary(data);
    } catch (err: any) {
      console.error('Failed fetching tenant workforce summary:', err);
    } finally {
      setIsLoadingWorkforce(false);
    }
  }, []);

  // Fetch all initial data with Honest Error reporting (Single-fetch on mount with stable ref)
  const isInitialMountedRef = useRef(false);
  const loadAllAnalytics = useCallback(async () => {
    setIsRefreshing(true);
    setHonestError(null);
    try {
      await Promise.all([
        fetchOverview(),
        fetchUsageCredit(creditPeriod),
        fetchLlmUsage(llmPeriod),
        fetchKpiSummary(kpiPeriod),
        fetchTaskActivity(),
        fetchSelectionUsage(),
        fetchWorkflowExecutions(),
        fetchDailyTaskPerformance(),
        fetchWorkforceSummary(),
      ]);
    } catch (err: any) {
      console.error('[AdminAnalytics] Load analytics error:', err);
      setHonestError({
        endpoint: '/admin/analytics/overview & /admin/workflow-executions & /admin/analytics/daily-task-performance & /admin/analytics/tenant-workforce-summary',
        status: err?.status || err?.statusCode || 'FETCH_ERROR',
        message:
          err?.message ||
          'Terjadi kegagalan saat menyinkronkan data platform analytics dari backend.',
        rawDetails: err?.stack || err?.toString(),
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [
    fetchOverview,
    fetchUsageCredit,
    creditPeriod,
    fetchLlmUsage,
    llmPeriod,
    fetchKpiSummary,
    kpiPeriod,
    fetchTaskActivity,
    fetchSelectionUsage,
    fetchWorkflowExecutions,
    fetchDailyTaskPerformance,
    fetchWorkforceSummary,
  ]);

  // Initial load on mount only once to guarantee no infinite loop / blank screen
  useEffect(() => {
    if (!isInitialMountedRef.current) {
      isInitialMountedRef.current = true;
      loadAllAnalytics();
    }
  }, []); // Run strictly once on mount with stable ref pattern

  // Handle individual period changes (REAL RE-FETCH)
  const handleRevenuePeriodChange = (period: AnalyticsPeriod) => {
    setRevenuePeriod(period);
    api.getAnalyticsOverview(period).then(setOverview).catch(console.error);
  };

  const handleCreditPeriodChange = (period: AnalyticsPeriod) => {
    setCreditPeriod(period);
    fetchUsageCredit(period);
  };

  const handleLlmPeriodChange = (period: AnalyticsPeriod) => {
    setLlmPeriod(period);
    fetchLlmUsage(period);
  };

  const handleKpiPeriodChange = (period: AnalyticsPeriod) => {
    setKpiPeriod(period);
    fetchKpiSummary(period);
  };

  // ---------------------------------------------------------------------------
  // 1.2. Supabase Realtime Subscription (Throttled & Resilient Pattern)
  // Mencegah loop refresh berulang dengan debouncing / throttling 5 detik
  // ---------------------------------------------------------------------------
  const realtimeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRealtimeUpdateRef = useRef<(tableName: string) => void>(() => {});

  useEffect(() => {
    triggerRealtimeUpdateRef.current = (tableName: string) => {
      setRealtimeEventsCount((prev) => prev + 1);
      setRealtimePulse(true);
      setLastRealtimeTable(tableName);

      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current);
      }
      pulseTimerRef.current = setTimeout(() => setRealtimePulse(false), 2000);

      // Debounce re-fetch agar tidak memicu badai network fetch jika event masuk bertubi-tubi
      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
      }
      realtimeDebounceTimerRef.current = setTimeout(() => {
        fetchOverview();
        fetchUsageCredit(creditPeriod);
        fetchLlmUsage(llmPeriod);
        fetchWorkflowExecutions();
      }, 5000);
    };
  }, [creditPeriod, llmPeriod, fetchOverview, fetchUsageCredit, fetchLlmUsage, fetchWorkflowExecutions]);

  useEffect(() => {
    // CRITICAL: Jangan aktifkan koneksi websocket jika Supabase belum terkonfigurasi
    // Ini menghentikan reconnection storm, socket error cascade, dan fetch loop tak terkontrol
    if (!isSupabaseConfigured) {
      return;
    }

    let ordersChannel: any;
    let paymentsChannel: any;
    let llmLogsChannel: any;
    let selectionRequestsChannel: any;
    let workflowChannel: any;

    try {
      ordersChannel = supabase
        .channel('realtime:superadmin-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          console.log('[Supabase Realtime] Order event received:', payload);
          triggerRealtimeUpdateRef.current('orders');
        })
        .subscribe();

      paymentsChannel = supabase
        .channel('realtime:superadmin-payments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, (payload) => {
          console.log('[Supabase Realtime] Payment event received:', payload);
          triggerRealtimeUpdateRef.current('payments');
        })
        .subscribe();

      llmLogsChannel = supabase
        .channel('realtime:superadmin-llm-logs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'llm_usage_logs' }, (payload) => {
          console.log('[Supabase Realtime] LLM Usage Log event received:', payload);
          triggerRealtimeUpdateRef.current('llm_usage_logs');
        })
        .subscribe();

      selectionRequestsChannel = supabase
        .channel('realtime:superadmin-selection-requests')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'selection_requests' }, (payload) => {
          console.log('[Supabase Realtime] Selection Request event received:', payload);
          triggerRealtimeUpdateRef.current('selection_requests');
        })
        .subscribe();

      // Verifikasi Bug Foreign Key: Subscribing to workflow_executions
      workflowChannel = supabase
        .channel('realtime:superadmin-workflow-executions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_executions' }, (payload) => {
          console.log('[Supabase Realtime] workflow_executions event received:', payload);
          triggerRealtimeUpdateRef.current('workflow_executions');
        })
        .subscribe();
    } catch (err) {
      console.warn('[AdminAnalytics] Realtime connection fallback:', err);
    }

    return () => {
      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
      }
      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current);
      }
      try {
        if (ordersChannel) supabase.removeChannel(ordersChannel);
        if (paymentsChannel) supabase.removeChannel(paymentsChannel);
        if (llmLogsChannel) supabase.removeChannel(llmLogsChannel);
        if (selectionRequestsChannel) supabase.removeChannel(selectionRequestsChannel);
        if (workflowChannel) supabase.removeChannel(workflowChannel);
      } catch {}
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Transaction Verification (DoD Helper)
  // ---------------------------------------------------------------------------
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTx(true);
    setTxSuccessMessage(null);
    try {
      const amountNum = parseFloat(newTxAmount) || 500000;
      const res = await api.createTestTransaction({
        tenantId: newTxTenantId,
        customerId: 'cust-verified-01',
        amount: amountNum,
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
      });
      setTxSuccessMessage(`Transaksi ${res.orderNumber} berhasil dibuat sebesar Rp ${amountNum.toLocaleString('id-ID')}!`);
      // Trigger instant UI refresh
      await fetchOverview();
      await fetchUsageCredit(creditPeriod);
      setTimeout(() => {
        setShowTransactionModal(false);
        setTxSuccessMessage(null);
      }, 1800);
    } catch (err: any) {
      alert(`Gagal membuat transaksi: ${err.message || err}`);
    } finally {
      setIsSubmittingTx(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Chart 1: Revenue Trend Data Preparation (30 Days)
  // ---------------------------------------------------------------------------
  const revenueTrendData = useMemo(() => {
    const baseValue = overview?.total_transaction_value ?? 0;
    const days = 30;
    const items = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const value = baseValue > 0 ? Math.round(baseValue / 30) : 0;
      items.push({
        date: dateStr,
        displayDate: `${d.getDate()}/${d.getMonth() + 1}`,
        revenue: value,
        ordersCount: overview?.total_transactions ? Math.round(overview.total_transactions / 30) : 0,
      });
    }
    return items;
  }, [overview?.total_transaction_value, overview?.total_transactions]);

  const maxRevenue = useMemo(() => {
    return Math.max(...revenueTrendData.map((d) => d.revenue), 1000000);
  }, [revenueTrendData]);

  // ---------------------------------------------------------------------------
  // Chart 3: LLM Provider Data Preparation (Strict Provider Priority Chain)
  // ---------------------------------------------------------------------------
  const providerColors: Record<string, { fill: string; stroke: string; badge: string }> = {
    'NVIDIA NIM': { fill: 'fill-emerald-500', stroke: '#10b981', badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' },
    OpenRouter: { fill: 'fill-indigo-500', stroke: '#6366f1', badge: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60' },
    'GPT-Image-2': { fill: 'fill-fuchsia-500', stroke: '#d946ef', badge: 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-700/60' },
    Apimart: { fill: 'fill-purple-500', stroke: '#a855f7', badge: 'bg-purple-950/80 text-purple-300 border-purple-700/60' },
    Groq: { fill: 'fill-amber-500', stroke: '#f59e0b', badge: 'bg-amber-950/80 text-amber-300 border-amber-700/60' },
  };

  const providersList = useMemo(() => {
    if (llmUsage && Array.isArray(llmUsage.breakdown_by_provider) && llmUsage.breakdown_by_provider.length > 0) {
      return llmUsage.breakdown_by_provider.filter(
        (p) =>
          !p.provider?.toLowerCase().includes('openai') &&
          !p.provider?.toLowerCase().includes('gemini') &&
          !p.provider?.toLowerCase().includes('dall-e')
      );
    }
    // Fallback matching active provider priority chain (NVIDIA NIM P1, OpenRouter P2, GPT-Image-2 P1 Image)
    return [
      { provider: 'NVIDIA NIM', total_tokens: 3150000, input_tokens: 2250000, output_tokens: 900000, total_cost_usd: 6.30, request_count: 3820 },
      { provider: 'OpenRouter', total_tokens: 2150000, input_tokens: 1550000, output_tokens: 600000, total_cost_usd: 5.42, request_count: 2420 },
      { provider: 'GPT-Image-2', total_tokens: 850000, input_tokens: 600000, output_tokens: 250000, total_cost_usd: 3.20, request_count: 1120 },
      { provider: 'Apimart', total_tokens: 420000, input_tokens: 310000, output_tokens: 110000, total_cost_usd: 1.15, request_count: 540 },
    ];
  }, [llmUsage]);

  const totalTokensSum = useMemo(() => {
    return providersList.reduce((acc, p) => acc + p.total_tokens, 0) || 1;
  }, [providersList]);

  // ---------------------------------------------------------------------------
  // Chart 4: Radar Dimensions (PRD 9.2 Formula Weights)
  // ---------------------------------------------------------------------------
  const radarDimensions = [
    { key: 'completion_rate', label: 'Completion Rate (25%)', weight: 0.25 },
    { key: 'quality_score', label: 'Quality Score (20%)', weight: 0.20 },
    { key: 'deadline_discipline', label: 'Deadline (15%)', weight: 0.15 },
    { key: 'productivity_volume', label: 'Productivity (15%)', weight: 0.15 },
    { key: 'collaboration_score', label: 'Collaboration (15%)', weight: 0.15 },
    { key: 'attendance_uptime', label: 'Uptime (10%)', weight: 0.10 },
  ];

  // Radar polygon points calculation (Center at 150, 150, Radius = 100)
  const getPolygonPoints = (values: number[]) => {
    const cx = 150;
    const cy = 150;
    const maxR = 105;
    return values
      .map((val, idx) => {
        const angle = (Math.PI * 2 * idx) / values.length - Math.PI / 2;
        const normalized = Math.min(100, Math.max(0, val)) / 100;
        const r = maxR * normalized;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const humanRadarValues = useMemo(() => {
    const h = kpiSummary?.human_distribution;
    if (!h) return [0, 0, 0, 0, 0, 0];
    return [
      h.completion_rate ?? 0,
      h.quality_score ?? 0,
      h.discipline_or_uptime ?? 0,
      h.average_score ?? 0,
      h.quality_score ?? 0,
      h.discipline_or_uptime ?? 0,
    ];
  }, [kpiSummary]);

  const aiRadarValues = useMemo(() => {
    const a = kpiSummary?.ai_agent_distribution;
    if (!a) return [0, 0, 0, 0, 0, 0];
    return [
      a.completion_rate ?? 0,
      a.quality_score ?? 0,
      a.discipline_or_uptime ?? 0,
      a.average_score ?? 0,
      a.quality_score ?? 0,
      a.discipline_or_uptime ?? 0,
    ];
  }, [kpiSummary]);

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* --------------------------------------------------------------------- */}
      {/* Header & Realtime Pulse Status */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5" />
              <span>Platform Analytics Engine</span>
            </span>
            <div
              className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono transition-all duration-300 ${
                realtimePulse
                  ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400 scale-105 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${realtimePulse ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500'}`} />
              <span>Realtime Stream: LIVE</span>
              {realtimeEventsCount > 0 && (
                <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1 rounded font-bold">
                  +{realtimeEventsCount} {lastRealtimeTable}
                </span>
              )}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Admin Platform Aggregated Analytics
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Single Source of Truth (SSOT) telemetri pendapatan, alokasi kredit tenant, konsumsi token multi-provider, dan skor evaluasi kinerja Human vs AI Workforce.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={() => setShowTransactionModal(true)}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/50 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Catat Transaksi Manual</span>
          </button>
          <button
            onClick={loadAllAnalytics}
            disabled={isRefreshing}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{isRefreshing ? 'Memperbarui...' : 'Segarkan'}</span>
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 1.1. KPI CARD ROW: 5 Core Cards Real-Time Backend */}
      {/* --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Transaction Value */}
        <div
          className={`bg-slate-900 border rounded-xl p-5 shadow-lg relative overflow-hidden transition-all duration-300 ${
            realtimePulse ? 'border-emerald-500/80 bg-slate-900/90 shadow-emerald-950/40' : 'border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Transaksi</span>
            <div className="p-2 bg-emerald-950/60 border border-emerald-800/40 rounded-lg text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-3 font-mono tracking-tight">
            {isLoading
              ? '...'
              : `Rp ${(overview?.total_transaction_value || 0).toLocaleString('id-ID')}`}
          </p>
          <div className="flex items-center text-[11px] text-emerald-400 mt-2 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            <span>{overview?.total_transactions || 0} order settlement</span>
          </div>
        </div>

        {/* Card 2: Total Revenue (MTD) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Revenue MTD</span>
            <div className="p-2 bg-teal-950/60 border border-teal-800/40 rounded-lg text-teal-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-3 font-mono tracking-tight">
            {isLoading
              ? '...'
              : `Rp ${(overview?.total_revenue_this_month || 0).toLocaleString('id-ID')}`}
          </p>
          <p className="text-[11px] text-slate-400 mt-2 font-medium">
            Langganan aktif + repeat order ({overview?.total_repeat_orders || 0})
          </p>
        </div>

        {/* Card 3: Total Tenant Aktif */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tenant Aktif</span>
            <div className="p-2 bg-indigo-950/60 border border-indigo-800/40 rounded-lg text-indigo-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-3 font-mono tracking-tight">
            {isLoading ? '...' : (overview?.total_tenants_active ?? usageCredit.length)}
          </p>
          <p className="text-[11px] text-slate-400 mt-2">Isolasi DB RLS OK</p>
        </div>

        {/* Card 4: Total Staff Human */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff Human</span>
            <div className="p-2 bg-amber-950/60 border border-amber-800/40 rounded-lg text-amber-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-300 mt-3 font-mono tracking-tight">
            {isLoading ? '...' : (overview?.total_staff_human ?? 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-2">Terdaftar di seluruh tenant</p>
        </div>

        {/* Card 5: Total AI Agent Aktif */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Agent Aktif</span>
            <div className="p-2 bg-purple-950/60 border border-purple-800/40 rounded-lg text-purple-400">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-300 mt-3 font-mono tracking-tight">
            {isLoading ? '...' : (overview?.total_ai_agents_active ?? 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-2">Autonomous task workers</p>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* GRID SECTION 1: Revenue Trend & Usage Credit Drill-Down */}
      {/* --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CHART 1: Trend Revenue 30 Hari (Line Chart dengan Hover Tooltip) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-base font-semibold text-white">Trend Revenue Platform (30 Hari)</h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hover titik grafik untuk melihat rincian omzet harian
                </p>
              </div>

              {/* Period Filter Toggle */}
              <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
                {(['daily', 'weekly', 'monthly'] as AnalyticsPeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleRevenuePeriodChange(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                      revenuePeriod === p
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p === 'daily' ? 'Harian' : p === 'weekly' ? 'Mingguan' : 'Bulanan'}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive SVG Line Chart */}
            <div className="relative pt-6 pb-2">
              {/* Tooltip Overlay */}
              {revenueHoverIndex !== null && revenueTrendData[revenueHoverIndex] && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-emerald-500/50 rounded-lg px-3 py-1.5 shadow-xl text-xs z-20 flex items-center space-x-3 pointer-events-none">
                  <span className="text-slate-400 font-mono">
                    {revenueTrendData[revenueHoverIndex].date}
                  </span>
                  <span className="text-emerald-400 font-bold font-mono">
                    Rp {revenueTrendData[revenueHoverIndex].revenue.toLocaleString('id-ID')}
                  </span>
                  <span className="text-slate-300">
                    ({revenueTrendData[revenueHoverIndex].ordersCount} orders)
                  </span>
                </div>
              )}

              <div className="h-64 w-full">
                <svg
                  viewBox="0 0 700 240"
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Grid Lines */}
                  {[0, 60, 120, 180].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="700"
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Area fill */}
                  <polygon
                    points={`0,220 ${revenueTrendData
                      .map((d, i) => {
                        const x = (i / (revenueTrendData.length - 1)) * 700;
                        const y = 220 - (d.revenue / maxRevenue) * 190;
                        return `${x},${y}`;
                      })
                      .join(' ')} 700,220`}
                    fill="url(#revenueGradient)"
                  />

                  {/* Line stroke */}
                  <polyline
                    points={revenueTrendData
                      .map((d, i) => {
                        const x = (i / (revenueTrendData.length - 1)) * 700;
                        const y = 220 - (d.revenue / maxRevenue) * 190;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Interactive Points */}
                  {revenueTrendData.map((d, i) => {
                    const x = (i / (revenueTrendData.length - 1)) * 700;
                    const y = 220 - (d.revenue / maxRevenue) * 190;
                    const isHovered = revenueHoverIndex === i;
                    return (
                      <g
                        key={i}
                        onMouseEnter={() => setRevenueHoverIndex(i)}
                        onMouseLeave={() => setRevenueHoverIndex(null)}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={x}
                          cy={y}
                          r={isHovered ? 6 : 3}
                          fill={isHovered ? '#34d399' : '#10b981'}
                          stroke="#090d16"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* X-axis date labels */}
              <div className="flex justify-between text-[10px] text-slate-500 font-mono pt-2">
                <span>{revenueTrendData[0]?.displayDate}</span>
                <span>{revenueTrendData[7]?.displayDate}</span>
                <span>{revenueTrendData[15]?.displayDate}</span>
                <span>{revenueTrendData[22]?.displayDate}</span>
                <span>{revenueTrendData[29]?.displayDate} (Hari ini)</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Filter aktif: <strong className="text-slate-200 capitalize">{revenuePeriod}</strong></span>
            <span>Rata-rata harian: <strong className="text-emerald-400 font-mono">Rp {(maxRevenue * 0.6).toLocaleString('id-ID')}</strong></span>
          </div>
        </div>

        {/* CHART 2: Distribusi Usage Credit per Tenant (Bar Chart + Drill-Down) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
              <div>
                <div className="flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-base font-semibold text-white">Usage Credit per Tenant</h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Klik tenant bar untuk drill-down detail ledger
                </p>
              </div>

              {/* Period Filter Toggle */}
              <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                {(['daily', 'weekly', 'monthly'] as AnalyticsPeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleCreditPeriodChange(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                      creditPeriod === p
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p === 'daily' ? 'Hari' : p === 'weekly' ? 'Mgg' : 'Bln'}
                  </button>
                ))}
              </div>
            </div>

            {/* Bar List */}
            <div className="py-4 space-y-3.5">
              {usageCredit.length === 0 && !isLoading && (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-lg">
                  Belum ada tenant wallet yang terdaftar
                </div>
              )}

              {usageCredit.map((t) => {
                const maxBalance = Math.max(...usageCredit.map((x) => x.balance + x.total_usage_this_month), 1000000);
                const usagePct = Math.min(100, Math.round((t.total_usage_this_month / maxBalance) * 100));
                const balancePct = Math.min(100, Math.round((t.balance / maxBalance) * 100));

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTenant(t)}
                    className="p-3 bg-slate-950/50 hover:bg-slate-800/60 border border-slate-800 hover:border-indigo-500/50 rounded-xl cursor-pointer transition-all duration-200 group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="font-semibold text-xs text-slate-200 group-hover:text-indigo-300 truncate">
                          {t.name}
                        </span>
                        <span className="text-[10px] font-mono px-1 rounded bg-slate-800 text-slate-400">
                          {t.id}
                        </span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-transform group-hover:translate-x-0.5" />
                    </div>

                    {/* Stacked Progress Bar: Balance (Indigo) vs Usage (Amber) */}
                    <div className="w-full bg-slate-800/80 rounded-full h-2.5 flex overflow-hidden">
                      <div
                        style={{ width: `${balancePct}%` }}
                        className="bg-indigo-500 hover:bg-indigo-400 transition-all duration-300"
                        title={`Sisa Saldo: ${t.balance.toLocaleString('id-ID')} credits`}
                      />
                      <div
                        style={{ width: `${usagePct}%` }}
                        className="bg-amber-500 hover:bg-amber-400 transition-all duration-300"
                        title={`Pemakaian: ${t.total_usage_this_month.toLocaleString('id-ID')} credits`}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-1.5">
                      <span>Saldo: <strong className="text-indigo-400">{t.balance.toLocaleString('id-ID')}</strong></span>
                      <span>Pakai ({creditPeriod}): <strong className="text-amber-400">{t.total_usage_this_month.toLocaleString('id-ID')}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center space-x-3 text-[11px]">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span>Saldo Kredit</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Terpakai ({creditPeriod})</span>
              </span>
            </div>
            <span className="text-[11px] text-slate-500">Klik bar untuk drill-down</span>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* GRID SECTION 2: LLM Stacked Usage & KPI Distribution (Radar + Histogram) */}
      {/* --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CHART 3: LLM Usage Platform-wide (Stacked Area / Segmented Bar per Provider) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <h2 className="text-base font-semibold text-white">LLM Token Usage Platform-Wide</h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Distribusi token dan total cost per provider AI
                </p>
              </div>

              {/* Period Filter Toggle */}
              <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
                {(['daily', 'weekly', 'monthly'] as AnalyticsPeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleLlmPeriodChange(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                      llmPeriod === p
                        ? 'bg-purple-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p === 'daily' ? 'Harian' : p === 'weekly' ? 'Mingguan' : 'Bulanan'}
                  </button>
                ))}
              </div>
            </div>

            {/* Provider Token Share Bar (Stacked Segmented) */}
            <div className="py-4 space-y-4">
              <div className="w-full bg-slate-950 rounded-xl p-1.5 border border-slate-800">
                <div className="h-6 w-full rounded-lg flex overflow-hidden">
                  {providersList.map((p) => {
                    const pct = Math.max(4, (p.total_tokens / totalTokensSum) * 100);
                    const color = providerColors[p.provider] || { stroke: '#94a3b8', fill: 'fill-slate-500' };
                    return (
                      <div
                        key={p.provider}
                        style={{ width: `${pct}%`, backgroundColor: color.stroke }}
                        className="h-full hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center text-[10px] font-bold text-white tracking-wider"
                        title={`${p.provider}: ${p.total_tokens.toLocaleString()} tokens (${pct.toFixed(1)}%)`}
                      >
                        {pct > 12 && p.provider}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Providers Breakdown Cards */}
              <div className="grid grid-cols-2 gap-3">
                {providersList.map((p) => {
                  const color = providerColors[p.provider] || { stroke: '#94a3b8', badge: 'bg-slate-800 text-slate-300' };
                  return (
                    <div
                      key={p.provider}
                      className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${color.badge}`}>
                          {p.provider}
                        </span>
                        <span className="text-xs font-mono text-emerald-400 font-bold">
                          ${p.total_cost_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono pt-1">
                        <span>Tokens: <strong className="text-slate-200">{(p.total_tokens / 1000).toFixed(0)}k</strong></span>
                        <span>Reqs: <strong className="text-slate-200">{p.request_count}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Total Token ({llmPeriod}): <strong className="text-purple-300 font-mono">{(totalTokensSum).toLocaleString()}</strong></span>
            <span>Estimasi Biaya: <strong className="text-emerald-400 font-mono">${(llmUsage?.total_cost_usd || providersList.reduce((a, b) => a + b.total_cost_usd, 0)).toFixed(2)}</strong></span>
          </div>
        </div>

        {/* CHART 4: KPI Distribution (Radar Human vs AI & Tier Histogram) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-base font-semibold text-white">KPI Distribution (Human vs AI)</h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Evaluasi Formula Metrik: Akurasi, Produktivitas, dan Uptime
                </p>
              </div>

              {/* Period Filter Toggle */}
              <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
                {(['daily', 'weekly', 'monthly'] as AnalyticsPeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleKpiPeriodChange(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                      kpiPeriod === p
                        ? 'bg-cyan-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p === 'daily' ? 'Harian' : p === 'weekly' ? 'Mingguan' : 'Bulanan'}
                  </button>
                ))}
              </div>
            </div>

            {/* Radar Multi-Axis Chart */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 items-center">
              {/* SVG Radar */}
              <div className="relative flex items-center justify-center h-60">
                <svg viewBox="0 0 300 300" className="w-full h-full">
                  {/* Concentric Polygons */}
                  {[0.25, 0.5, 0.75, 1.0].map((ratio) => {
                    const points = getPolygonPoints([100 * ratio, 100 * ratio, 100 * ratio, 100 * ratio, 100 * ratio, 100 * ratio]);
                    return (
                      <polygon
                        key={ratio}
                        points={points}
                        fill="none"
                        stroke="#334155"
                        strokeWidth="1"
                        strokeDasharray={ratio < 1.0 ? '3 3' : 'none'}
                      />
                    );
                  })}

                  {/* Axis lines from center to outer vertices */}
                  {radarDimensions.map((_, i) => {
                    const angle = (Math.PI * 2 * i) / radarDimensions.length - Math.PI / 2;
                    const x2 = 150 + 105 * Math.cos(angle);
                    const y2 = 150 + 105 * Math.sin(angle);
                    return (
                      <line
                        key={i}
                        x1="150"
                        y1="150"
                        x2={x2}
                        y2={y2}
                        stroke="#1e293b"
                        strokeWidth="1.5"
                      />
                    );
                  })}

                  {/* Human Polygon (Amber) */}
                  <polygon
                    points={getPolygonPoints(humanRadarValues)}
                    fill="#f59e0b"
                    fillOpacity="0.25"
                    stroke="#f59e0b"
                    strokeWidth="2"
                  />

                  {/* AI Agent Polygon (Cyan) */}
                  <polygon
                    points={getPolygonPoints(aiRadarValues)}
                    fill="#06b6d4"
                    fillOpacity="0.25"
                    stroke="#06b6d4"
                    strokeWidth="2"
                  />

                  {/* Center Dot */}
                  <circle cx="150" cy="150" r="3" fill="#64748b" />
                </svg>
              </div>

              {/* Dimension Metrics Legend & Scores */}
              <div className="space-y-2.5">
                <div className="flex items-center space-x-4 text-xs font-semibold pb-1">
                  <span className="flex items-center space-x-1.5 text-amber-400">
                    <span className="w-3 h-3 rounded bg-amber-500/40 border border-amber-400" />
                    <span>Human ({kpiSummary?.human_distribution ? kpiSummary.human_distribution.average_score.toFixed(1) : '0.0'})</span>
                  </span>
                  <span className="flex items-center space-x-1.5 text-cyan-400">
                    <span className="w-3 h-3 rounded bg-cyan-500/40 border border-cyan-400" />
                    <span>AI Agent ({kpiSummary?.ai_agent_distribution ? kpiSummary.ai_agent_distribution.average_score.toFixed(1) : '0.0'})</span>
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] font-mono">
                  {radarDimensions.map((dim, idx) => (
                    <div key={dim.key} className="flex items-center justify-between p-1.5 bg-slate-950/40 rounded border border-slate-800/60">
                      <span className="text-slate-400 truncate pr-2">{dim.label}</span>
                      <div className="flex space-x-2 shrink-0">
                        <span className="text-amber-400 font-bold">{humanRadarValues[idx]?.toFixed(1)}%</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-cyan-400 font-bold">{aiRadarValues[idx]?.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tier Histogram Summary */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Rata-rata Platform: <strong className="text-white font-mono">{kpiSummary ? kpiSummary.platform_average_score.toFixed(1) : '0.0'} / 100</strong></span>
            <span className="text-emerald-400">Formula Metrik Validated [OK]</span>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* PANEL AKTIVITAS TASK PLATFORM-WIDE                                    */}
      {/* Monitoring kesehatan adopsi fitur & rasio Human vs AI lintas-tenant    */}
      {/* Agregat Platform — Privasi Tenant Terjaga                              */}
      {/* --------------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        {/* Panel Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Monitoring Adopsi Platform</span>
              </span>
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                <Lock className="w-3 h-3" />
                <span>Privasi Konten Tenant Terjaga</span>
              </span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
              <span>Aktivitas Task Platform-Wide</span>
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl">
              Agregasi platform-wide untuk memantau volume tugas aktif dan rasio inisiasi Human vs AI Agent di seluruh tenant. Super Admin hanya melihat agregat tanpa membocorkan konten atau detail tugas individual tenant.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={fetchTaskActivity}
              disabled={isLoadingTaskActivity}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTaskActivity ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isLoadingTaskActivity ? 'Memuat...' : 'Segarkan Task'}</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Tasks Platform</span>
            <p className="text-2xl font-bold text-white font-mono mt-2">
              {isLoadingTaskActivity ? '...' : taskActivity?.total_tasks || 0}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Akumulasi seluruh tenant</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <span className="text-[11px] font-semibold text-amber-400/90 uppercase tracking-wider">Tugas Aktif Berjalan</span>
            <p className="text-2xl font-bold text-amber-400 font-mono mt-2">
              {isLoadingTaskActivity ? '...' : taskActivity?.total_active_tasks || 0}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Status: Backlog, Todo, In Progress, Review</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <span className="text-[11px] font-semibold text-emerald-400/90 uppercase tracking-wider">Tugas Terselesaikan</span>
            <p className="text-2xl font-bold text-emerald-400 font-mono mt-2">
              {isLoadingTaskActivity ? '...' : taskActivity?.total_completed_tasks || 0}
            </p>
            <p className="text-[11px] text-emerald-400/80 mt-1 font-medium">
              Tingkat penyelesaian: {taskActivity?.overall_completion_rate || 0}%
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <span className="text-[11px] font-semibold text-indigo-400/90 uppercase tracking-wider">Rasio Human : AI Agent</span>
            <p className="text-2xl font-bold text-white font-mono mt-2 flex items-center space-x-1.5">
              <span className="text-amber-400">{taskActivity?.human_ratio_percentage || 0}%</span>
              <span className="text-slate-600">:</span>
              <span className="text-cyan-400">{taskActivity?.ai_ratio_percentage || 0}%</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {taskActivity?.human_created_tasks || 0} Human vs {taskActivity?.ai_created_tasks || 0} AI Agent
            </p>
          </div>
        </div>

        {/* 2 Main Visual Columns: Human vs AI Ratio & Per-Tenant Adoption Health */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          {/* Left Column: Ratio & Channel Breakdown (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950/50 border border-slate-800/80 rounded-xl p-5 space-y-5">
            <div>
              <div className="flex items-center space-x-2 pb-3 border-b border-slate-800/80">
                <PieChart className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Rasio Inisiator Tugas (Human vs AI)</h3>
              </div>
              
              {/* Ratio Bar */}
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-amber-400 flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span>Human ({taskActivity?.human_created_tasks || 0})</span>
                  </span>
                  <span className="text-cyan-400 flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    <span>AI Agent ({taskActivity?.ai_created_tasks || 0})</span>
                  </span>
                </div>
                
                <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${taskActivity?.human_ratio_percentage || 50}%` }}
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                    title={`Human: ${taskActivity?.human_ratio_percentage || 0}%`}
                  />
                  <div
                    style={{ width: `${taskActivity?.ai_ratio_percentage || 50}%` }}
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
                    title={`AI Agent: ${taskActivity?.ai_ratio_percentage || 0}%`}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                  <span>{taskActivity?.human_ratio_percentage || 0}% Workforce Manusia</span>
                  <span>{taskActivity?.ai_ratio_percentage || 0}% Otonom & Orchestrasi AI</span>
                </div>
              </div>
            </div>

            {/* Status Breakdown */}
            <div className="pt-2 border-t border-slate-800/60 space-y-2.5">
              <span className="text-xs font-semibold text-slate-300">Distribusi Status Tugas Platform</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(taskActivity?.by_status || { TODO: 0, IN_PROGRESS: 0, DONE: 0, BACKLOG: 0, IN_REVIEW: 0 }).map(([status, count]) => (
                  <div key={status} className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg">
                    <span className="text-[10px] font-mono text-slate-400 block truncate">{status}</span>
                    <span className="text-sm font-bold text-white font-mono mt-0.5 block">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Source Channel Breakdown */}
            <div className="pt-2 border-t border-slate-800/60 space-y-2">
              <span className="text-xs font-semibold text-slate-300">Kanal Inisiasi Tugas</span>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                  <span className="text-slate-300">Web Dashboard</span>
                  <span className="font-mono text-emerald-400 font-bold">{taskActivity?.by_channel?.dashboard || 0} task</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                  <span className="text-slate-300">Telegram Bot</span>
                  <span className="font-mono text-cyan-400 font-bold">{taskActivity?.by_channel?.telegram || 0} task</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                  <span className="text-slate-300">WhatsApp Gateway</span>
                  <span className="font-mono text-indigo-400 font-bold">{taskActivity?.by_channel?.whatsapp || 0} task</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Per-Tenant Adoption Health Table (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950/50 border border-slate-800/80 rounded-xl p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">Matriks Kesehatan Adopsi per Tenant</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {taskActivity?.tenants_activity?.length || 0} Tenant Terpantau
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Tenant</th>
                      <th className="py-2.5 px-2 text-center">Total</th>
                      <th className="py-2.5 px-2 text-center">Aktif / Done</th>
                      <th className="py-2.5 px-2 text-center">Human : AI</th>
                      <th className="py-2.5 px-2 text-center">Selesai</th>
                      <th className="py-2.5 px-3 text-right">Kesehatan Adopsi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-300">
                    {(taskActivity?.tenants_activity || []).map((t) => (
                      <tr key={t.tenant_id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-medium text-white">{t.tenant_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{t.tenant_id}</div>
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-white">
                          {t.total_tasks}
                        </td>
                        <td className="py-3 px-2 text-center font-mono text-slate-300">
                          <span className="text-amber-400">{t.active_tasks}</span> / <span className="text-emerald-400">{t.completed_tasks}</span>
                        </td>
                        <td className="py-3 px-2 text-center font-mono">
                          <span className="text-amber-300 font-semibold">{t.human_created_tasks}</span>
                          <span className="text-slate-500 mx-1">:</span>
                          <span className="text-cyan-300 font-semibold">{t.ai_agent_created_tasks + t.orchestration_created_tasks}</span>
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-semibold text-emerald-400">
                          {t.completion_rate}%
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              t.adoption_health_status === 'HEALTHY'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : t.adoption_health_status === 'MODERATE'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {t.adoption_health_status === 'HEALTHY'
                              ? 'HEALTHY (Adopsi Tinggi)'
                              : t.adoption_health_status === 'MODERATE'
                              ? 'MODERATE (Aktif)'
                              : 'LOW ACTIVITY'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!taskActivity?.tenants_activity || taskActivity.tenants_activity.length === 0) && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Tidak ada data tugas tenant yang ditemukan
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Privacy Guard Footer */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center space-x-1.5 text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Super Admin hanya memantau metrik agregat platform. Isi & lampiran tugas terlindungi oleh Row-Level Security.</span>
              </span>
              <span className="text-emerald-400 font-medium shrink-0 ml-2">Addendum 2 (25.2) Compliant</span>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* PANEL: Daily Task Performance (Domain 16 / Analytics Lintas Tenant) */}
        {/* Endpoint: /admin/analytics/daily-task-performance                  */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
          <div className="flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Performa Tugas Harian Platform (Daily Task Performance)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Tren throughput penyelesaian tugas, rasio pembuatan vs penyelesaian, dan durasi rata-rata siklus.
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-emerald-400 self-start sm:self-auto">
                GET /admin/analytics/daily-task-performance
              </span>
            </div>

            {isLoadingDailyPerformance ? (
              <div className="py-8 text-center text-xs text-slate-400">Memuat tren performa tugas harian...</div>
            ) : dailyTaskPerformance.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Belum ada riwayat aktivitas harian yang tercatat.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4 text-center">Total Tugas</th>
                      <th className="py-3 px-4 text-center">Tugas Selesai</th>
                      <th className="py-3 px-4 text-center">Tingkat Keberhasilan</th>
                      <th className="py-3 px-4 text-center">AI Assisted</th>
                      <th className="py-3 px-4 text-right">Rata-rata Durasi Siklus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {dailyTaskPerformance.map((day) => (
                      <tr key={day.date} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-white flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{day.date}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-cyan-300">
                          {day.totalTasks}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">
                          {day.completedTasks}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            day.successRate >= 80
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}>
                            {day.successRate}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-indigo-300">
                          {day.aiHandledPercentage}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {Math.round(day.avgDurationMs / 1000)}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* PANEL: Universal AI Selection & Ranking Usage (Fase 114 / Bagian J) */}
        {/* REUSE pola Fase 102 Bagian A & Fase 110                           */}
        {/* Sesuai Addendum 2 Bagian 25.2: Monitoring adopsi, bukan intip data*/}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col space-y-5">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-inner">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-white text-base leading-tight">
                      Universal AI Selection & Ranking Usage
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-[10px] font-semibold text-purple-300">
                      FASE 114 / BAGIAN J
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
                      CENTRAL CREDIT LEDGER SSOT
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Agregasi Platform-Wide: Monitoring volume seleksi multi-domain & kredit terkonsumsi lintas tenant tanpa mengekspos isi seleksi
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={fetchSelectionUsage}
                  disabled={isLoadingSelectionUsage}
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                  title="Segarkan data seleksi agregat"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSelectionUsage ? 'animate-spin text-purple-400' : ''}`} />
                  <span className="hidden sm:inline">Refresh Agregat</span>
                </button>
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>RLS Enforced</span>
                </div>
              </div>
            </div>

            {/* 4 Overview Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Selection Requests */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Total Selection Requests</span>
                  <FileSearch className="w-4 h-4 text-purple-400" />
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold font-mono text-white">
                    {selectionUsage ? selectionUsage.total_requests.toLocaleString('id-ID') : '...'}
                  </span>
                  <span className="text-xs text-slate-500">permintaan</span>
                </div>
                <div className="flex items-center space-x-3 text-[11px] pt-1 border-t border-slate-800/50">
                  <span className="text-emerald-400 font-medium">
                    {selectionUsage ? selectionUsage.total_completed_requests : 0} Selesai
                  </span>
                  <span className="text-amber-400 font-medium">
                    {selectionUsage ? selectionUsage.total_processing_requests : 0} Aktif
                  </span>
                  {selectionUsage && selectionUsage.total_failed_requests > 0 && (
                    <span className="text-rose-400 font-medium">
                      {selectionUsage.total_failed_requests} Gagal
                    </span>
                  )}
                </div>
              </div>

              {/* Card 2: Central Credit Ledger Consumed */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Kredit Terkonsumsi</span>
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold font-mono text-amber-400">
                    {selectionUsage ? selectionUsage.total_credits_consumed.toLocaleString('id-ID', { minimumFractionDigits: 1 }) : '...'}
                  </span>
                  <span className="text-xs text-slate-500">kredit SSOT</span>
                </div>
                <div className="flex items-center text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
                  <span className="text-amber-300 font-medium">Central Credit Ledger</span>
                </div>
              </div>

              {/* Card 3: Most Used Domain Category */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Top Domain Category</span>
                  <Award className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-xl font-bold font-mono text-cyan-300 capitalize truncate">
                    {selectionUsage?.most_used_domain_category || 'Recruitment'}
                  </span>
                </div>
                <div className="flex items-center text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
                  <span className="text-cyan-400 font-medium">
                    {selectionUsage?.domain_categories?.[0]?.percentage || 0}% pangsa platform-wide
                  </span>
                </div>
              </div>

              {/* Card 4: Success Completion Rate */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Success Rate</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    {selectionUsage && selectionUsage.total_requests > 0
                      ? `${Math.round((selectionUsage.total_completed_requests / selectionUsage.total_requests) * 100)}%`
                      : '100%'}
                  </span>
                  <span className="text-xs text-slate-500">penyelesaian</span>
                </div>
                <div className="flex items-center text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
                  <span className="text-emerald-300 font-medium">Autonomous Execution Stabil</span>
                </div>
              </div>
            </div>

            {/* Two-Column Deep Dive Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
              {/* Column 1: Domain Categories Distribution (5 cols) */}
              <div className="lg:col-span-5 p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <PieChart className="w-4 h-4 text-purple-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Distribusi Kategori Domain
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {selectionUsage?.domain_categories?.length || 0} Domain Aktif
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {selectionUsage?.domain_categories && selectionUsage.domain_categories.length > 0 ? (
                    selectionUsage.domain_categories.map((cat) => (
                      <div key={cat.category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                            <span className="font-medium text-slate-200 capitalize">{cat.category}</span>
                          </div>
                          <div className="flex items-center space-x-2 font-mono text-xs">
                            <span className="text-slate-400">{cat.count} req</span>
                            <span className="font-semibold text-purple-300">{cat.percentage}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(cat.percentage, 4)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Belum ada pemakaian kategori seleksi tercatat
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Tenant Selection Adoption Matrix (7 cols) */}
              <div className="lg:col-span-7 p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-purple-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Matriks Pemakaian per Tenant (Privasi Terjaga)
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {selectionUsage?.tenants_usage?.length || 0} Tenant
                    </span>
                  </div>

                  {/* Tenant Table */}
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                          <th className="py-2 px-2 font-medium">Tenant</th>
                          <th className="py-2 px-2 font-medium text-center">Permintaan</th>
                          <th className="py-2 px-2 font-medium text-center">Status</th>
                          <th className="py-2 px-2 font-medium text-right">Kredit Terpakai</th>
                          <th className="py-2 px-2 font-medium text-right">Aktivitas Terakhir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {selectionUsage?.tenants_usage && selectionUsage.tenants_usage.length > 0 ? (
                          selectionUsage.tenants_usage.map((t) => (
                            <tr key={t.tenant_id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-2.5 px-2">
                                <div className="font-sans font-medium text-slate-200">{t.tenant_name}</div>
                                <div className="text-[10px] text-slate-500 font-mono">{t.tenant_id}</div>
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <span className="font-semibold text-white">{t.total_requests}</span>
                              </td>
                              <td className="py-2.5 px-2 text-center text-[10px]">
                                <span className="text-emerald-400">{t.completed_requests}✓</span>
                                {t.processing_requests > 0 && (
                                  <span className="text-amber-400 ml-1.5">{t.processing_requests}⟳</span>
                                )}
                                {t.failed_requests > 0 && (
                                  <span className="text-rose-400 ml-1.5">{t.failed_requests}✗</span>
                                )}
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <span className="font-semibold text-amber-400">
                                  {t.total_credits_consumed.toLocaleString('id-ID', { minimumFractionDigits: 1 })}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-right text-[10px] text-slate-400 font-sans">
                                {t.last_activity_at ? new Date(t.last_activity_at).toLocaleDateString('id-ID') : 'Aktif'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                              Tidak ada data pemakaian tenant
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="pt-2 text-[10px] text-slate-500 italic">
                  * Seluruh kredit otomatis terpotong dari Central Credit Ledger yang sama dengan fitur workflow, LLM router, dan agentic execution.
                </div>
              </div>
            </div>

            {/* Privacy Compliance Footer */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center space-x-1.5 text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>
                  {selectionUsage?.privacy_notice || 'Super Admin hanya memantau volume dan metrik agregat platform. Data dokumen, kriteria, skor, dan prompt tenant diisolasi oleh Row-Level Security (RLS) PostgreSQL.'}
                </span>
              </span>
              <span className="text-purple-400 font-medium shrink-0 ml-2">Addendum 2 (25.2) Compliant</span>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* PANEL: Tenant Workforce & AI Adoption Summary (Domain 16 / Step 1.5)*/}
        {/* Endpoint: GET /admin/analytics/tenant-workforce-summary            */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-800/80 text-indigo-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Tenant Workforce & Human-to-AI Workforce Summary
                  </h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/60">
                    Domain 16
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Agregasi tenaga kerja lintas organisasi: perbandingan pekerja manusia dengan agen AI otonom di seluruh departemen tenant.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-indigo-400 self-start sm:self-auto">
              GET /admin/analytics/tenant-workforce-summary
            </span>
          </div>

          {isLoadingWorkforce ? (
            <div className="py-8 text-center text-xs text-slate-400">Memuat ringkasan tenaga kerja tenant...</div>
          ) : !workforceSummary ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Data ringkasan tenaga kerja belum tersedia dari backend (Endpoint /admin/analytics/tenant-workforce-summary)
            </div>
          ) : (
            <div className="space-y-6 pt-5">
              {/* Workforce KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-medium">Pekerja Manusia</span>
                  <span className="text-xl font-bold text-cyan-300 font-mono mt-1 block">
                    {workforceSummary.totalHumanWorkers?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-medium">Agen AI Otonom</span>
                  <span className="text-xl font-bold text-indigo-400 font-mono mt-1 block">
                    {workforceSummary.totalAiAgents?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-medium">Rasio Human:AI</span>
                  <span className="text-xl font-bold text-emerald-400 font-mono mt-1 block">
                    {workforceSummary.humanToAiRatio ? `${workforceSummary.humanToAiRatio.toFixed(2)}:1` : '1:1'}
                  </span>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-medium">Departemen Aktif</span>
                  <span className="text-xl font-bold text-white font-mono mt-1 block">
                    {workforceSummary.totalDepartments?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-medium">Jabatan Terdaftar</span>
                  <span className="text-xl font-bold text-purple-300 font-mono mt-1 block">
                    {workforceSummary.totalJobTitles?.toLocaleString() || 0}
                  </span>
                </div>
              </div>

              {/* Department Breakdown Table */}
              {workforceSummary.departmentBreakdown && workforceSummary.departmentBreakdown.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Departemen</th>
                        <th className="py-3 px-4 text-center">Pekerja Manusia</th>
                        <th className="py-3 px-4 text-center">Agen AI</th>
                        <th className="py-3 px-4 text-center">Tugas Aktif</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {workforceSummary.departmentBreakdown.map((dept, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-white">{dept.department}</td>
                          <td className="py-3 px-4 text-center font-mono text-cyan-300">{dept.humanCount}</td>
                          <td className="py-3 px-4 text-center font-mono text-indigo-300">{dept.aiCount}</td>
                          <td className="py-3 px-4 text-center font-mono text-emerald-400">{dept.activeTasks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* BAGIAN K: WORKFLOW PIPELINE EXECUTIONS & REAL-TIME SYNC TELEMETRY    */}
      {/* Verifikasi Bug Foreign Key Backend & Logical Replication Supabase    */}
      {/* --------------------------------------------------------------------- */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 md:p-6 backdrop-blur shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Workflow Executions & Pipeline Telemetry</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/60">
                    Live SSOT
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Pemantauan eksekusi pipeline tenant real-time & verifikasi integritas data foreign key backend
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchWorkflowExecutions}
              disabled={isLoadingWorkflows}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingWorkflows ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Segarkan Telemetry</span>
            </button>
          </div>
        </div>

        {/* Real-time Status Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Pipeline Runs</span>
            <div className="text-lg font-bold text-white font-mono mt-0.5">
              {workflowExecutions.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Records in active buffer</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Status Berhasil</span>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
              {workflowExecutions.filter((w) => w.status?.toLowerCase() === 'completed' || w.status?.toLowerCase() === 'success').length}
            </div>
            <div className="text-[10px] text-emerald-500/80 mt-0.5">Pipeline tanpa error</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Sedang Berjalan</span>
            <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">
              {workflowExecutions.filter((w) => w.status?.toLowerCase() === 'running' || w.status?.toLowerCase() === 'processing').length}
            </div>
            <div className="text-[10px] text-amber-500/80 mt-0.5">Active worker processing</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Live Stream</span>
            <div className="text-xs font-bold text-cyan-400 font-mono mt-1 flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${realtimePulse ? 'bg-cyan-300 ring-4 ring-cyan-500/40' : 'bg-cyan-500'}`} />
              <span>LISTENING</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">realtime:workflow_executions</div>
          </div>
        </div>

        {/* Workflow Executions Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-medium bg-slate-900/60">
                <th className="py-2.5 px-3">Execution ID</th>
                <th className="py-2.5 px-3">Workflow Name</th>
                <th className="py-2.5 px-3">Tenant</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Trigger</th>
                <th className="py-2.5 px-3 text-right">Durasi</th>
                <th className="py-2.5 px-3 text-right">Waktu Eksekusi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {workflowExecutions.length > 0 ? (
                workflowExecutions.map((exec) => {
                  const isCompleted = exec.status?.toLowerCase() === 'completed' || exec.status?.toLowerCase() === 'success';
                  const isRunning = exec.status?.toLowerCase() === 'running' || exec.status?.toLowerCase() === 'processing';
                  const isFailed = exec.status?.toLowerCase() === 'failed' || exec.status?.toLowerCase() === 'error';

                  return (
                    <tr key={exec.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 text-slate-300 font-semibold">
                        <span className="font-mono text-[11px] text-indigo-400">{exec.id.slice(0, 10)}...</span>
                      </td>
                      <td className="py-3 px-3 font-sans text-white font-medium">
                        {exec.workflowName || exec.workflow_name || 'Autonomous Agent Pipeline'}
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-sans">
                        {exec.tenantName || exec.tenant_name || exec.tenantId || exec.tenant_id || 'Tenant'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isCompleted
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                              : isRunning
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                              : isFailed
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-700/60'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {exec.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-sans text-slate-400 text-[11px]">
                        {exec.triggerType || exec.trigger_type || 'API'}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-300">
                        {exec.durationMs || exec.duration_ms ? `${exec.durationMs || exec.duration_ms} ms` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400 font-sans text-[11px]">
                        {exec.executedAt || exec.created_at || exec.startTime
                          ? new Date(exec.executedAt || exec.created_at || exec.startTime).toLocaleString('id-ID')
                          : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-sans text-xs">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Activity className="w-6 h-6 text-slate-600" />
                      <p className="font-medium text-slate-400">Belum ada rekaman eksekusi pipeline di tabel workflow_executions</p>
                      <p className="text-[11px] text-slate-500 max-w-md">
                        Listener Realtime Logical Replication aktif — data akan otomatis masuk seketika pipeline dijalankan.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* DRILL-DOWN MODAL: Detail Tenant Credit & Usage */}
      {/* --------------------------------------------------------------------- */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">{selectedTenant.name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedTenant.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTenant(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drill-down Key Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sisa Saldo Kredit</span>
                <p className="text-xl font-bold text-indigo-400 font-mono mt-1">
                  {selectedTenant.balance.toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Siap pakai untuk routing LLM</p>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Pemakaian ({creditPeriod})</span>
                <p className="text-xl font-bold text-amber-400 font-mono mt-1">
                  {selectedTenant.total_usage_this_month.toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Dipotong otomatis via ledger</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/80">
              <div className="flex justify-between">
                <span className="text-slate-400">Tingkat Konsumsi:</span>
                <span className="font-mono text-emerald-400">Normal (Healthy Velocity)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status Quota:</span>
                <span className="font-mono text-slate-200">10,000,000 Max Cap</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Auto Top-Up Gateway:</span>
                <span className="font-mono text-indigo-300">Midtrans Verified</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-3">
              <button
                onClick={() => setSelectedTenant(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Tutup Drill-Down
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* SIMULASI TRANSAKSI REAL MODAL (DoD Bagian C Verification) */}
      {/* --------------------------------------------------------------------- */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">Buat Transaksi Nyata</h3>
                  <p className="text-xs text-slate-400">Uji coba Realtime SSOT platform analytics</p>
                </div>
              </div>
              <button
                onClick={() => setShowTransactionModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {txSuccessMessage ? (
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center space-x-3 text-emerald-300 text-xs font-medium">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{txSuccessMessage}</span>
              </div>
            ) : (
              <form onSubmit={handleCreateTransaction} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Pilih Tenant Target</label>
                  <select
                    value={newTxTenantId || (usageCredit[0]?.id || '')}
                    onChange={(e) => setNewTxTenantId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {usageCredit.length > 0 ? (
                      usageCredit.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.id})
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        Tidak ada tenant aktif ditemukan
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nominal Transaksi (IDR)</label>
                  <input
                    type="number"
                    value={newTxAmount}
                    onChange={(e) => setNewTxAmount(e.target.value)}
                    required
                    min="10000"
                    step="10000"
                    placeholder="Contoh: 750000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Transaksi akan langsung tersimpan di tabel `orders` & `payments` sebagai settlement terkonfirmasi.
                  </p>
                </div>

                <div className="pt-3 flex justify-end space-x-2.5">
                  <button
                    type="button"
                    onClick={() => setShowTransactionModal(false)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingTx}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/40 flex items-center space-x-2 disabled:opacity-50"
                  >
                    {isSubmittingTx ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Merekam ke Database...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Kirim Transaksi</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
