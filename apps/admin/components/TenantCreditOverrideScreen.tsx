'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Crown,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Sliders,
  DollarSign,
  PlusCircle,
  MinusCircle,
  X,
  Save,
  Lock,
  Building2,
  Sparkles
} from 'lucide-react';

interface TenantSubscriptionItem {
  id: string;
  tenant_id: string;
  tenant_name: string;
  plan_code: string;
  status: string;
  is_unlimited_override: boolean;
  unlimited_reason: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  balance: number;
  reserved_balance: number;
  available_balance: number;
  currency: string;
  is_founder_account?: boolean;
}

export function TenantCreditOverrideScreen() {
  const [tenants, setTenants] = useState<TenantSubscriptionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterUnlimitedOnly, setFilterUnlimitedOnly] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  // Modal 1: Unlimited Override
  const [overrideTarget, setOverrideTarget] = useState<TenantSubscriptionItem | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [submittingOverride, setSubmittingOverride] = useState<boolean>(false);

  // Modal 2: Manual Credit Adjustment
  const [adjustTarget, setAdjustTarget] = useState<TenantSubscriptionItem | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number | ''>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [submittingAdjust, setSubmittingAdjust] = useState<boolean>(false);

  const fetchTenants = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/tenant-subscriptions', {
        headers: {
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal memuat daftar langganan organisasi.');
      }

      const data = await res.json();
      setTenants(data.tenants || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat memuat data organisasi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleOpenOverrideModal = (tenant: TenantSubscriptionItem) => {
    setOverrideTarget(tenant);
    setOverrideStatus(!tenant.is_unlimited_override);
    setOverrideReason(tenant.unlimited_reason || '');
    setErrorMessage(null);
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget) return;

    if (overrideStatus && !overrideReason.trim()) {
      setErrorMessage('Alasan unlimited wajib diisi ketika mengaktifkan override (Audit Ledger Risk Tier: CRITICAL).');
      return;
    }

    setSubmittingOverride(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/tenant-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify({
          tenant_id: overrideTarget.tenant_id,
          is_unlimited_override: overrideStatus,
          unlimited_reason: overrideStatus ? overrideReason.trim() : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal memperbarui status unlimited override.');
      }

      setSuccessFeedback(
        `Status hak istimewa unlimited untuk organisasi "${overrideTarget.tenant_name}" berhasil diperbarui. Aksi dicatat di Audit Ledger dengan risk tier tertinggi.`
      );
      setOverrideTarget(null);
      fetchTenants();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses override unlimited.');
    } finally {
      setSubmittingOverride(false);
    }
  };

  const handleOpenAdjustModal = (tenant: TenantSubscriptionItem) => {
    setAdjustTarget(tenant);
    setAdjustAmount('');
    setAdjustReason('');
    setErrorMessage(null);
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;

    const amountNum = Number(adjustAmount);
    if (!amountNum || amountNum === 0) {
      setErrorMessage('Jumlah penyesuaian kredit tidak boleh nol.');
      return;
    }

    if (!adjustReason.trim()) {
      setErrorMessage('Alasan penyesuaian kredit wajib diisi (misal: Kompensasi insiden, refund kasus khusus).');
      return;
    }

    setSubmittingAdjust(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/manual-adjustment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify({
          tenant_id: adjustTarget.tenant_id,
          amount_credits: amountNum,
          reason: adjustReason.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal melakukan penyesuaian kredit manual.');
      }

      const resData = await res.json();
      setSuccessFeedback(
        `Penyesuaian kredit sebesar ${amountNum > 0 ? `+${amountNum}` : amountNum} kredit untuk "${adjustTarget.tenant_name}" berhasil diproses. Saldo baru: ${resData.new_balance} kredit.`
      );
      setAdjustTarget(null);
      fetchTenants();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses penyesuaian kredit.');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const matchName = t.tenant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.plan_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tenant_id.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterUnlimitedOnly) {
      return matchName && t.is_unlimited_override;
    }
    return matchName;
  });

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-purple-400" />
            <span>Hak Istimewa & Penyesuaian Kredit Organisasi</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Khusus Super Admin: Pemberian Unlimited Override (bebas biaya penggunaan AI) & penyesuaian kredit manual dengan verifikasi Audit Ledger ketat.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchTenants}
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            aria-label="Cari organisasi atau paket"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0B1220] border border-slate-800 text-white text-xs text-slate-300 focus:outline-hidden focus:border-purple-500"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 px-3 py-2 rounded-xl bg-[#0B1220] border border-slate-800">
          <input
            type="checkbox"
            checked={filterUnlimitedOnly}
            onChange={(e) => setFilterUnlimitedOnly(e.target.checked)}
            className="rounded-sm border-slate-700 bg-slate-900 text-purple-500 focus:ring-0"
          />
          <span>Tampilkan Hanya Akun Unlimited Override</span>
        </label>
      </div>

      {/* Tenant Subscriptions Table */}
      <div className="rounded-2xl bg-[#0B1220] border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-800/60">
            <thead className="bg-slate-900/60 text-slate-400">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Organisasi / ID</th>
                <th className="py-3.5 px-3 font-semibold">Paket</th>
                <th className="py-3.5 px-3 font-semibold text-center">Status Unlimited</th>
                <th className="py-3.5 px-4 font-semibold text-right">Saldo Tersedia</th>
                <th className="py-3.5 px-4 font-semibold text-right">Saldo Terkunci</th>
                <th className="py-3.5 px-4 font-semibold text-center">Tindakan Khusus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 bg-slate-800 rounded-md w-40" /></td>
                    <td className="py-4 px-3"><div className="h-4 bg-slate-800 rounded-md w-20" /></td>
                    <td className="py-4 px-3"><div className="h-4 bg-slate-800 rounded-md w-24 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-slate-800 rounded-md w-24 ml-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-slate-800 rounded-md w-20 ml-auto" /></td>
                    <td className="py-4 px-4"><div className="h-6 bg-slate-800 rounded-md w-32 mx-auto" /></td>
                  </tr>
                ))
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Tidak ditemukan organisasi yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t.tenant_name}</span>
                        {t.is_founder_account && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-amber-950/80 text-amber-300 border border-amber-600/60 shadow-xs">
                            <Crown className="w-2.5 h-2.5 text-amber-400" />
                            FOUNDER ACCOUNT
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 mt-0.5">{t.tenant_id}</div>
                    </td>

                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-slate-900 border border-slate-700 text-slate-300">
                        {t.plan_code}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      {t.is_unlimited_override ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                            <Crown className="w-3 h-3 text-amber-400" />
                            UNLIMITED AKTIF
                          </span>
                          {t.unlimited_reason && (
                            <span className="text-[10px] text-slate-400 mt-0.5 max-w-[150px] truncate" title={t.unlimited_reason}>
                              {t.unlimited_reason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 font-mono text-[11px]">-</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {t.is_unlimited_override ? (
                        <span className="font-bold font-mono text-purple-300 text-xs">Tak Terbatas</span>
                      ) : (
                        <span className="font-bold font-mono text-emerald-400 text-xs">
                          {t.available_balance.toLocaleString('id-ID')}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono text-slate-400 text-xs">
                      {t.reserved_balance.toLocaleString('id-ID')}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenOverrideModal(t)}
                          className="px-2.5 py-1 rounded-lg bg-purple-950/40 border border-purple-800/60 text-purple-300 hover:bg-purple-900/60 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          {t.is_unlimited_override ? 'Kelola Unlimited' : 'Beri Unlimited'}
                        </button>
                        <button
                          onClick={() => handleOpenAdjustModal(t)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Kompensasi / Refund
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Unlimited Override */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-[#0B1220] border border-purple-800/60 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-purple-950/20">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">
                  Hak Istimewa Unlimited AI
                </h3>
              </div>
              <button
                onClick={() => setOverrideTarget(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOverride} className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <span className="text-slate-400">Organisasi Target:</span>
                <div className="font-bold text-white text-sm mt-0.5">{overrideTarget.tenant_name}</div>
                <div className="font-mono text-[10px] text-slate-500">{overrideTarget.tenant_id}</div>
              </div>

              <div>
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-950/30 border border-purple-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideStatus}
                    onChange={(e) => setOverrideStatus(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-purple-700 bg-slate-900 text-purple-600 focus:ring-0"
                  />
                  <div>
                    <div className="text-xs font-bold text-white">Aktifkan Unlimited Override</div>
                    <div className="text-[11px] text-purple-300">
                      Organisasi ini tidak akan dibebani pengurangan saldo kredit AI pada eksekusi apapun.
                    </div>
                  </div>
                </label>
              </div>

              {overrideStatus && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Alasan Pemberian Unlimited <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    aria-label="Alasan pemberian unlimited override"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
              )}

              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Aksi ini memiliki risk tier CRITICAL pada Audit Ledger dan hanya sah dilakukan oleh akun berwenang SUPER_ADMIN.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  disabled={submittingOverride}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingOverride}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 text-xs font-semibold text-white hover:bg-purple-500 transition-colors shadow-lg shadow-purple-950/40 cursor-pointer disabled:opacity-50"
                >
                  {submittingOverride ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Simpan Status</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Manual Credit Adjustment */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-[#0B1220] border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
              <h3 className="font-bold text-white text-base">
                Penyesuaian Saldo Kredit Manual
              </h3>
              <button
                onClick={() => setAdjustTarget(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <span className="text-slate-400">Organisasi:</span>
                <div className="font-bold text-white text-sm mt-0.5">{adjustTarget.tenant_name}</div>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-slate-400">
                    Saldo Saat Ini:{' '}
                    <strong className="text-emerald-400 font-mono">
                      {adjustTarget.available_balance.toLocaleString('id-ID')}
                    </strong>{' '}
                    Kredit
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Jumlah Penyesuaian Kredit (+ / -) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  aria-label="Jumlah penyesuaian kredit"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:border-emerald-500 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Gunakan angka positif untuk kompensasi/top-up manual, angka negatif untuk koreksi debet.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Alasan Penyesuaian (Wajib) <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  aria-label="Alasan penyesuaian kredit manual"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  disabled={submittingAdjust}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
                >
                  {submittingAdjust ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Eksekusi Penyesuaian</span>
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
