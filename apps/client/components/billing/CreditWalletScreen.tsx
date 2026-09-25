import React from 'react';
import {
  Wallet,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  Clock,
  Sparkles,
  TrendingDown,
  Layers,
  CheckCircle2,
} from 'lucide-react';

export interface WalletSummary {
  available: number;
  reserved: number;
  used_this_cycle: number;
  total_allocated_this_cycle: number;
  is_unlimited: boolean;
  low_balance_warning: boolean;
  balance?: number;
  low_balance_threshold?: number;
  currency?: string;
}

interface CreditWalletScreenProps {
  summary: WalletSummary | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenTopUp: () => void;
  onNavigateToTab: (tab: 'plans' | 'calculator' | 'transactions' | 'invoices') => void;
}

export function CreditWalletScreen({
  summary,
  loading,
  onRefresh,
  onOpenTopUp,
  onNavigateToTab,
}: CreditWalletScreenProps) {
  const available = summary?.available ?? 0;
  const reserved = summary?.reserved ?? 0;
  const usedThisCycle = summary?.used_this_cycle ?? 0;
  const totalAllocated = summary?.total_allocated_this_cycle ?? 50000;
  const isUnlimited = summary?.is_unlimited ?? false;
  const lowBalanceThreshold = summary?.low_balance_threshold ?? 50000;
  const isLowBalance = summary?.low_balance_warning || (available <= lowBalanceThreshold && !isUnlimited);

  // Perhitungan persentase alokasi yang digunakan
  const usagePercentage = totalAllocated > 0
    ? Math.min(100, Math.round((usedThisCycle / totalAllocated) * 100))
    : 0;

  const availablePercentage = totalAllocated > 0
    ? Math.min(100, Math.round((available / totalAllocated) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Peringatan Saldo Rendah */}
      {isLowBalance && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-3 text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-amber-300">
                Peringatan Batas Saldo Minimum Operasional
              </h4>
              <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                Saldo kredit AI yang tersedia ({available.toLocaleString('id-ID')} AI Credits) berada di bawah ambang batas aman ({lowBalanceThreshold.toLocaleString('id-ID')} AI Credits). Segera lakukan penambahan kredit agar eksekusi agen cerdas dan alur kerja terjadwal tidak terhenti.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenTopUp}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
          >
            Isi Saldo Sekarang
          </button>
        </div>
      )}

      {/* Hero Card: Saldo Utama & Metrik Display */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:p-8 relative overflow-hidden shadow-xl">
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-slate-400 text-xs font-medium uppercase tracking-wider">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span>Dompet Kredit AI Organisasi</span>
                {isUnlimited && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-semibold">
                    Akun Kuota Bebas
                  </span>
                )}
              </div>
              <h2 className="text-2xl lg:text-3xl font-bold text-white mt-1">
                Ikhtisar Saldo Operasional
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onRefresh}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700 disabled:opacity-50"
                title="Perbarui Data Dompet"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Perbarui</span>
              </button>

              <button
                onClick={onOpenTopUp}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-semibold rounded-lg transition-colors shadow-lg shadow-emerald-500/10"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Tambah Kredit AI</span>
              </button>
            </div>
          </div>

          {/* 4 Pilar Format Credit Display: Available / Reserved / Used / Total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {/* 1. Saldo Tersedia (Available) */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 relative">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="font-medium text-slate-300">Saldo Tersedia (Available)</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-400 tracking-tight">
                {isUnlimited ? '∞' : available.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>Satuan Operasional:</span>
                <span className="font-semibold text-slate-300">AI Credits</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                Siap dikonsumsi untuk alur kerja dan agen cerdas
              </div>
            </div>

            {/* 2. Kredit Direservasi (Reserved) */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 relative">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="font-medium text-slate-300">Direservasi (Reserved)</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-amber-400 tracking-tight">
                {reserved.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>Status Reservasi:</span>
                <span className="font-semibold text-slate-300">Terkunci Sementara</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                Sedang dialokasikan pada pekerjaan aktif
              </div>
            </div>

            {/* 3. Penggunaan Siklus Berjalan (Used) */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 relative">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="font-medium text-slate-300">Terpakai Bulan Ini (Used)</span>
                <TrendingDown className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-indigo-400 tracking-tight">
                {usedThisCycle.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>Rasio Pemakaian:</span>
                <span className="font-semibold text-slate-300">{usagePercentage}%</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                Konsumsi riil dari seluruh tugas yang terselesaikan
              </div>
            </div>

            {/* 4. Total Alokasi Siklus (Total) */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 relative">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="font-medium text-slate-300">Total Alokasi (Total)</span>
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-cyan-400 tracking-tight">
                {totalAllocated.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>Siklus Penagihan:</span>
                <span className="font-semibold text-slate-300">Bulanan Aktif</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                Kombinasi kuota paket ditambah akumulasi top-up
              </div>
            </div>
          </div>

          {/* Baris Progress Kuota Bersih & Enterprise-Grade */}
          <div className="mt-6 pt-6 border-t border-slate-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 mb-2 gap-1">
              <span>Distribusi Kuota Siklus Berjalan</span>
              <span>
                Tersedia: {availablePercentage}% • Digunakan: {usagePercentage}%
              </span>
            </div>
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden flex border border-slate-800">
              <div
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{ width: `${usagePercentage}%` }}
                title={`Kredit Terpakai: ${usedThisCycle.toLocaleString('id-ID')} AI Credits`}
              />
              <div
                className="bg-amber-500 h-full transition-all duration-300"
                style={{
                  width: `${totalAllocated > 0 ? Math.min(100, (reserved / totalAllocated) * 100) : 0}%`,
                }}
                title={`Kredit Direservasi: ${reserved.toLocaleString('id-ID')} AI Credits`}
              />
              <div
                className="bg-emerald-500/80 h-full transition-all duration-300"
                style={{ width: `${Math.max(0, 100 - usagePercentage - (totalAllocated > 0 ? (reserved / totalAllocated) * 100 : 0))}%` }}
                title={`Kredit Tersedia: ${available.toLocaleString('id-ID')} AI Credits`}
              />
            </div>
            <div className="flex items-center gap-4 mt-2.5 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                <span>Tersedia ({available.toLocaleString('id-ID')})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
                <span>Direservasi ({reserved.toLocaleString('id-ID')})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span>
                <span>Terpakai ({usedThisCycle.toLocaleString('id-ID')})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigasi Aksi Cepat */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigateToTab('plans')}
          className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl p-4 text-left transition-all group flex items-start justify-between"
        >
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase">
              <ShieldCheck className="w-4 h-4" />
              <span>Paket & Fasilitas</span>
            </div>
            <h4 className="text-sm font-semibold text-white mt-1.5">
              Matriks Fasilitas Platform
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Periksa limit agen, kuota bulanan, dan fitur yang dapat ditingkatkan.
            </p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0 ml-2" />
        </button>

        <button
          onClick={() => onNavigateToTab('calculator')}
          className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl p-4 text-left transition-all group flex items-start justify-between"
        >
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase">
              <Sparkles className="w-4 h-4" />
              <span>Simulasi Biaya</span>
            </div>
            <h4 className="text-sm font-semibold text-white mt-1.5">
              Kalkulator Estimasi Biaya
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Hitung kebutuhan kredit berdasarkan model, perkakas, dan kompleksitas tugas.
            </p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors shrink-0 ml-2" />
        </button>

        <button
          onClick={() => onNavigateToTab('transactions')}
          className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl p-4 text-left transition-all group flex items-start justify-between"
        >
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase">
              <Clock className="w-4 h-4" />
              <span>Buku Besar Mutasi</span>
            </div>
            <h4 className="text-sm font-semibold text-white mt-1.5">
              Riwayat Transaksi & Konsumsi
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Pantau rincian biaya aktual per eksekusi dengan transparansi parameter.
            </p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0 ml-2" />
        </button>
      </div>

      {/* Prinsip Transparansi & Jaminan Keandalan Saldo */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Jaminan Saldo: Setiap eksekusi diverifikasi melalui transaksi ACID dengan pencadangan otomatis (otomatis dikembalikan bila tugas gagal).
          </span>
        </div>
        <button
          onClick={() => onNavigateToTab('invoices')}
          className="text-emerald-400 hover:text-emerald-300 font-medium whitespace-nowrap text-left sm:text-right"
        >
          Lihat Faktur Pembayaran →
        </button>
      </div>
    </div>
  );
}
