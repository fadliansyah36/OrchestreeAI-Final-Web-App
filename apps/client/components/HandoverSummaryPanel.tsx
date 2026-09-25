'use client';

import React, { useState } from 'react';
import {
  UserCheck,
  ShieldAlert,
  Flame,
  ThermometerSnowflake,
  SunMedium,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Send,
  User,
  Phone,
  DollarSign,
  TrendingUp,
  HelpCircle,
  Check,
  X,
  Sparkles,
} from 'lucide-react';

export interface HandoverSummaryData {
  handover_id: string;
  tenant_id: string;
  conversation_id: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    tier: string;
    total_spent: number;
    total_orders: number;
    channel: string;
    city?: string;
  };
  sales_metrics: {
    lead_id?: string | null;
    lead_score: number;
    lead_stage: string;
    temperature: 'COLD' | 'WARM' | 'HOT' | string;
    budget: number;
    funnel_stage: string;
  };
  handover_reason: string;
  trigger_details?: Record<string, any>;
  executive_summary: string;
  actionable_recommendations: string[];
  status: 'PENDING' | 'ACCEPTED' | 'RESOLVED';
  created_at: string;
}

interface HandoverSummaryPanelProps {
  summary: HandoverSummaryData;
  onTakeOver?: (handoverId: string) => void;
  onResolve?: (handoverId: string) => void;
  onClose?: () => void;
}

export const HandoverSummaryPanel: React.FC<HandoverSummaryPanelProps> = ({
  summary,
  onTakeOver,
  onResolve,
  onClose,
}) => {
  const [isAccepted, setIsAccepted] = useState(summary.status === 'ACCEPTED');
  const [isResolved, setIsResolved] = useState(summary.status === 'RESOLVED');

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const getTemperatureBadge = (temp: string) => {
    switch (temp) {
      case 'HOT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            HOT
          </span>
        );
      case 'WARM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <SunMedium className="w-3.5 h-3.5 text-amber-400" />
            WARM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
            <ThermometerSnowflake className="w-3.5 h-3.5 text-sky-400" />
            COLD
          </span>
        );
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'EXPLICIT_HUMAN_REQUEST':
        return {
          title: 'Permintaan Eksplisit Bicara Manusia',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          desc: 'Pelanggan meminta secara langsung untuk berkomunikasi dengan staf manusia.',
        };
      case 'LOW_CONFIDENCE':
        return {
          title: 'Keyakinan AI di Bawah Ambang Batas',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          desc: 'Skor keyakinan model di bawah ambang batas aman.',
        };
      case 'OUT_OF_SCOPE_OBJECTION':
        return {
          title: 'Keberatan di Luar Kewenangan AI',
          badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
          desc: 'Pelanggan mengajukan permintaan diskon khusus atau klausul di luar wewenang.',
        };
      case 'HIGH_VALUE_REFUND':
        return {
          title: 'Komplain / Refund Bernilai Tinggi',
          badge: 'bg-red-500/20 text-red-300 border-red-500/30',
          desc: 'Pengajuan bernominal tinggi membutuhkan verifikasi dan keputusan manusia.',
        };
      default:
        return {
          title: reason,
          badge: 'bg-slate-800 text-slate-300 border-slate-700',
          desc: 'Penyelesaian interaksi dialihkan ke staf.',
        };
    }
  };

  const reasonInfo = getReasonLabel(summary.handover_reason);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-white">
      {/* Header */}
      <div className="flex items-start justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Ringkasan Handover Staf Manusia
              </h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${reasonInfo.badge}`}>
                {reasonInfo.title}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              ID Sesi: {summary.conversation_id} • Dibuat: {new Date(summary.created_at).toLocaleTimeString('id-ID')}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Grid: Pelanggan & Metrik Nyata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
        {/* Profil Pelanggan Nyata */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Identitas Pelanggan
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {summary.customer.tier}
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Nama:</span>
              <span className="font-semibold text-white">{summary.customer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Kontak:</span>
              <span className="font-mono text-slate-300">{summary.customer.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Pembelanjaan:</span>
              <span className="font-semibold text-emerald-400">
                {formatRupiah(summary.customer.total_spent)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Jumlah Pesanan:</span>
              <span className="text-slate-200">{summary.customer.total_orders} transaksi</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Kanal Asal:</span>
              <span className="font-semibold text-sky-400">{summary.customer.channel}</span>
            </div>
          </div>
        </div>

        {/* Metrik Penjualan & Funnel Terstruktur */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Metrik Terstruktur
            </span>
            {getTemperatureBadge(summary.sales_metrics.temperature)}
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Skor Lead Nyata:</span>
              <span className="font-bold text-amber-400 font-mono">
                {summary.sales_metrics.lead_score.toFixed(1)} / 100
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Estimasi Anggaran:</span>
              <span className="font-semibold text-white">
                {formatRupiah(summary.sales_metrics.budget)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Posisi Corong:</span>
              <span className="font-semibold text-indigo-400">
                {summary.sales_metrics.funnel_stage}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status Prospek:</span>
              <span className="text-slate-200">{summary.sales_metrics.lead_stage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status Handover:</span>
              <span className={`font-semibold ${isResolved ? 'text-emerald-400' : isAccepted ? 'text-blue-400' : 'text-amber-400'}`}>
                {isResolved ? 'SELESAI DITANGANI' : isAccepted ? 'SEDANG DITANGANI' : 'MENUNGGU STAF'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Rangkuman Eksekutif */}
      <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 mb-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span>Rangkuman Eksekutif untuk Staf</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed font-sans">
          {summary.executive_summary}
        </p>
      </div>

      {/* Rekomendasi Tindakan Cepat */}
      <div className="mb-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Rekomendasi Tindakan Segera
        </h4>
        <div className="space-y-1.5">
          {summary.actionable_recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 text-xs bg-slate-950/30 border border-slate-800/40 rounded-lg p-2.5 text-slate-300"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{rec}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tombol Aksi Staf Manusia */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800">
        <div className="text-xs text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>Waktu respon ideal: &lt; 5 menit</span>
        </div>

        <div className="flex items-center gap-2">
          {!isAccepted && !isResolved && (
            <button
              onClick={() => {
                setIsAccepted(true);
                if (onTakeOver) onTakeOver(summary.handover_id);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-600/20 cursor-pointer flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" /> Ambil Alih Percakapan
            </button>
          )}

          {isAccepted && !isResolved && (
            <button
              onClick={() => {
                setIsResolved(true);
                if (onResolve) onResolve(summary.handover_id);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Tandai Selesai
            </button>
          )}

          {isResolved && (
            <div className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Selesai Ditangani
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
