import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  Cpu,
  Database,
  TrendingUp,
  CreditCard,
  Layers,
  Sparkles,
  ArrowUpRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  RefreshCw,
  Search,
  Key,
  Terminal,
  Compass,
  Zap,
  Users
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { EmptyState } from '@orchestree/ui';

export interface AdminOverviewScreenProps {
  onNavigateDetail?: (target: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export function AdminOverviewScreen({
  onNavigateDetail,
  onNavigateTab
}: AdminOverviewScreenProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hubData, setHubData] = useState<{
    tenants: { total: number; active: number; trial: number };
    prospects: { total: number; selected: number; active_trials: number; scheduled_meetings: number };
    trial_slots: { capacity: number; available: number; reserved: number; allocated: number; duration_days: number };
  } | null>(null);

  const [financeData, setFinanceData] = useState<{
    wallet_balance?: number;
    currency?: string;
    total_revenue?: number;
  } | null>(null);

  const [providersList, setProvidersList] = useState<Array<{
    provider: string;
    status: string;
    latency_ms?: number;
    health?: string;
  }>>([]);

  const fetchData = async () => {
    setError(null);
    try {
      const [hubRes, finRes, provRes] = await Promise.all([
        fetch('/api/v1/admin/hub-overview'),
        fetch('/api/v1/financial-command-center'),
        fetch('/api/v1/admin/llm-providers')
      ]);

      if (hubRes.ok) {
        const hubJson = await hubRes.json();
        setHubData(hubJson);
      }
      if (finRes.ok) {
        const finJson = await finRes.json();
        setFinanceData(finJson);
      }
      if (provRes.ok) {
        const provJson = await provRes.json();
        if (Array.isArray(provJson)) {
          setProvidersList(provJson);
        } else if (provJson.providers && Array.isArray(provJson.providers)) {
          setProvidersList(provJson.providers);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data konsol kendali platform');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatCurrency = (val?: number, curr = 'IDR') => {
    if (val === undefined || val === null) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 0
    }).format(val);
  };

  const totalTenants = hubData?.tenants.total ?? 0;
  const activeTenants = hubData?.tenants.active ?? 0;
  const availableSlots = hubData?.trial_slots.available ?? 0;
  const totalCapacity = hubData?.trial_slots.capacity ?? 36;
  const occupancyPct = totalCapacity > 0 ? Math.round(((totalCapacity - availableSlots) / totalCapacity) * 100) : 0;

  return (
    <div className="space-y-6 pb-24 w-full min-w-0">
      {/* Super Admin Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight truncate">
                Konsol Kendali Super Admin
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                <CheckCircle2 className="w-3 h-3" /> Sistem Terkoneksi
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Pemantauan terpusat kesehatan platform, ekosistem organisasi, dan perutean model
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Muat ulang telemetri"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Perbarui</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateDetail?.('startup_gate')}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Gerbang Kesiapan</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: GRADIENT HERO CARD STATISTIK SUPER ADMIN */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#071324] via-[#0D1D38] to-[#122B52] text-white p-6 md:p-8 shadow-lg border border-slate-700/50">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
              <Activity className="w-4 h-4" />
              <span>Status Operasional Platform Global</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white leading-tight">
              Ekosistem Multi-Tenant &amp; Tata Kelola Model
            </h2>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed max-w-xl">
              Seluruh node perutean model, penyimpanan semantik, dan integritas transaksi ledger beroperasi secara persisten pada instance Supabase.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                <span className="text-[11px] text-slate-300 block">Total Organisasi</span>
                <span className="text-lg font-bold text-white mt-0.5 block">
                  {loading ? '...' : totalTenants}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                <span className="text-[11px] text-slate-300 block">Organisasi Aktif</span>
                <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
                  {loading ? '...' : activeTenants}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                <span className="text-[11px] text-slate-300 block">Slot Uji Coba</span>
                <span className="text-lg font-bold text-sky-400 mt-0.5 block">
                  {loading ? '...' : `${availableSlots}/${totalCapacity}`}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                <span className="text-[11px] text-slate-300 block">Okupansi Slot</span>
                <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
                  {loading ? '...' : `${occupancyPct}%`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm text-center">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 mb-2">
              <CreditCard className="w-6 h-6" />
            </div>
            <span className="text-xs text-slate-300 uppercase tracking-wider font-semibold">
              Saldo Rekonsiliasi Ledger
            </span>
            <span className="text-xl font-bold text-white mt-1">
              {loading ? '...' : formatCurrency(financeData?.wallet_balance ?? financeData?.total_revenue, financeData?.currency)}
            </span>
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Audit Ledger Aktif
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: AKSI CEPAT SUPER ADMIN */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Aksi Cepat Platform
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => onNavigateDetail?.('admin_tenants')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-blue-500/50 text-left transition-all hover:shadow-md group cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                <Building2 className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              Kelola Organisasi Tenant
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              Tinjau status langganan, kuota kredit, dan konfigurasi organisasi
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateDetail?.('admin_agent_catalog')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-blue-500/50 text-left transition-all hover:shadow-md group cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                <Layers className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              Audit Blueprint Agen
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              Validasi kepatuhan paket blueprint dan rilis bertahap
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateDetail?.('admin_finance')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-blue-500/50 text-left transition-all hover:shadow-md group cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <CreditCard className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              Pusat Komando Finansial
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              Pantau arus kas transaksi, alokasi saldo, dan konsumsi kredit
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateDetail?.('admin_mfa')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-blue-500/50 text-left transition-all hover:shadow-md group cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                <Key className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              Konsol Keamanan &amp; MFA
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              Pemberlakuan multi-faktor dan pelacakan audit akses administratif
            </p>
          </button>
        </div>
      </div>

      {/* SECTION 3: STATUS MODEL ROUTER & PENYEDIA TUNGGAL */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Status Penyedia Model Router Terpadu
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hierarki Failover Otonom: NVIDIA NIM → OpenRouter → Gemini → GPT-Image-2
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 self-start sm:self-auto">
            Otorisasi PDP Terverifikasi
          </span>
        </div>

        {providersList.length === 0 ? (
          <EmptyState
            title="Belum Ada Telemetri Penyedia Model"
            description="Status penyedia akan tercatat saat panggilan model router aktif atau pengujian kesehatan dijalankan."
            actionLabel="Buka Perutean Model"
            onAction={() => onNavigateDetail?.('admin_model_routing')}
            icon={Cpu}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {providersList.map((p, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      {p.provider}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {p.latency_ms ? `${p.latency_ms}ms` : 'Aktif'}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {p.status || 'READY'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
