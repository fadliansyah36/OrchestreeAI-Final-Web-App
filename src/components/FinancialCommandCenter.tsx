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
} from 'lucide-react';

interface CommandCenterSummary {
  total_tenants_tracked: number;
  total_circulating_credits: number;
  total_reserved_credits: number;
  net_available_credits: number;
  total_invoices_issued: number;
  total_paid_invoices: number;
  total_revenue_collected_idr: number;
  low_balance_tenant_count: number;
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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
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

  const filteredWallets = tenantWallets.filter((tw) => {
    const matchesSearch =
      (tw.tenant_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tw.tenant_id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterLowBalanceOnly ? tw.is_low_balance : true;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Pusat Kendali Keuangan & Rekonsiliasi Gateway
              </h2>
              <p className="text-xs text-slate-400">
                Agregasi saldo multi-tenant, rekonsiliasi webhook payment gateway, dan audit likuiditas kredit platform
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchCommandCenterData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Perbarui Rekonsiliasi
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Circulating Credits */}
        <div className="p-5 rounded-2xl bg-[#0E1726] border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Total Saldo Beredar</span>
            <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight">
            {formatCurrency(summary?.total_circulating_credits || 0)}
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Dari {summary?.total_tenants_tracked || 0} organisasi terdaftar
          </div>
        </div>

        {/* Total Reserved Credits */}
        <div className="p-5 rounded-2xl bg-[#0E1726] border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Kredit Direservasi (In-Flight)</span>
            <span className="p-1 rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight">
            {formatCurrency(summary?.total_reserved_credits || 0)}
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Terkunci selama eksekusi model & alat
          </div>
        </div>

        {/* Net Available Credits */}
        <div className="p-5 rounded-2xl bg-[#0E1726] border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Kredit Bersih Tersedia</span>
            <span className="p-1 rounded-lg bg-blue-500/10 text-blue-400">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight">
            {formatCurrency(summary?.net_available_credits || 0)}
          </div>
          <div className="mt-3 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Solvabilitas likuiditas terjaga
          </div>
        </div>

        {/* Total Revenue Collected */}
        <div className="p-5 rounded-2xl bg-[#0E1726] border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Total Pendapatan Diterima</span>
            <span className="p-1 rounded-lg bg-teal-500/10 text-teal-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight">
            {formatCurrency(summary?.total_revenue_collected_idr || 0)}
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            {summary?.total_paid_invoices || 0} faktur lunas dari {summary?.total_invoices_issued || 0} terbit
          </div>
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
                  <th className="py-3 px-4 font-semibold">Terakhir Diperbarui</th>
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
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {formatDate(w.updated_at)}
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
    </div>
  );
}
