'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Zap,
  Save,
  X,
  Tag,
  Check
} from 'lucide-react';

interface TopupPackageItem {
  id: string;
  name: string;
  price_idr: number;
  credits: number;
  bonus_credits: number;
  is_active: boolean;
  display_order: number;
  validity_days: number | null;
  currency: string;
}

export function CreditTopupPackageScreen() {
  const [packages, setPackages] = useState<TopupPackageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  // Modal State (Create or Edit)
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingPkg, setEditingPkg] = useState<TopupPackageItem | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formPriceIdr, setFormPriceIdr] = useState<number | ''>('');
  const [formCredits, setFormCredits] = useState<number | ''>('');
  const [formBonusCredits, setFormBonusCredits] = useState<number | ''>(0);
  const [formValidityDays, setFormValidityDays] = useState<number | ''>('');
  const [formDisplayOrder, setFormDisplayOrder] = useState<number | ''>(1);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchPackages = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/topup-packages', {
        headers: {
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal memuat paket top-up kredit.');
      }

      const data = await res.json();
      setPackages(data.packages || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat memuat paket top-up.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  const handleOpenCreate = () => {
    setEditingPkg(null);
    setFormName('');
    setFormPriceIdr('');
    setFormCredits('');
    setFormBonusCredits(0);
    setFormValidityDays('');
    setFormDisplayOrder(packages.length + 1);
    setFormIsActive(true);
    setModalOpen(true);
    setErrorMessage(null);
  };

  const handleOpenEdit = (pkg: TopupPackageItem) => {
    setEditingPkg(pkg);
    setFormName(pkg.name);
    setFormPriceIdr(pkg.price_idr);
    setFormCredits(pkg.credits);
    setFormBonusCredits(pkg.bonus_credits || 0);
    setFormValidityDays(pkg.validity_days ?? '');
    setFormDisplayOrder(pkg.display_order);
    setFormIsActive(pkg.is_active);
    setModalOpen(true);
    setErrorMessage(null);
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const payload: Record<string, any> = {
        name: formName.trim(),
        price_idr: Number(formPriceIdr),
        credits: Number(formCredits),
        bonus_credits: Number(formBonusCredits) || 0,
        validity_days: formValidityDays === '' ? null : Number(formValidityDays),
        display_order: Number(formDisplayOrder) || 1,
        is_active: formIsActive,
      };

      const url = editingPkg
        ? `/api/v1/billing/admin/topup-packages/${editingPkg.id}`
        : '/api/v1/billing/admin/topup-packages';
      const method = editingPkg ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal menyimpan paket top-up.');
      }

      setSuccessFeedback(
        `Paket ${formName} berhasil ${editingPkg ? 'diperbarui' : 'dibuat'} dan tercatat di Audit Ledger.`
      );
      setModalOpen(false);
      fetchPackages();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses paket top-up.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatRupiah = (val: number) => {
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
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <span>Katalog Paket Top-Up Kredit AI</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Paket pembelian kredit on-demand untuk seluruh penyewa. Tersambung langsung ke gateway pembayaran resmi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPackages}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Paket Baru</span>
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

      {/* Grid of Top-Up Packages */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 rounded-2xl bg-slate-900/40 border border-slate-800 animate-pulse p-6" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0B1220] border border-slate-800">
          <CreditCard className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-300">Belum ada paket top-up terdaftar</p>
          <p className="text-xs text-slate-500 mt-1">Klik tombol &apos;Tambah Paket Baru&apos; untuk membuat paket top-up pertama.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {packages.map((pkg) => {
            const totalCredits = pkg.credits + (pkg.bonus_credits || 0);
            const pricePerCredit = totalCredits > 0 ? (pkg.price_idr / totalCredits).toFixed(0) : '0';

            return (
              <div
                key={pkg.id}
                className={`relative flex flex-col justify-between p-5 rounded-2xl bg-[#0B1220] border transition-all ${
                  pkg.is_active ? 'border-slate-800 hover:border-slate-700' : 'border-slate-900 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-mono text-slate-400">Posisi #{pkg.display_order}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        pkg.is_active
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                          : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}
                    >
                      {pkg.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">{pkg.name}</h3>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono mb-3">
                    {formatRupiah(pkg.price_idr)}
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-800 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        Kredit Utama
                      </span>
                      <span className="font-mono font-bold text-white">
                        {pkg.credits.toLocaleString('id-ID')}
                      </span>
                    </div>

                    {pkg.bonus_credits > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-purple-400" />
                          Bonus Kredit
                        </span>
                        <span className="font-mono font-bold text-purple-400">
                          +{pkg.bonus_credits.toLocaleString('id-ID')}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-slate-400" />
                        Rasio / Kredit
                      </span>
                      <span className="font-mono text-slate-400">Rp {pricePerCredit}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Masa Berlaku</span>
                      <span className="text-slate-300">
                        {pkg.validity_days ? `${pkg.validity_days} Hari` : 'Permanen'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleOpenEdit(pkg)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-medium text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-700 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Ubah</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-[#0B1220] border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
              <h3 className="font-bold text-white text-base">
                {editingPkg ? `Ubah Paket: ${editingPkg.name}` : 'Tambah Paket Top-Up Baru'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePackage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Paket
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Harga (IDR)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formPriceIdr}
                    onChange={(e) => setFormPriceIdr(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Kredit Utama
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formCredits}
                    onChange={(e) => setFormCredits(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Bonus Kredit
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formBonusCredits}
                    onChange={(e) => setFormBonusCredits(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Masa Berlaku (Hari)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formValidityDays}
                    onChange={(e) => setFormValidityDays(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Urutan Tampilan
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formDisplayOrder}
                    onChange={(e) => setFormDisplayOrder(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded-sm border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                    />
                    <span>Paket Aktif & Ditampilkan</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
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
                      <span>{editingPkg ? 'Simpan Perubahan' : 'Buat Paket'}</span>
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
