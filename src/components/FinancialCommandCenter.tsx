import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  CreditCard,
  Building2,
  FileText,
  Activity,
  ArrowUpRight,
  ExternalLink,
  Crown,
  Settings,
  X,
  PieChart,
  Zap,
} from 'lucide-react';

interface PlanDistributionItem {
  plan_code: string;
  count: number;
}

interface TopCreditConsumer {
  tenant_id: string;
  name: string;
  plan_code: string;
  total_credits_used: number;
  total_spent_idr?: number;
}

interface RevenueProjection {
  mrr_idr: number;
  topup_revenue_idr: number;
  projected_monthly_revenue_idr: number;
}

interface CommandCenterSummary {
  total_tenants_tracked: number;
  total_circulating_credits: number;
  total_reserved_credits: number;
  net_available_credits: number;
  total_invoices_issued: number;
  total_paid_invoices: number;
  total_revenue_collected_idr: number;
  low_balance_tenant_count: number;
  mrr_idr?: number;
  plan_distribution?: Record<string, number>;
  top_credit_consumers?: TopCreditConsumer[];
  revenue_projection?: RevenueProjection;
}

interface TenantWalletRow {
  tenant_id: string;
  tenant_name: string;
  legal_name?: string;
  plan_code: string;
  balance: number;
  reserved_balance: number;
  available_balance: number;
  currency: string;
  is_low_balance: boolean;
  low_balance_threshold: number;
  updated_at: string;
}

interface ReconciliationLogRow {
  id: string;
  gateway: string;
  invoice_id: string;
  event_type: string;
  raw_payload_snippet: string;
  signature_verified: boolean;
  status: string;
  created_at: string;
}

export function FinancialCommandCenter() {
  const [summary, setSummary] = useState<CommandCenterSummary | null>(null);
  const [tenantWallets, setTenantWallets] = useState<TenantWalletRow[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterLowBalanceOnly, setFilterLowBalanceOnly] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'wallets' | 'reconciliations'>('wallets');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Override Modal State
  const [overrideModalTenant, setOverrideModalTenant] = useState<TenantWalletRow | null>(null);
  const [isUnlimited, setIsUnlimited] = useState<boolean>(false);
  const [unlimitedReason, setUnlimitedReason] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);

  const fetchCommandCenterData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/command-center', {
        headers: {
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || errData.error || 'Akses ditolak atau gagal memuat data.');
      }

      const data = await res.json();
      setSummary(data.summary);
      setTenantWallets(data.tenant_wallets || []);
      setReconciliations(data.recent_reconciliations || []);
    } catch (err: any) {
      console.error('Error fetching financial command center:', err);
      setErrorMessage(err.message || 'Gagal memuat data Financial Command Center.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommandCenterData();
  }, []);

  const handleOpenOverrideModal = (wallet: TenantWalletRow) => {
    setOverrideModalTenant(wallet);
    setIsUnlimited(false);
    setUnlimitedReason('');
  };

  const handleSubmitOverride = async () => {
    if (!overrideModalTenant) return;
    if (isUnlimited && !unlimitedReason.trim()) {
      setErrorMessage('Alasan override wajib diisi ketika mengaktifkan unlimited override (PRD v2.2 Bagian 14).');
      return;
    }

    setOverrideSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/tenant-subscriptions/override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify({
          tenant_id: overrideModalTenant.tenant_id,
          is_unlimited_override: isUnlimited,
          unlimited_reason: isUnlimited ? unlimitedReason : null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.detail || resData.error || 'Gagal menyimpan status override.');
      }

      setActionFeedback(`Status override organisasi ${overrideModalTenant.tenant_name} berhasil diperbarui.`);
      setOverrideModalTenant(null);
      fetchCommandCenterData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses override.');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const filteredWallets = tenantWallets.filter((w) => {
    const matchesSearch =
      w.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.tenant_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.plan_code && w.plan_code.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLowBalance = filterLowBalanceOnly ? w.is_low_balance : true;
    return matchesSearch && matchesLowBalance;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-blue-400 border border-blue-500/30">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Financial Command Center & Audit Solvabilitas
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Super Admin View
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Pusat pengawasan likuiditas kredit sirkulasi, rekonsiliasi gateway, dan integritas neraca multi-tenant
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchCommandCenterData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Perbarui Neraca
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs text-emerald-400 hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Global Liquidity & Revenue Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* MRR Recurring Revenue */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>MRR (Monthly Recurring)</span>
            <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 tracking-tight font-mono">
            {formatCurrency(summary?.mrr_idr || 0)}
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Pendapatan berulang dari langganan aktif
          </div>
        </div>

        {/* Projected Monthly Revenue */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Proyeksi Revenue Bulanan</span>
            <span className="p-1 rounded-lg bg-teal-500/10 text-teal-400">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight font-mono">
            {formatCurrency(summary?.revenue_projection?.projected_monthly_revenue_idr || summary?.total_revenue_collected_idr || 0)}
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Agregat MRR + top-up kredit bulan berjalan
          </div>
        </div>

        {/* Total Circulating Credits */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Kredit Beredar (Circulating)</span>
            <span className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight font-mono">
            {formatCurrency(summary?.total_circulating_credits || 0)}
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Total liabilitas di {summary?.total_tenants_tracked || 0} tenant
          </div>
        </div>

        {/* Net Available Credits */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Kredit Bersih Tersedia</span>
            <span className="p-1 rounded-lg bg-blue-500/10 text-blue-400">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight font-mono">
            {formatCurrency(summary?.net_available_credits || 0)}
          </div>
          <div className="mt-3 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Solvabilitas likuiditas aman
          </div>
        </div>
      </div>

      {/* Aggregate Panels: Plan Distribution & Top Credit Consumers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Plan Distribution */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>Distribusi Organisasi per Tingkatan Paket</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">Data Terkini</span>
          </div>
          {summary?.plan_distribution && Object.keys(summary.plan_distribution).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(summary.plan_distribution).map(([planCode, count]) => {
                const total = summary.total_tenants_tracked || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={planCode} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300 font-mono uppercase">{planCode}</span>
                      <span className="font-mono text-slate-400">
                        {count} organisasi ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 5)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-3">Belum ada distribusi paket tercatat.</p>
          )}
        </div>

        {/* Top Credit Consumers */}
        <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <span>Top Konsumen Kredit Platform</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">Berdasarkan Alokasi</span>
          </div>
          {summary?.top_credit_consumers && summary.top_credit_consumers.length > 0 ? (
            <div className="space-y-2.5">
              {summary.top_credit_consumers.slice(0, 5).map((consumer, idx) => (
                <div
                  key={consumer.tenant_id || idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-mono text-[10px] font-bold">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-white">{consumer.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{consumer.plan_code}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-emerald-400">
                      {consumer.total_credits_used?.toLocaleString('id-ID')} Kredit
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-3">Belum ada aktivitas konsumsi kredit tercatat.</p>
          )}
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pt-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('wallets')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeSubTab === 'wallets'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Dompet Organisasi ({filteredWallets.length})
          </button>

          <button
            onClick={() => setActiveSubTab('reconciliations')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeSubTab === 'reconciliations'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            Audit Rekonsiliasi Webhook Gateway ({reconciliations.length})
          </button>
        </div>

        {activeSubTab === 'wallets' && (
          <div className="flex items-center gap-3 pb-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari organisasi..." // allowlist: atribut input HTML
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
              />
            </div>

            <button
              onClick={() => setFilterLowBalanceOnly(!filterLowBalanceOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                filterLowBalanceOnly
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>Hanya Saldo Rendah</span>
            </button>
          </div>
        )}
      </div>

      {/* Sub Tab: Wallets Table */}
      {activeSubTab === 'wallets' && (
        <div className="bg-[#0E1726] rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Organisasi / ID</th>
                  <th className="py-3 px-4 font-semibold">Paket Langganan</th>
                  <th className="py-3 px-4 font-semibold text-right">Saldo Total</th>
                  <th className="py-3 px-4 font-semibold text-right">Direservasi</th>
                  <th className="py-3 px-4 font-semibold text-right">Saldo Tersedia</th>
                  <th className="py-3 px-4 font-semibold text-center">Status Ambang</th>
                  <th className="py-3 px-4 font-semibold text-center">Aksi / Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredWallets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                      Tidak ada dompet organisasi yang sesuai kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredWallets.map((w) => (
                    <tr key={w.tenant_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{w.tenant_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{w.tenant_id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-800/60">
                          {w.plan_code || 'FREE_TRIAL'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-white whitespace-nowrap">
                        {formatCurrency(w.balance)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-amber-400 whitespace-nowrap">
                        {formatCurrency(w.reserved_balance)}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-emerald-400 whitespace-nowrap">
                        {formatCurrency(w.available_balance)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {w.is_low_balance ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="w-3 h-3" /> Mendekati Ambang
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Normal
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenOverrideModal(w)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                        >
                          <Crown className="w-3 h-3" /> Override Unlimited
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub Tab: Reconciliations Table */}
      {activeSubTab === 'reconciliations' && (
        <div className="bg-[#0E1726] rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Catatan Rekonsiliasi Webhook Gateway</h3>
              <p className="text-xs text-slate-400">Verifikasi tanda tangan kriptografis webhook payment gateway</p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-900 text-slate-400">
              Total Log: {reconciliations.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Waktu Diterima</th>
                  <th className="py-3 px-4 font-semibold">Payment Gateway</th>
                  <th className="py-3 px-4 font-semibold">ID Faktur / Order</th>
                  <th className="py-3 px-4 font-semibold">Tipe Kejadian</th>
                  <th className="py-3 px-4 font-semibold text-center">Tanda Tangan Terverifikasi</th>
                  <th className="py-3 px-4 font-semibold">Status Pemrosesan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {reconciliations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      Belum ada log rekonsiliasi pembayaran webhook yang tercatat.
                    </td>
                  </tr>
                ) : (
                  reconciliations.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {formatDate(rec.created_at)}
                      </td>
                      <td className="py-3 px-4 uppercase font-semibold text-white">
                        {rec.gateway}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-400">
                        {rec.invoice_id}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {rec.event_type}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {rec.signature_verified ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck className="w-3 h-3" /> Valid (Verified)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" /> Tidak Valid
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-200">
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {overrideModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0E1726] border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  Kelola Unlimited Override
                </h3>
              </div>
              <button
                onClick={() => setOverrideModalTenant(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-400">
                Organisasi: <span className="font-bold text-white">{overrideModalTenant.tenant_name}</span> ({overrideModalTenant.tenant_id})
              </p>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isUnlimited}
                  onChange={(e) => setIsUnlimited(e.target.checked)}
                  className="mt-0.5 rounded text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <div className="text-xs font-bold text-white">Aktifkan Unlimited Override</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    Organisasi dapat mengeksekusi tugas tanpa batasan saldo kredit. Seluruh mutasi tetap tercatat di buku besar audit.
                  </div>
                </div>
              </label>

              {isUnlimited && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Alasan Override <span className="text-rose-400">*Wajib</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Contoh: Kesepakatan Enterprise Khusus / Akun Mitra Strategis Q4" // allowlist: atribut input HTML
                    value={unlimitedReason}
                    onChange={(e) => setUnlimitedReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setOverrideModalTenant(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitOverride}
                disabled={overrideSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {overrideSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { FinancialCommandCenter as FinancialCommandCenterScreen };
