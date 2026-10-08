import { apiClient } from '@orchestree/api-client';
import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  PieChart,
  ArrowUpRight,
  RefreshCw,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface RevenueSummary {
  total_revenue: number;
  total_paid_orders: number;
  average_order_value: number;
  conversion_rate: number;
  channel_attribution: Array<{
    channel_type: string;
    order_count: number;
    total_revenue: number;
    percentage: number;
  }>;
  agent_attribution: Array<{
    assigned_type: 'AI' | 'HUMAN';
    agent_id?: string;
    agent_name?: string;
    order_count: number;
    total_revenue: number;
    percentage: number;
  }>;
  recent_attributed_orders: Array<{
    order_id: string;
    order_number: string;
    customer_name?: string;
    channel_type?: string;
    total_amount: number;
    paid_at?: string;
    first_touch_conversation_id?: string;
  }>;
}

export function RevenueIntelligenceScreen({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRevenueData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/revenue-intelligence/attribution`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal memuat analitik pendapatan.');
      }
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevenueData();
  }, [tenantId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Revenue Intelligence & First-Touch Attribution
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Live Real Data
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Atribusi pendapatan presisi dari sentuhan awal percakapan hingga pembayaran tervalidasi webhook.
          </p>
        </div>

        <button
          onClick={fetchRevenueData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Segarkan Data
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Pendapatan Terverifikasi
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              Rp {data ? Number(data.total_revenue).toLocaleString('id-ID') : '0'}
            </span>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Status Pembayaran Terverifikasi (PAID/SETTLEMENT)</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pesanan Terbayar
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {data ? data.total_paid_orders : '0'} Transaksi
            </span>
            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Selesai & diselesaikan</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Rata-rata Nilai Pesanan (AOV)
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              Rp {data ? Math.round(data.average_order_value).toLocaleString('id-ID') : '0'}
            </span>
            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Rata-rata transaksi pelanggan</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tingkat Konversi Lead-to-Sale
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <PieChart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {data ? data.conversion_rate : '0'}%
            </span>
            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Percakapan pertama ke order lunas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Attribution Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Attribution */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Atribusi Berdasarkan Kanal Komunikasi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Porsi nilai penjualan dari pintu masuk kontak awal pelanggan
              </p>
            </div>
            <span className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              First-Touch
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {(!data || data.channel_attribution.length === 0) ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Belum ada transaksi atribusi pada kanal komunikasi.
              </div>
            ) : (
              data.channel_attribution.map((ch, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                      {ch.channel_type} ({ch.order_count} pesanan)
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Rp {Number(ch.total_revenue).toLocaleString('id-ID')} ({ch.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, Math.min(100, ch.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Agent / Human Attribution */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Atribusi Penanganan (AI Assistant vs Spesialis Manusia)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kontribusi tim AI otonom dibandingkan tim sales spesialis manusia
              </p>
            </div>
            <Users className="w-4 h-4 text-slate-400" />
          </div>

          <div className="mt-4 space-y-4">
            {(!data || data.agent_attribution.length === 0) ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Belum ada data penanganan transaksi.
              </div>
            ) : (
              data.agent_attribution.map((ag, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-700 dark:text-slate-200">
                      {ag.agent_name} ({ag.assigned_type}) - {ag.order_count} pesanan
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Rp {Number(ag.total_revenue).toLocaleString('id-ID')} ({ag.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        ag.assigned_type === 'AI' ? 'bg-indigo-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${Math.max(5, Math.min(100, ag.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Attributed Orders Ledger */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Daftar Pesanan Teratribusi Nyata
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit jejak transaksi terverifikasi dengan koneksi ke percakapan pembuka
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="pb-3 font-semibold">Nomor Pesanan</th>
                <th className="pb-3 font-semibold">Pelanggan</th>
                <th className="pb-3 font-semibold">Kanal Awal</th>
                <th className="pb-3 font-semibold">Total Terbayar</th>
                <th className="pb-3 font-semibold">Waktu Pelunasan</th>
                <th className="pb-3 font-semibold">Status Atribusi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {(!data || data.recent_attributed_orders.length === 0) ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Belum ada riwayat pesanan dengan pembayaran tervalidasi.
                  </td>
                </tr>
              ) : (
                data.recent_attributed_orders.map((ord) => (
                  <tr key={ord.order_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 font-mono font-medium text-slate-900 dark:text-white">
                      {ord.order_number}
                    </td>
                    <td className="py-3">{ord.customer_name}</td>
                    <td className="py-3 uppercase">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        {ord.channel_type || 'Direct'}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                      Rp {Number(ord.total_amount).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 text-slate-500 dark:text-slate-400">
                      {ord.paid_at ? new Date(ord.paid_at).toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Tervalidasi Webhook
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
