import { apiClient } from '@orchestree/api-client';
import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Award,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  MessageSquare,
  ArrowRight,
  RefreshCw,
  HelpCircle,
  Lightbulb,
  PhoneCall,
  Share2,
  Tag
} from 'lucide-react';

interface SalesCoachEvaluation {
  conversation_id: string;
  customer_name?: string;
  sales_stage: string;
  closing_score: number;
  objections_detected: string[];
  buying_signals: string[];
  ai_recommendation: string;
  suggested_action: 'SEND_DISCOUNT_CODE' | 'CALL_CUSTOMER' | 'SHARE_CATALOG' | 'RESOLVE_OBJECTION' | 'FOLLOW_UP_CART';
}

export function SalesCoachScreen({ tenantId }: { tenantId: string }) {
  const [evaluations, setEvaluations] = useState<SalesCoachEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvaluations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/sales-coach/evaluations?limit=8`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal memuat analisis Sales Coach.');
      }
      setEvaluations(json.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluations();
  }, [tenantId]);

  const getActionBadge = (action: SalesCoachEvaluation['suggested_action']) => {
    switch (action) {
      case 'SEND_DISCOUNT_CODE':
        return { label: 'Kirim Kupon Diskon', icon: Tag, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
      case 'CALL_CUSTOMER':
        return { label: 'Eskalasi Panggilan Langsung', icon: PhoneCall, color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
      case 'SHARE_CATALOG':
        return { label: 'Bagikan Tautan Produk', icon: Share2, color: 'bg-sky-500/10 text-sky-500 border-sky-500/20' };
      case 'FOLLOW_UP_CART':
        return { label: 'Picu Checkout Keranjang', icon: TrendingUp, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
      case 'RESOLVE_OBJECTION':
      default:
        return { label: 'Selesaikan Keraguan', icon: Lightbulb, color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              AI Sales Coach & Objection Handler
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              Live Transcript Analysis
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Evaluasi kecerdasan interaksi, deteksi keraguan pelanggan, dan rekomendasi aksi penutupan penjualan real-time.
          </p>
        </div>

        <button
          onClick={fetchEvaluations}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Segarkan Evaluasi
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Summary Score Bar */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-slate-900/60 border border-indigo-500/20 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Analisis Kesiapan Penutupan (Closing Readiness)
              </h2>
              <p className="text-xs text-slate-300">
                Model mengevaluasi indikator kesepakatan dari transkrip percakapan langsung di database Supabase.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Percakapan Dianalisis</span>
              <span className="text-xl font-bold text-white">{evaluations.length} Sesi Aktif</span>
            </div>
          </div>
        </div>
      </div>

      {/* Evaluations List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {evaluations.length === 0 && !loading ? (
          <div className="col-span-full py-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <MessageSquare className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">Belum Ada Percakapan Aktif</h3>
            <p className="text-xs text-slate-400 mt-1">
              Percakapan masuk dari WhatsApp atau Telegram akan otomatis dievaluasi oleh Sales Coach di sini.
            </p>
          </div>
        ) : (
          evaluations.map((item) => {
            const badge = getActionBadge(item.suggested_action);
            const ActionIcon = badge.icon;

            return (
              <div
                key={item.conversation_id}
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                {/* Header Card */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                      Stage: {item.sales_stage}
                    </span>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white mt-1">
                      {item.customer_name}
                    </h3>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Skor Penutupan</span>
                    <span className={`text-lg font-bold ${
                      item.closing_score >= 70 ? 'text-emerald-500' : item.closing_score >= 45 ? 'text-amber-500' : 'text-rose-500'
                    }`}>
                      {item.closing_score} / 100
                    </span>
                  </div>
                </div>

                {/* Objections & Buying Signals */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  {item.buying_signals.length > 0 && (
                    <div className="space-y-1">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sinyal Beli Terdeteksi:
                      </span>
                      {item.buying_signals.map((sig, sIdx) => (
                        <p key={sIdx} className="text-slate-600 dark:text-slate-300 pl-4">
                          • {sig}
                        </p>
                      ))}
                    </div>
                  )}

                  {item.objections_detected.length > 0 && (
                    <div className="space-y-1">
                      <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Keraguan / Keberatan Pelanggan:
                      </span>
                      {item.objections_detected.map((obj, oIdx) => (
                        <p key={oIdx} className="text-slate-600 dark:text-slate-300 pl-4">
                          • {obj}
                        </p>
                      ))}
                    </div>
                  )}

                  {item.buying_signals.length === 0 && item.objections_detected.length === 0 && (
                    <p className="text-slate-400 italic">
                      Interaksi eksplorasi umum, belum ada keberatan spesifik teridentifikasi.
                    </p>
                  )}
                </div>

                {/* AI Recommendation & Action */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Rekomendasi Tindakan AI
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.ai_recommendation}
                  </p>

                  <div className="pt-2">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${badge.color}`}>
                      <ActionIcon className="w-3.5 h-3.5" />
                      {badge.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
