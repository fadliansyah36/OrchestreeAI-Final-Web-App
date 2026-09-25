import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  Plus,
  Play,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Award,
  Layers,
  BarChart2,
  Calendar
} from 'lucide-react';

interface MessageExperiment {
  id: string;
  name: string;
  description?: string;
  channel_type: 'WHATSAPP' | 'TELEGRAM' | 'INSTAGRAM' | 'EMAIL';
  status: 'DRAFT' | 'RUNNING' | 'CONCLUDED' | 'CANCELLED';
  variant_a_template: string;
  variant_b_template: string;
  variant_a_name: string;
  variant_b_name: string;
  target_metric: string;
  min_sample_size: number;
  confidence_level_threshold: number;
  variant_a_sample_count: number;
  variant_b_sample_count: number;
  variant_a_conversions: number;
  variant_b_conversions: number;
  variant_a_revenue: number;
  variant_b_revenue: number;
  winner_variant?: 'VARIANT_A' | 'VARIANT_B' | 'INCONCLUSIVE';
  p_value?: number;
  z_score?: number;
  is_statistically_significant: boolean;
  conclusion_reason?: string;
  created_at: string;
}

export function MessageExperimentScreen({ tenantId }: { tenantId: string }) {
  const [experiments, setExperiments] = useState<MessageExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState<'WHATSAPP' | 'TELEGRAM' | 'INSTAGRAM' | 'EMAIL'>('WHATSAPP');
  const [variantAName, setVariantAName] = useState('Variant A (Kontrol)');
  const [variantATemplate, setVariantATemplate] = useState('Halo {{name}}, terima kasih telah menghubungi kami. Ada produk yang sedang ingin Anda tanyakan hari ini?');
  const [variantBName, setVariantBName] = useState('Variant B (Penawaran Langsung)');
  const [variantBTemplate, setVariantBTemplate] = useState('Halo {{name}}! Spesial untuk Anda, kami sediakan potongan 10% untuk pesanan hari ini. Mari cek rekomendasi produk kami!');
  const [minSampleSize, setMinSampleSize] = useState(50);
  const [submitting, setSubmitting] = useState(false);

  const fetchExperiments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/message-experiments`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal memuat eksperimen pesan.');
      }
      setExperiments(json.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExperiments();
  }, [tenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/message-experiments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          channel_type: channelType,
          variant_a_name: variantAName,
          variant_a_template: variantATemplate,
          variant_b_name: variantBName,
          variant_b_template: variantBTemplate,
          min_sample_size: minSampleSize,
          target_metric: 'CONVERSION_RATE',
          confidence_level_threshold: 0.95,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal membuat eksperimen.');
      }
      setShowModal(false);
      setName('');
      setDescription('');
      fetchExperiments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConclude = async (expId: string) => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/message-experiments/${expId}/conclude`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal menyelesaikan eksperimen.');
      }
      fetchExperiments();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Message Experiments (A/B Testing Signifikan)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              Statistik Z-Score Real-Time
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Uji perbandingan template pesan penjualan dengan random assignment otomatis dan penetapan pemenang berbasis inferensi statistik riil.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchExperiments}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Buat Eksperimen Baru
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Experiment Cards */}
      <div className="space-y-4">
        {experiments.length === 0 && !loading ? (
          <div className="py-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <FlaskConical className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">Belum Ada Eksperimen Pesan</h3>
            <p className="text-xs text-slate-400 mt-1">
              Mulai uji performa template salam atau penawaran penjualan untuk mengoptimalkan konversi pelanggan.
            </p>
          </div>
        ) : (
          experiments.map((exp) => {
            const totalSample = exp.variant_a_sample_count + exp.variant_b_sample_count;
            const rateA = exp.variant_a_sample_count > 0 ? (exp.variant_a_conversions / exp.variant_a_sample_count) * 100 : 0;
            const rateB = exp.variant_b_sample_count > 0 ? (exp.variant_b_conversions / exp.variant_b_sample_count) * 100 : 0;

            return (
              <div
                key={exp.id}
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5"
              >
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        {exp.name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        exp.status === 'RUNNING'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : exp.status === 'CONCLUDED'
                          ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {exp.status}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {exp.channel_type}
                      </span>
                    </div>
                    {exp.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {exp.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {exp.status === 'RUNNING' && (
                      <button
                        onClick={() => handleConclude(exp.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        Selesaikan Eksperimen
                      </button>
                    )}
                  </div>
                </div>

                {/* Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Variant A */}
                  <div className={`p-4 rounded-xl border ${
                    exp.winner_variant === 'VARIANT_A'
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                  } space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {exp.variant_a_name}
                        </span>
                        {exp.winner_variant === 'VARIANT_A' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white flex items-center gap-1">
                            <Award className="w-3 h-3" /> Pemenang
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {exp.variant_a_sample_count} Sampel
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 italic p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      "{exp.variant_a_template}"
                    </p>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-slate-500">Konversi: {exp.variant_a_conversions}</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        Tingkat: {rateA.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Variant B */}
                  <div className={`p-4 rounded-xl border ${
                    exp.winner_variant === 'VARIANT_B'
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                  } space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {exp.variant_b_name}
                        </span>
                        {exp.winner_variant === 'VARIANT_B' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white flex items-center gap-1">
                            <Award className="w-3 h-3" /> Pemenang
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {exp.variant_b_sample_count} Sampel
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 italic p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      "{exp.variant_b_template}"
                    </p>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-slate-500">Konversi: {exp.variant_b_conversions}</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        Tingkat: {rateB.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Statistical Inference Output */}
                <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="font-semibold text-slate-900 dark:text-white block">
                      Status Signifikansi Statistik (Z-Score & p-value):
                    </span>
                    <p className="text-slate-600 dark:text-slate-300">
                      {exp.conclusion_reason || `Total sampel saat ini: ${totalSample} / ${exp.min_sample_size} minimum.`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                      <span className="text-[10px] text-slate-400 uppercase block">p-value</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {exp.p_value !== undefined && exp.p_value !== null ? Number(exp.p_value).toFixed(4) : '-'}
                      </span>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                      <span className="text-[10px] text-slate-400 uppercase block">Z-Score</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {exp.z_score !== undefined && exp.z_score !== null ? Number(exp.z_score).toFixed(2) : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Buat Eksperimen A/B Template Pesan
            </h2>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Eksperimen
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Nama Eksperimen"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kanal Komunikasi
                  </label>
                  <select
                    value={channelType}
                    onChange={(e) => setChannelType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="TELEGRAM">Telegram</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="EMAIL">Email</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sampel Minimum
                  </label>
                  <input
                    type="number"
                    min={10}
                    value={minSampleSize}
                    onChange={(e) => setMinSampleSize(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Variant A */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block font-semibold text-slate-900 dark:text-white">
                  Kontrol: {variantAName}
                </label>
                <textarea
                  required
                  rows={3}
                  value={variantATemplate}
                  onChange={(e) => setVariantATemplate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Variant B */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block font-semibold text-slate-900 dark:text-white">
                  Eksperimen: {variantBName}
                </label>
                <textarea
                  required
                  rows={3}
                  value={variantBTemplate}
                  onChange={(e) => setVariantBTemplate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Mulai Eksperimen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
