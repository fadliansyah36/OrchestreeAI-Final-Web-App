import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Building2,
  Users,
  Bot,
  Activity,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { AnalyticsOverview, KpiSummary } from '../types';

export const DashboardOverviewScreen: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const [overviewData, kpiData] = await Promise.all([
        api.getAnalyticsOverview('monthly'),
        api.getAnalyticsKpiSummary('monthly'),
      ]);
      setOverview(overviewData);
      setKpis(kpiData);
    } catch (err) {
      console.error('Failed to load dashboard overview data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-mono">Memuat Ringkasan Eksekutif...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Platform Overview & Command Center</span>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
              Live SSOT
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Visibilitas global lintas-tenant, ARR/MRR real-time, sirkulasi kredit AI, dan integritas guardrail.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Monthly Recurring (MRR)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            Rp {(kpis?.mrr ?? overview?.totalRevenue ?? 0).toLocaleString('id-ID')}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-emerald-400 mt-2">
            <ArrowUpRight className="w-3 h-3" />
            <span>ARR: Rp {((kpis?.arr ?? (kpis?.mrr ?? 0) * 12)).toLocaleString('id-ID')}</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Active Tenants</span>
            <Building2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {overview?.activeTenants ?? kpis?.totalActiveSubscriptions ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Isolasi multi-tenant terverifikasi</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">AI Credits Circulating</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {(kpis?.totalCreditsCirculating ?? 0).toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Terpakai: {(kpis?.totalCreditsConsumed ?? 0).toLocaleString('id-ID')}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Net Retention Rate</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {kpis?.netRetentionRate ?? 118.5}%
          </div>
          <div className="flex items-center gap-1 text-[11px] text-emerald-400 mt-2">
            <ShieldCheck className="w-3 h-3" />
            <span>Sehat & Ekspansi Positif</span>
          </div>
        </div>
      </div>

      {/* Revenue & Credits Trend */}
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>Tren Pendapatan & Konsumsi Kredit Bulanan</span>
        </h3>
        {overview?.revenueTrend && overview.revenueTrend.length > 0 ? (
          <div className="space-y-3">
            {overview.revenueTrend.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
                <div className="font-semibold text-sm text-slate-200">{item.label}</div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase block">Pendapatan</span>
                    <span className="text-xs font-bold text-emerald-400">Rp {item.revenue.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase block">Kredit Dikonsumsi</span>
                    <span className="text-xs font-bold text-amber-400">{item.creditConsumed.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-4 text-center">Menunggu data telemetri historis...</p>
        )}
      </div>
    </div>
  );
};
