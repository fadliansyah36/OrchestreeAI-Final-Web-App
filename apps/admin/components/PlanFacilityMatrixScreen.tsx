'use client';

import React, { useState, useEffect } from 'react';
import {
  Grid,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  Check,
  Minus,
  Sparkles,
  Sliders,
  Layers,
  HelpCircle,
  X
} from 'lucide-react';

interface FacilityItem {
  id: string;
  facility_key: string;
  display_name: string;
  display_order: number;
}

interface PlanItem {
  id: string;
  plan_code: string;
  display_name: string;
  display_order: number;
}

type AccessLevel = 'none' | 'basic' | 'advanced' | 'enterprise' | 'custom' | 'limited' | 'unlimited';

const ACCESS_LEVEL_CONFIG: Record<AccessLevel, { label: string; bg: string; text: string; border: string }> = {
  none: { label: 'Tidak Ada', bg: 'bg-slate-900/60', text: 'text-slate-500', border: 'border-slate-800' },
  limited: { label: 'Terbatas', bg: 'bg-amber-950/40', text: 'text-amber-300', border: 'border-amber-800/60' },
  basic: { label: 'Dasar', bg: 'bg-blue-950/40', text: 'text-blue-300', border: 'border-blue-800/60' },
  advanced: { label: 'Lanjutan', bg: 'bg-indigo-950/40', text: 'text-indigo-300', border: 'border-indigo-800/60' },
  enterprise: { label: 'Enterprise', bg: 'bg-purple-950/40', text: 'text-purple-300', border: 'border-purple-800/60' },
  custom: { label: 'Kustom', bg: 'bg-sky-950/40', text: 'text-sky-300', border: 'border-sky-800/60' },
  unlimited: { label: 'Penuh (Tanpa Batas)', bg: 'bg-emerald-950/40', text: 'text-emerald-300', border: 'border-emerald-800/60' },
};

export function PlanFacilityMatrixScreen() {
  const [catalog, setCatalog] = useState<FacilityItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, AccessLevel>>>({});
  const [initialMatrix, setInitialMatrix] = useState<Record<string, Record<string, AccessLevel>>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const fetchMatrixData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/facility-matrix', {
        headers: {
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal memuat matriks fasilitas paket.');
      }

      const data = await res.json();
      setCatalog(data.catalog || []);
      setPlans(data.plans || []);
      setMatrix(data.matrix || {});
      setInitialMatrix(JSON.parse(JSON.stringify(data.matrix || {})));
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat memuat matriks fasilitas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrixData();
  }, []);

  const handleLevelChange = (planId: string, facilityKey: string, newLevel: AccessLevel) => {
    setMatrix((prev) => ({
      ...prev,
      [planId]: {
        ...(prev[planId] || {}),
        [facilityKey]: newLevel,
      },
    }));
  };

  // Deteksi perubahan yang belum disimpan
  const hasUnsavedChanges = () => {
    for (const planId of Object.keys(matrix)) {
      for (const fKey of Object.keys(matrix[planId])) {
        if (!initialMatrix[planId] || initialMatrix[planId][fKey] !== matrix[planId][fKey]) {
          return true;
        }
      }
    }
    return false;
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const updates: Array<{ plan_id: string; facility_key: string; level: string }> = [];

      for (const p of plans) {
        for (const cat of catalog) {
          const currentLevel = matrix[p.id]?.[cat.facility_key] || 'none';
          const oldLevel = initialMatrix[p.id]?.[cat.facility_key] || 'none';
          if (currentLevel !== oldLevel) {
            updates.push({
              plan_id: p.id,
              facility_key: cat.facility_key,
              level: currentLevel,
            });
          }
        }
      }

      if (updates.length === 0) {
        setSuccessFeedback('Tidak ada perubahan yang perlu disimpan.');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/v1/billing/admin/facility-matrix', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal menyimpan perubahan matriks.');
      }

      setInitialMatrix(JSON.parse(JSON.stringify(matrix)));
      setSuccessFeedback(`${updates.length} entri hak akses paket berhasil diperbarui dan tercatat di Audit Ledger.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan pembaruan matriks fasilitas.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCatalog = catalog.filter((c) =>
    c.display_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    c.facility_key.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Grid className="w-5 h-5 text-emerald-400" />
            <span>Matriks Fasilitas Paket Komersial</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Pengaturan hak akses fitur platform lintas 5 paket komersial. Setiap perubahan level terisolasi dan terekam di Audit Ledger.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchMatrixData}
            disabled={loading || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={saving || !hasUnsavedChanges()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
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

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <input
          type="text"
          aria-label="Filter fasilitas"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="w-full sm:w-80 px-3.5 py-2 rounded-xl bg-[#0B1220] border border-slate-800 text-white text-xs text-slate-300 focus:outline-hidden focus:border-emerald-500"
        />

        {hasUnsavedChanges() && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium px-3 py-1 rounded-lg bg-amber-950/30 border border-amber-800/40">
            <AlertTriangle className="w-3.5 h-3.5" />
            Ada perubahan belum disimpan
          </span>
        )}
      </div>

      {/* Matrix Table */}
      <div className="rounded-2xl bg-[#0B1220] border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="py-3.5 px-4 font-bold text-slate-300 min-w-[220px]">
                  Katalog Fasilitas ({filteredCatalog.length})
                </th>
                {plans.map((p) => (
                  <th key={p.id} className="py-3.5 px-3 text-center min-w-[140px]">
                    <div className="font-bold text-white uppercase tracking-wider font-mono">
                      {p.plan_code}
                    </div>
                    <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                      {p.display_name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-800 rounded-md w-3/4" />
                    </td>
                    {plans.map((p) => (
                      <td key={p.id} className="py-3 px-3 text-center">
                        <div className="h-7 bg-slate-800/60 rounded-lg mx-auto w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredCatalog.length === 0 ? (
                <tr>
                  <td colSpan={plans.length + 1} className="py-8 text-center text-slate-500">
                    Tidak ditemukan fasilitas yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredCatalog.map((cat, rowIdx) => (
                  <tr
                    key={cat.id}
                    className={`hover:bg-slate-900/40 transition-colors ${
                      rowIdx % 2 === 0 ? 'bg-transparent' : 'bg-slate-900/20'
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-white">
                      <div className="font-semibold text-slate-200">{cat.display_name}</div>
                      <div className="font-mono text-[10px] text-slate-500 mt-0.5">{cat.facility_key}</div>
                    </td>

                    {plans.map((p) => {
                      const currentLevel: AccessLevel = (matrix[p.id]?.[cat.facility_key] as AccessLevel) || 'none';
                      const initialLevel = initialMatrix[p.id]?.[cat.facility_key] || 'none';
                      const isChanged = currentLevel !== initialLevel;
                      const conf = ACCESS_LEVEL_CONFIG[currentLevel] || ACCESS_LEVEL_CONFIG.none;

                      return (
                        <td key={p.id} className="py-2.5 px-2 text-center">
                          <div className={`relative inline-block w-full max-w-[130px] ${isChanged ? 'ring-2 ring-amber-500/80 rounded-lg' : ''}`}>
                            <select
                              value={currentLevel}
                              onChange={(e) => handleLevelChange(p.id, cat.facility_key, e.target.value as AccessLevel)}
                              className={`w-full py-1.5 px-2 rounded-lg text-xs font-semibold border cursor-pointer appearance-none text-center transition-all ${conf.bg} ${conf.text} ${conf.border} focus:outline-hidden focus:ring-1 focus:ring-emerald-500`}
                            >
                              <option value="none" className="bg-[#0B1220] text-slate-400">Tidak Ada</option>
                              <option value="limited" className="bg-[#0B1220] text-amber-300">Terbatas</option>
                              <option value="basic" className="bg-[#0B1220] text-blue-300">Dasar</option>
                              <option value="advanced" className="bg-[#0B1220] text-indigo-300">Lanjutan</option>
                              <option value="enterprise" className="bg-[#0B1220] text-purple-300">Enterprise</option>
                              <option value="custom" className="bg-[#0B1220] text-sky-300">Kustom</option>
                              <option value="unlimited" className="bg-[#0B1220] text-emerald-300">Penuh (Tanpa Batas)</option>
                            </select>
                          </div>
                        </td>
                      );
                    })}
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
