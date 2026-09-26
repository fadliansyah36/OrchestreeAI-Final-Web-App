'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Users,
  Briefcase,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

export interface RoleAccessTier {
  id: string;
  role_code: string;
  description: string;
  access_tier: 'staff' | 'department_lead' | 'executive';
}

interface AccessTierConfigScreenProps {
  tenantId: string;
  onBack?: () => void;
}

export const AccessTierConfigScreen: React.FC<AccessTierConfigScreenProps> = ({
  tenantId,
  onBack,
}) => {
  const [roles, setRoles] = useState<RoleAccessTier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingCode, setUpdatingCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/access-tier/roles`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal memuat konfigurasi tingkat akses peran.');
      }
      const json = await res.json();
      setRoles(json.data || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleUpdateTier = async (roleCode: string, newTier: 'staff' | 'department_lead' | 'executive') => {
    setUpdatingCode(roleCode);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/access-tier/roles/${roleCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_tier: newTier }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal memperbarui tingkat akses peran.');
      }

      setSuccessMsg(`Tingkat akses peran '${roleCode}' berhasil diperbarui menjadi '${newTier}'. Perubahan dicatat di Audit Log.`);
      await fetchRoles();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui peran.');
    } finally {
      setUpdatingCode(null);
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'executive':
        return (
          <span className="text-xs font-semibold text-amber-400">
            · Eksekutif (Lintas Departemen)
          </span>
        );
      case 'department_lead':
        return (
          <span className="text-xs font-semibold text-sky-400">
            · Pimpinan Departemen (Tim Sendiri)
          </span>
        );
      default:
        return (
          <span className="text-xs font-semibold text-emerald-400">
            · Staf (Pribadi & Kolaborasi)
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Konfigurasi Tingkat Akses Peran (Access Tier)
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Khusus Owner: Atur cakupan data lintas departemen per peran. Perubahan dicatat permanen di Audit Ledger.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchRoles}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-800 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Muat Ulang"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Kembali
            </button>
          )}
        </div>
      </div>

      {/* Audit Warning Banner */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-amber-300">Peringatan Keamanan & Isolasi Data Multi-Tenant:</span>
          <p className="text-amber-200/90 leading-relaxed">
            Peran dengan tingkat <strong className="text-white">Eksekutif</strong> dapat melihat rangkuman seluruh
            departemen melalui AI Chief of Staff. Peran <strong className="text-white">Pimpinan Departemen</strong> hanya
            melihat board departemennya. Jika Anda ingin Administrator (misal HR) tidak melihat data keuangan/departemen lain,
            ubah tingkat aksesnya menjadi Pimpinan Departemen.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Roles List */}
      <div className="space-y-4">
        {loading ? (
          <SkeletonLoader variant="card" count={4} />
        ) : (
          roles.map((role) => {
            const isProtected = role.role_code === 'TENANT_OWNER' || role.role_code === 'SUPER_ADMIN';
            const isUpdating = updatingCode === role.role_code;

            return (
              <div
                key={role.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
              >
                <div className="space-y-1.5 max-w-md">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white text-sm tracking-wide">{role.role_code}</span>
                    {getTierBadge(role.access_tier)}
                    {isProtected && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-500" title="Dilindungi sistem">
                        <Lock className="w-3 h-3" />
                        <span>Terkunci</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{role.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  {isProtected ? (
                    <span className="text-xs text-slate-500 italic">Tingkat akses mutlak</span>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
                      <button
                        type="button"
                        onClick={() => handleUpdateTier(role.role_code, 'staff')}
                        disabled={isUpdating || role.access_tier === 'staff'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          role.access_tier === 'staff'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Staf
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTier(role.role_code, 'department_lead')}
                        disabled={isUpdating || role.access_tier === 'department_lead'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          role.access_tier === 'department_lead'
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Pimpinan Dept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTier(role.role_code, 'executive')}
                        disabled={isUpdating || role.access_tier === 'executive'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          role.access_tier === 'executive'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Eksekutif
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
