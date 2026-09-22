import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  Zap,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ShieldCheck,
  Cpu,
  Layers,
  Sparkles,
  AlertOctagon,
  RefreshCw,
  Clock,
  Radio,
  Building2,
} from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { UsageAnalytics, AdminUsageAnalyticsResponse } from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const UsageCostDashboardScreen: React.FC = () => {
  const [analytics, setAnalytics] = useState<AdminUsageAnalyticsResponse | null>(null);
  const [platformLlmUsage, setPlatformLlmUsage] = useState<any | null>(null);
  const [adminUsageSummary, setAdminUsageSummary] = useState<any | null>(null);
  const [adminLlmUsageSummary, setAdminLlmUsageSummary] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'tenants' | 'platform_llm' | 'service_metering'>('tenants');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>('all');
  const [errorInfo, setErrorInfo] = useState<HonestErrorInfo | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(new Date().toLocaleTimeString());
  const [realtimeEventCount, setRealtimeEventCount] = useState<number>(0);

  const fetchUsage = useCallback(async () => {
    setIsLoading(true);
    setErrorInfo(null);
    try {
      const [analyticsData, platformData, usageData, llmData] = await Promise.all([
        api.getUsageAnalytics(),
        api.getAnalyticsLlmUsagePlatformWide().catch(() => null),
        api.getAdminUsage().catch(() => null),
        api.getAdminLlmUsage().catch(() => null),
      ]);
      setAnalytics(analyticsData);
      setPlatformLlmUsage(platformData);
      setAdminUsageSummary(usageData);
      setAdminLlmUsageSummary(llmData);
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('[UsageCost] Backend fetch failed:', err);
      setErrorInfo({
        endpoint: '/admin/usage-analytics & /admin/usage & /admin/llm-usage & /admin/analytics/llm-usage-platform-wide',
        status: err?.status || err?.statusCode || 502,
        message:
          err?.message ||
          'Gagal memuat analitik penggunaan token dari backend. Respon tidak valid atau koneksi ditolak (502).',
        rawDetails: err?.rawDetails || err?.stack || err?.toString(),
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();

    // Supabase Realtime subscription for usage_records (Fase 101: Native Postgres Logical Replication)
    const channel = supabase
      .channel('realtime:usage_records')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usage_records' },
        (payload) => {
          setRealtimeEventCount((prev) => prev + 1);
          fetchUsage();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUsage]);

  // Provider breakdown filtering strictly without eliminated providers
  const activeProviders = [
    { id: 'all', name: 'Semua Provider Aktif' },
    { id: 'nvidia_nim', name: 'NVIDIA NIM (Prioritas 1 Reasoning / Prioritas 3 Image)' },
    { id: 'openrouter', name: 'OpenRouter (Prioritas 2 Reasoning & Image)' },
    { id: 'gpt_image_2', name: 'GPT-Image-2 / Apimart (Prioritas 1 Image)' },
  ];

  // Filter breakdown list
  const filteredBreakdown = analytics?.breakdown
    ? analytics.breakdown.filter((item) => {
        if (selectedProviderFilter === 'all') return true;
        const prov = (item.provider || '').toLowerCase();
        return prov.includes(selectedProviderFilter.toLowerCase());
      })
    : [];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/70 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-semibold mb-2">
            <DollarSign className="w-3 h-3" />
            <span>FinOps Intelligence • Endpoint: /admin/usage-analytics</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <span>LLM Token Consumption & Cost Intelligence</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pengawasan biaya token real-time, margin keuntungan per tenant, dan optimasi prompt routing otomatis.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>Live Sync</span>
            {realtimeEventCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded bg-emerald-900 text-emerald-300 text-[10px] font-mono">
                +{realtimeEventCount}
              </span>
            )}
          </div>
          <button
            onClick={fetchUsage}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Memuat...' : 'Segarkan'}</span>
          </button>
        </div>
      </div>

      {/* Honest Error Banner if backend fails */}
      {errorInfo && (
        <HonestErrorBanner
          error={errorInfo}
          onRetry={fetchUsage}
          isRetrying={isLoading}
          title="Kegagalan Telemetri Usage Analytics Backend"
        />
      )}

      {/* Active LLM Provider Chain & Elimination Status */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-white text-sm">Konfigurasi Rantai Provider LLM & Image Aktif</h3>
          </div>
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[10px] font-semibold">
            <AlertOctagon className="w-3 h-3 text-rose-400" />
            <span>OpenAI DALL-E & Google Gemini dieliminasi total dari runtime</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Reasoning Chain */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Routing Reasoning & Chat</span>
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Fallback Priority
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-emerald-800/40">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 font-mono font-bold flex items-center justify-center text-[10px] border border-emerald-700">
                    1
                  </span>
                  <div>
                    <span className="font-semibold text-white">NVIDIA NIM Microservices</span>
                    <p className="text-[10px] text-slate-400">meta/llama-3.1-70b-instruct, mistralai/mixtral-8x22b</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  PRIMARY
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-indigo-800/40">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 font-mono font-bold flex items-center justify-center text-[10px] border border-indigo-700">
                    2
                  </span>
                  <div>
                    <span className="font-semibold text-white">OpenRouter AI Gateway</span>
                    <p className="text-[10px] text-slate-400">Anthropic Claude 3.5, DeepSeek Chat, Meta Llama 405B</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                  FALLBACK
                </span>
              </div>
            </div>
          </div>

          {/* Image Generation Chain */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Routing Image Generation</span>
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Fallback Priority
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-fuchsia-800/40">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-fuchsia-950 text-fuchsia-400 font-mono font-bold flex items-center justify-center text-[10px] border border-fuchsia-700">
                    1
                  </span>
                  <div>
                    <span className="font-semibold text-white">GPT-Image-2 (Apimart)</span>
                    <p className="text-[10px] text-slate-400">gpt-image-2-turbo, gpt-image-2-hd</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-fuchsia-400 bg-fuchsia-950/60 px-2 py-0.5 rounded border border-fuchsia-800/60">
                  PRIMARY
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-indigo-800/40">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 font-mono font-bold flex items-center justify-center text-[10px] border border-indigo-700">
                    2
                  </span>
                  <div>
                    <span className="font-semibold text-white">OpenRouter Image Gateway</span>
                    <p className="text-[10px] text-slate-400">FLUX.1 Schnell, Stable Diffusion 3</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                  FALLBACK 1
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-emerald-800/40">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 font-mono font-bold flex items-center justify-center text-[10px] border border-emerald-700">
                    3
                  </span>
                  <div>
                    <span className="font-semibold text-white">NVIDIA NIM Visual AI</span>
                    <p className="text-[10px] text-slate-400">stabilityai/stable-diffusion-xl</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  FALLBACK 2
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Platform Tokens</span>
            <div className="p-2 bg-emerald-950/60 border border-emerald-800/40 rounded-lg text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-3 font-mono">
            {isLoading ? '...' : (analytics?.totalTokens !== undefined ? analytics.totalTokens.toLocaleString() : '0')}
          </p>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
            <span>Bulan Berjalan (MTD)</span>
            <span className="font-mono text-emerald-400">
              Prompt: {analytics?.promptTokens ? analytics.promptTokens.toLocaleString() : '0'}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total LLM Cost (USD)</span>
            <div className="p-2 bg-indigo-950/60 border border-indigo-800/40 rounded-lg text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-3 font-mono">
            ${isLoading ? '...' : (analytics?.totalCostUsd !== undefined ? analytics.totalCostUsd.toFixed(2) : '0.00')}
          </p>
          <div className="flex items-center text-[11px] text-emerald-400 mt-2 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
            <span>Routing: NIM Primary • OpenRouter Fallback</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Cost per 1K Tokens</span>
            <div className="p-2 bg-purple-950/60 border border-purple-800/40 rounded-lg text-purple-400">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-3 font-mono">
            {analytics && analytics.totalTokens > 0
              ? `$${((analytics.totalCostUsd / analytics.totalTokens) * 1000).toFixed(4)}`
              : '$0.0000'}
          </p>
          <p className="text-[11px] text-slate-400 mt-2">Efisiensi NIM Multi-Microservice</p>
        </div>
      </div>

      {/* Section Navigation Tabs (Domain 16: Step 1.4) */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'tenants'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Tenant Token Breakdown (/admin/usage-analytics)</span>
        </button>

        <button
          onClick={() => setActiveTab('platform_llm')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'platform_llm'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Platform-Wide LLM Providers (/admin/llm-usage)</span>
        </button>

        <button
          onClick={() => setActiveTab('service_metering')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'service_metering'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Service Metering (/admin/usage)</span>
        </button>
      </div>

      {/* TAB 1: Tenant Breakdown Table with Provider Filter */}
      {activeTab === 'tenants' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white text-sm">Tenant Token & Cost Breakdown</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Rincian konsumsi unit token per organisasi tenant berdasarkan routing model aktif.
              </p>
            </div>

            {/* Provider Filter Dropdown: STRICTLY NO OpenAI or Google Gemini */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Filter Provider:</label>
              <select
                value={selectedProviderFilter}
                onChange={(e) => setSelectedProviderFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {activeProviders.map((prov) => (
                  <option key={prov.id} value={prov.id}>
                    {prov.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-6">Tenant ID</th>
                <th className="py-3 px-6">Routing Provider</th>
                <th className="py-3 px-6">Token Consumed</th>
                <th className="py-3 px-6">Estimated Cost (USD)</th>
                <th className="py-3 px-6 text-right">Avg Cost / 1k Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs">
              {filteredBreakdown.length > 0 ? (
                filteredBreakdown.map((b, idx) => {
                  const tokenVal = b.tokens ?? b.totalTokens ?? 0;
                  const costVal = b.costUsd ?? b.totalCostUsd ?? 0;
                  const tenantLabel = b.tenant || b.tenantName || b.tenantId || `tenant-${idx + 1}`;
                  const providerLabel = b.provider || 'NVIDIA NIM (Prioritas 1)';
                  return (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-6 font-mono text-slate-200">{tenantLabel}</td>
                      <td className="py-3.5 px-6">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                          {providerLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 font-mono text-indigo-400">{tokenVal.toLocaleString()}</td>
                      <td className="py-3.5 px-6 font-mono text-emerald-400">${costVal.toFixed(2)}</td>
                      <td className="py-3.5 px-6 text-right font-semibold text-slate-300">
                        {tokenVal > 0 ? `$${((costVal / tokenVal) * 1000).toFixed(4)}` : '$0.0000'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 px-6 text-center text-slate-500">
                    {isLoading
                      ? 'Memuat data konsumsi token...'
                      : 'Tidak ada data konsumsi token tenant yang sesuai dengan filter'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="p-4 bg-slate-950/40 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Terakhir diperbarui: {lastRefreshedAt}</span>
            </span>
            <span className="text-[11px] text-slate-500">
              Sumber Data: Endpoint <code className="text-slate-400 font-mono">/admin/usage-analytics</code>
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: Platform-Wide LLM Usage (/admin/analytics/llm-usage-platform-wide & /admin/llm-usage) */}
      {activeTab === 'platform_llm' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>Platform-Wide LLM Routing & Provider Telemetry</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Endpoint: <code className="text-indigo-300 font-mono">GET /admin/llm-usage</code> & <code className="text-indigo-300 font-mono">/admin/analytics/llm-usage-platform-wide</code>
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                Active Provider Chain
              </span>
            </div>

            {/* Provider Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">Total Prompt Tokens</span>
                <p className="text-xl font-bold font-mono text-white mt-1">
                  {(adminLlmUsageSummary?.totalPromptTokens ?? platformLlmUsage?.promptTokens ?? 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-slate-500 mt-1 block">Inbound Context</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">Total Completion Tokens</span>
                <p className="text-xl font-bold font-mono text-indigo-400 mt-1">
                  {(adminLlmUsageSummary?.totalCompletionTokens ?? platformLlmUsage?.completionTokens ?? 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-slate-500 mt-1 block">Generated Output</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">Total Incurred Cost</span>
                <p className="text-xl font-bold font-mono text-emerald-400 mt-1">
                  ${(adminLlmUsageSummary?.totalCostUsd ?? platformLlmUsage?.totalCostUsd ?? 0).toFixed(2)}
                </p>
                <span className="text-[10px] text-slate-500 mt-1 block">NIM & OpenRouter Billed</span>
              </div>
            </div>

            {/* Providers Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-[11px] font-semibold text-slate-400 uppercase border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Provider / Engine</th>
                    <th className="py-3 px-4">Model Code</th>
                    <th className="py-3 px-4 text-center">Permintaan (Req)</th>
                    <th className="py-3 px-4 text-center">Token</th>
                    <th className="py-3 px-4 text-right">Biaya (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(adminLlmUsageSummary?.providers || platformLlmUsage?.providers || []).length > 0 ? (
                    (adminLlmUsageSummary?.providers || platformLlmUsage?.providers || []).map((p: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-medium text-white">{p.provider || p.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{p.model || 'multi-routing'}</td>
                        <td className="py-3 px-4 text-center font-mono text-slate-300">{p.requests?.toLocaleString() ?? '-'}</td>
                        <td className="py-3 px-4 text-center font-mono text-indigo-400">{p.tokens?.toLocaleString() ?? 0}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400">${(p.costUsd ?? p.cost ?? 0).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        {isLoading ? 'Memuat data provider LLM...' : 'Belum ada data pemakaian provider spesifik yang tercatat.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Platform Service Metering (/admin/usage) */}
      {activeTab === 'service_metering' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span>Super Admin Platform Service Metering Summary</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Endpoint: <code className="text-purple-300 font-mono">GET /admin/usage</code> • Agregasi beban layanan mikro platform.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
              Period: {adminUsageSummary?.period || 'Bulan Berjalan'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400">Total Permintaan (Requests)</span>
              <p className="text-xl font-bold font-mono text-white mt-1">
                {(adminUsageSummary?.totalRequests ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400">Total Unit Token</span>
              <p className="text-xl font-bold font-mono text-indigo-400 mt-1">
                {(adminUsageSummary?.totalTokens ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400">Total Biaya Platform</span>
              <p className="text-xl font-bold font-mono text-emerald-400 mt-1">
                ${(adminUsageSummary?.totalCostUsd ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400">Tenant Aktif</span>
              <p className="text-xl font-bold font-mono text-amber-400 mt-1">
                {adminUsageSummary?.activeTenants ?? 0}
              </p>
            </div>
          </div>

          {/* By Service Breakdown */}
          {adminUsageSummary?.byService && Object.keys(adminUsageSummary.byService).length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Konsumsi per Layanan Mikro</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Object.entries(adminUsageSummary.byService).map(([svcName, svcData]: [string, any]) => (
                  <div key={svcName} className="p-3 bg-slate-950/50 rounded-lg border border-slate-800">
                    <span className="font-semibold text-white text-xs block capitalize">{svcName}</span>
                    <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                      <span>Requests: {svcData.requests?.toLocaleString() || 0}</span>
                      <span className="text-emerald-400 font-mono">${(svcData.costUsd || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default UsageCostDashboardScreen;
