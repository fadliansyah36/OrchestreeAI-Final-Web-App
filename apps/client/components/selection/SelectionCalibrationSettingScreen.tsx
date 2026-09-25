'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Save,
  Layers,
  Sparkles,
  Info,
  Check,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader } from '@orchestree/ui';

export interface CalibrationItemRow {
  id?: string;
  field_type_name: string;
  percentage: number;
}

export interface CalibrationProfileSummary {
  id: string;
  tenant_id: string;
  profile_name: string;
  domain_category?: string | null;
  is_active: boolean;
  total_percentage: number;
  items_count: number;
  created_at: string;
}

interface SelectionCalibrationSettingScreenProps {
  tenantId?: string;
  onProfileSaved?: (profileId: string) => void;
}

export function SelectionCalibrationSettingScreen({
  tenantId = 'default-tenant',
  onProfileSaved,
}: SelectionCalibrationSettingScreenProps) {
  const [profiles, setProfiles] = useState<CalibrationProfileSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [profileName, setProfileName] = useState<string>('');
  const [domainCategory, setDomainCategory] = useState<string>('');
  
  // Field input baru
  const [inputFieldTypeName, setInputFieldTypeName] = useState<string>('');
  const [inputPercentage, setInputPercentage] = useState<string>('');
  
  // Daftar baris kalibrasi dalam state client
  const [items, setItems] = useState<CalibrationItemRow[]>([]);

  // Selected profile for viewing detail
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedProfileDetail, setSelectedProfileDetail] = useState<any | null>(null);

  // Hitung total persentase real-time
  const totalPercentage = items.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0);
  const isHundredPercent = Math.abs(totalPercentage - 100) < 0.01;

  const fetchProfiles = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/calibration-profiles`);
      if (res.ok) {
        const json = await res.json();
        setProfiles(json.data || []);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.detail || 'Gagal memuat daftar profil kalibrasi.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Koneksi jaringan terputus saat memuat profil.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [tenantId]);

  // Tambahkan baris baru ke array state
  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = inputFieldTypeName.trim();
    const numPct = parseFloat(inputPercentage);

    if (!cleanName) {
      setErrorMessage('Field Nama Tipe wajib diisi.');
      return;
    }

    if (isNaN(numPct) || numPct < 0 || numPct > 100) {
      setErrorMessage('Field Persentase harus berupa angka antara 0 hingga 100.');
      return;
    }

    setErrorMessage(null);
    setItems((prev) => [
      ...prev,
      {
        field_type_name: cleanName,
        percentage: Math.round(numPct * 100) / 100,
      },
    ]);

    // Kosongkan form input
    setInputFieldTypeName('');
    setInputPercentage('');
  };

  // Hapus baris dari array state
  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Simpan Profil Kalibrasi ke backend
  const handleSaveProfile = async () => {
    const cleanProfileName = profileName.trim();
    if (!cleanProfileName) {
      setErrorMessage('Nama profil kalibrasi wajib diisi.');
      return;
    }

    if (items.length === 0) {
      setErrorMessage('Tambahkan minimal satu baris kalibrasi sebelum menyimpan.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      const payload = {
        profile_name: cleanProfileName,
        domain_category: domainCategory || null,
        items: items.map((it, idx) => ({
          field_type_name: it.field_type_name,
          percentage: it.percentage,
          display_order: idx,
        })),
      };

      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/calibration-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        setSuccessMessage(`Profil kalibrasi "${cleanProfileName}" berhasil disimpan.`);
        // Reset form
        setProfileName('');
        setDomainCategory('');
        setItems([]);
        setInputFieldTypeName('');
        setInputPercentage('');
        // Refresh list
        await fetchProfiles();
        if (onProfileSaved && json.data?.id) {
          onProfileSaved(json.data.id);
        }
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.detail || 'Gagal menyimpan profil kalibrasi.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Koneksi jaringan terputus saat menyimpan.');
    } finally {
      setIsSaving(false);
    }
  };

  // Hapus profil yang ada
  const handleDeleteProfile = async (id: string, name: string) => {
    if (!confirm(`Hapus profil kalibrasi "${name}"? Tindakan ini permanen.`)) return;

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/calibration-profiles/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSuccessMessage(`Profil "${name}" berhasil dihapus.`);
        if (selectedProfileId === id) {
          setSelectedProfileId(null);
          setSelectedProfileDetail(null);
        }
        fetchProfiles();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.detail || 'Gagal menghapus profil.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus profil.');
    }
  };

  // Ambil detail profil untuk inspeksi
  const handleSelectProfileToView = async (id: string) => {
    setSelectedProfileId(id);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/calibration-profiles/${id}`);
      if (res.ok) {
        const json = await res.json();
        setSelectedProfileDetail(json.data);
      }
    } catch {
      setSelectedProfileDetail(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Info Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sliders className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                Setting Kalibrasi Bobot Kriteria
              </h1>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Tentukan bobot persentase kriteria evaluasi secara dinamis sebelum agen AI menjalankan alur seleksi.
              Bila tidak diset, AI akan berjalan otomatis sesuai keahlian bawaan tanpa aturan tambahan.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchProfiles}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Notifikasi Sukses / Galat */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs animate-in fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Kolom Kiri: Form Kalibrasi Dinamis (7 kolom) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Buat Profil Kalibrasi Baru
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Tentukan nama profil dan daftarkan baris nama tipe beserta persentase bobot kriteria.
              </p>
            </div>

            {/* Header Form: Nama Profil & Kategori Domain */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Nama Profil Kalibrasi <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Misal: Kalibrasi Evaluasi Vendor Cloud" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none transition"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Kategori Domain (Opsional)
                </label>
                <select
                  value={domainCategory}
                  onChange={(e) => setDomainCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none transition"
                >
                  <option value="">Semua Domain (Umum)</option>
                  <option value="recruitment">Rekrutmen & Talenta</option>
                  <option value="supplier">Pengadaan & Vendor</option>
                  <option value="finance">Keuangan & Investasi</option>
                  <option value="sales">Penjualan & Prospek</option>
                  <option value="general">Operasional Umum</option>
                </select>
              </div>
            </div>

            {/* Dua field form kosong: Field Nama Tipe & Field Persentase */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                Input Baris Kriteria
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-7">
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Field Nama Tipe
                  </label>
                  <input
                    type="text"
                    value={inputFieldTypeName}
                    onChange={(e) => setInputFieldTypeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddItem();
                      }
                    }}
                    placeholder="Contoh: Pengalaman Kerja, Harga Penawaran, Kualitas Dokumen" // allowlist: standard UI input hint
                    className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Field Persentase (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={inputPercentage}
                      onChange={(e) => setInputPercentage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItem();
                        }
                      }}
                      placeholder="0 - 100" // allowlist: standard UI input hint
                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg pl-3 pr-7 py-2 text-xs text-white focus:outline-none transition"
                    />
                    <span className="absolute right-2.5 top-2 text-xs text-slate-400 font-mono pointer-events-none">
                      %
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => handleAddItem()}
                    className="w-full h-[34px] flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tombol "Tambahkan Kalibrasi" */}
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => handleAddItem()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-800/40 transition shadow-sm"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Tambahkan Kalibrasi</span>
              </button>
            </div>

            {/* Daftar Baris Kalibrasi */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 border-b border-slate-800 pb-2">
                <span>Daftar Kriteria Terkalibrasi ({items.length})</span>
                <span>Bobot Input</span>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                  Belum ada baris kalibrasi yang ditambahkan. Masukkan "Field Nama Tipe" dan "Field Persentase" di atas lalu klik "Tambahkan Kalibrasi".
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {items.map((row, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 text-[11px] font-mono flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-white">
                            {row.field_type_name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Urutan: #{idx + 1}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                          {row.percentage}%
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                          title="Hapus baris ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Indikator Total Persentase Real-time & Validasi UX */}
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isHundredPercent
                  ? 'bg-emerald-950/30 border-emerald-600/60 text-emerald-300'
                  : 'bg-amber-950/30 border-amber-600/60 text-amber-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isHundredPercent ? (
                  <CheckCircle2 className="w-5 h-5 text-[#1FA35A] dark:text-[#34D399] shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-[#F5A623] shrink-0" />
                )}
                <div>
                  <div className="text-xs font-bold">
                    {isHundredPercent
                      ? `Total: 100% (Sempurna & Seimbang)`
                      : `Total: ${totalPercentage}% (belum 100%)`}
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    {isHundredPercent
                      ? 'Seluruh persentase kriteria genap 100% dan siap digunakan secara langsung.'
                      : 'Total kriteria belum genap 100%. Sistem akan menyimpan nilai asli preferensi Anda dan menormalisasikannya secara proporsional saat seleksi.'}
                  </div>
                </div>
              </div>

              <div className="text-right font-mono text-sm font-extrabold px-3 py-1 rounded-lg bg-black/30 shrink-0">
                {totalPercentage.toFixed(1)}%
              </div>
            </div>

            {/* Tombol Simpan Profil Kalibrasi */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSaving || items.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-700/20 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Profil Kalibrasi'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Daftar Profil Kalibrasi Aktif Milik Tenant (5 kolom) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Profil Aktif Organisasi
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Daftar profil kalibrasi tersimpan yang dapat dipilih pada pekerjaan seleksi.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {profiles.length}
              </span>
            </div>

            {isLoading ? (
              <div className="py-8">
                <SkeletonLoader count={3} />
              </div>
            ) : profiles.length === 0 ? (
              <EmptyState
                id="empty-calibration-profiles"
                icon={Sliders}
                title="Belum Ada Profil Kalibrasi"
                description="Buat profil kalibrasi pertama Anda pada formulir di sebelah kiri untuk menyesuaikan bobot seleksi agen AI."
              />
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {profiles.map((p) => {
                  const isCurrentSelected = selectedProfileId === p.id;
                  const isBal = Math.abs(p.total_percentage - 100) < 0.01;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProfileToView(p.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition ${
                        isCurrentSelected
                          ? 'bg-slate-950 border-emerald-500 shadow-md ring-1 ring-emerald-500/20'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {p.profile_name}
                            </span>
                            {p.domain_category && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                {p.domain_category}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span>{p.items_count} Kriteria</span>
                            <span>•</span>
                            <span className={`font-mono font-semibold ${isBal ? 'text-emerald-400' : 'text-amber-400'}`}>
                              Total: {p.total_percentage}% {isBal ? '' : '(belum 100%)'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProfile(p.id, p.profile_name);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                          title="Hapus profil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Detail preview jika dipilih */}
                      {isCurrentSelected && selectedProfileDetail && (
                        <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 animate-in fade-in">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                            Rincian Kriteria:
                          </span>
                          <div className="space-y-1">
                            {selectedProfileDetail.items?.map((it: any, idx: number) => (
                              <div
                                key={it.id || idx}
                                className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-900/60"
                              >
                                <span className="text-slate-300">{it.field_type_name}</span>
                                <span className="font-mono text-emerald-400 font-bold">
                                  {it.percentage}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
