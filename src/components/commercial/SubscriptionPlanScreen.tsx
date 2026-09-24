import React, { useState, useEffect } from 'react';
import {
  Layers,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Users,
  Bot,
  Clock,
  Shield,
  X,
  Save,
  Check
} from 'lucide-react';

export interface SubscriptionPlanItem {
  id: string;
  plan_code: string;
  display_name: string;
  monthly_price_idr: number | null;
  price_monthly: number | null;
  ai_credit_allowance: number | null;
  human_staff_limit: number | null;
  ai_agent_limit: number | null;
  is_trial: boolean;
  trial_duration_days: number | null;
  is_custom_quote: boolean;
  display_order: number;
  currency: string;
}

interface SubscriptionPlanScreenProps {
  onPlanUpdated?: () => void;
}

export function SubscriptionPlanScreen({ onPlanUpdated }: SubscriptionPlanScreenProps) {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  // Edit Modal State
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanItem | null>(null);
  const [formDisplayName, setFormDisplayName] = useState<string>('');
  const [formPriceIdr, setFormPriceIdr] = useState<number | ''>('');
  const [formCreditAllowance, setFormCreditAllowance] = useState<number | ''>('');
  const [formHumanLimit, setFormHumanLimit] = useState<number | ''>('');
  const [formAgentLimit, setFormAgentLimit] = useState<number | ''>('');
  const [formTrialDays, setFormTrialDays] = useState<number | ''>('');
  const [formIsTrial, setFormIsTrial] = useState<boolean>(false);
  const [formIsCustomQuote, setFormIsCustomQuote] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchPlans = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/plans', {
        headers: {
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal memuat katalog paket langganan.');
      }
      const data = await res.json();
      setPlans(data.plans || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat memuat data paket.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenEdit = (plan: SubscriptionPlanItem) => {
    setEditingPlan(plan);
    setFormDisplayName(plan.display_name);
    setFormPriceIdr(plan.monthly_price_idr ?? (plan.price_monthly ?? ''));
    setFormCreditAllowance(plan.ai_credit_allowance ?? '');
    setFormHumanLimit(plan.human_staff_limit ?? '');
    setFormAgentLimit(plan.ai_agent_limit ?? '');
    setFormTrialDays(plan.trial_duration_days ?? '');
    setFormIsTrial(plan.is_trial);
    setFormIsCustomQuote(plan.is_custom_quote);
    setErrorMessage(null);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const payload: Record<string, any> = {
        display_name: formDisplayName.trim(),
        monthly_price_idr: formPriceIdr === '' ? null : Number(formPriceIdr),
        ai_credit_allowance: formCreditAllowance === '' ? null : Number(formCreditAllowance),
        human_staff_limit: formHumanLimit === '' ? null : Number(formHumanLimit),
        ai_agent_limit: formAgentLimit === '' ? null : Number(formAgentLimit),
        is_trial: formIsTrial,
        trial_duration_days: formTrialDays === '' ? null : Number(formTrialDays),
        is_custom_quote: formIsCustomQuote,
      };

      const res = await fetch(`/api/v1/billing/admin/plans/${editingPlan.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal menyimpan perubahan paket.');
      }

      setSuccessFeedback(`Paket ${editingPlan.display_name} berhasil diperbarui. Perubahan tercatat di Audit Ledger.`);
      setEditingPlan(null);
      fetchPlans();
      if (onPlanUpdated) onPlanUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan konfigurasi paket.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatRupiah = (val: number | null) => {
    if (val === null || val === undefined) return 'Kustom / Kontak Penjualan';
    if (val === 0) return 'Gratis';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <span>Katalog Paket Langganan Komersial</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Konfigurasi 5 paket resmi platform. Perubahan harga tidak memengaruhi siklus berjalan tenant aktif (snapshot harga invoice terlindungi).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPlans}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {errorMessage && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-sm">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">{errorMessage}</div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successFeedback && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="flex-1">{successFeedback}</div>
          <button onClick={() => setSuccessFeedback(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid of 5 Plans */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-64 rounded-2xl bg-slate-900/40 border border-slate-800 animate-pulse p-6" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0B1220] border border-slate-800">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-300">Tidak ada paket langganan terdaftar</p>
          <p className="text-xs text-slate-500 mt-1">Pastikan migrasi database katalog komersial telah dijalankan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((p) => {
            const isHighlight = p.plan_code === 'PROFESSIONAL' || p.plan_code === 'ENTERPRISE';
            return (
              <div
                key={p.id}
                className={`relative flex flex-col justify-between p-6 rounded-2xl bg-[#0B1220] border transition-all ${
                  isHighlight ? 'border-emerald-800/80 shadow-lg shadow-emerald-950/20' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono tracking-wider uppercase bg-slate-900 text-slate-300 border border-slate-700">
                      {p.plan_code}
                    </span>
                    {p.is_trial && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800">
                        {p.trial_duration_days ? `${p.trial_duration_days} Hari Uji Coba` : 'Uji Coba'}
                      </span>
                    )}
                    {p.is_custom_quote && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-950/60 text-sky-300 border border-sky-800">
                        Penawaran Khusus
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2">{p.display_name}</h3>
                  <div className="text-2xl font-extrabold text-emerald-400 font-mono mb-4">
                    {formatRupiah(p.monthly_price_idr)}
                    {p.monthly_price_idr !== null && p.monthly_price_idr > 0 && (
                      <span className="text-xs font-normal text-slate-400 font-sans ml-1">/ bulan</span>
                    )}
                  </div>

                  <div className="space-y-2.5 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        Alokasi Kredit AI
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {p.ai_credit_allowance !== null ? `${p.ai_credit_allowance.toLocaleString('id-ID')} Kredit` : 'Tidak Terbatas'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Users className="w-3.5 h-3.5 text-sky-400" />
                        Batas Staf Manusia
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {p.human_staff_limit !== null ? `${p.human_staff_limit} Staf` : 'Kustom / Kuota Luwes'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Bot className="w-3.5 h-3.5 text-emerald-400" />
                        Batas Agen AI
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {p.ai_agent_limit !== null ? `${p.ai_agent_limit} Agen` : 'Kustom / Kuota Luwes'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Urutan Tampilan
                      </span>
                      <span className="font-mono text-slate-400">Posisi #{p.display_order}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-5 mt-5 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleOpenEdit(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-medium text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-700 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Ubah Paket</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-[#0B1220] border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">
                  Ubah Parameter Paket: <span className="font-mono text-emerald-400">{editingPlan.plan_code}</span>
                </h3>
              </div>
              <button
                onClick={() => setEditingPlan(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Tampilan Paket
                  </label>
                  <input
                    type="text"
                    required
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-hidden focus:border-emerald-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Harga Bulanan (IDR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formPriceIdr}
                    onChange={(e) => setFormPriceIdr(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Alokasi Kredit AI Bulanan
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formCreditAllowance}
                    onChange={(e) => setFormCreditAllowance(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Batas Maksimal Staf Manusia
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formHumanLimit}
                    onChange={(e) => setFormHumanLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Batas Maksimal Agen AI
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formAgentLimit}
                    onChange={(e) => setFormAgentLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Durasi Masa Uji Coba (Hari)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formTrialDays}
                    onChange={(e) => setFormTrialDays(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="flex flex-col justify-end gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={formIsTrial}
                      onChange={(e) => setFormIsTrial(e.target.checked)}
                      className="rounded-sm border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                    />
                    <span>Tandai sebagai Paket Uji Coba</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={formIsCustomQuote}
                      onChange={(e) => setFormIsCustomQuote(e.target.checked)}
                      className="rounded-sm border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                    />
                    <span>Harga Kustom (Penawaran Khusus)</span>
                  </label>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 text-amber-200 text-xs flex items-start gap-2 mt-4">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Audit Ledger akan merekam pembaruan ini secara permanen. Riwayat invoice sebelumnya tidak terdampak karena nominal invoice tersimpan secara terpisah (snapshot).
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
