'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Bot,
  Star,
  CheckCircle2,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Crown,
  ShieldCheck,
  Briefcase,
  ArrowRight,
  ExternalLink,
  Info
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

export interface EligibleAgent {
  id: string;
  tenant_id: string;
  department_id?: string | null;
  display_name: string;
  code_name: string;
  status: string;
  system_prompt?: string | null;
  avatar_url?: string | null;
  job_title_id: string;
  title_code: string;
  title_name: string;
  badge_stars: number;
  category_tag: string;
  is_cross_department: boolean;
  relevant_department_category?: string | null;
  department_name?: string | null;
  agent_department_category?: string | null;
}

export interface ActiveCollaboration {
  id: string;
  tenant_id: string;
  tenant_membership_id: string;
  ai_agent_id: string;
  is_primary: boolean;
  added_by: string;
  created_at: string;
  agent_display_name: string;
  agent_code_name: string;
  agent_avatar_url?: string | null;
  title_code: string;
  title_name: string;
  badge_stars: number;
  category_tag: string;
  relevant_department_category?: string | null;
}

interface CollaborationSetupScreenProps {
  tenantId: string;
  membershipId?: string;
  onBack?: () => void;
  onComplete?: () => void;
}

export const CollaborationSetupScreen: React.FC<CollaborationSetupScreenProps> = ({
  tenantId,
  membershipId,
  onBack,
  onComplete,
}) => {
  const [eligibleAgents, setEligibleAgents] = useState<EligibleAgent[]>([]);
  const [activeCollabs, setActiveCollabs] = useState<ActiveCollaboration[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isExecutive, setIsExecutive] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const q = membershipId ? `?membership_id=${membershipId}` : '';
      const headers: Record<string, string> = {};
      if (membershipId) {
        headers['x-membership-id'] = membershipId;
      }

      // 1. Fetch eligible agents
      const agentRes = await fetch(`/api/v1/tenants/${tenantId}/proactive/eligible-agents${q}`, { headers });
      if (agentRes.status === 400) {
        const errData = await agentRes.json();
        if (errData.detail && errData.detail.includes('Eksekutif')) {
          setIsExecutive(true);
          setLoading(false);
          return;
        }
      }
      if (!agentRes.ok) {
        const err = await agentRes.json();
        throw new Error(err.detail || 'Gagal memuat daftar AI Agent kolaborator.');
      }
      const agentJson = await agentRes.json();
      setEligibleAgents(agentJson.data || []);

      // 2. Fetch active collaborations
      const collabRes = await fetch(`/api/v1/tenants/${tenantId}/proactive/collaborations${q}`, { headers });
      if (collabRes.ok) {
        const collabJson = await collabRes.json();
        setActiveCollabs(collabJson.data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, membershipId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddCollaboration = async (agentId: string, isPrimary: boolean = false) => {
    setSubmittingId(agentId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (membershipId) headers['x-membership-id'] = membershipId;

      const res = await fetch(`/api/v1/tenants/${tenantId}/proactive/collaborations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ai_agent_id: agentId,
          is_primary: isPrimary,
          membership_id: membershipId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal mendaftarkan kolaborasi.');
      }

      setSuccessMsg('AI Agent berhasil ditambahkan ke daftar kolaborator Anda.');
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan kolaborasi.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRemoveCollaboration = async (collabId: string) => {
    setSubmittingId(collabId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const headers: Record<string, string> = {};
      if (membershipId) headers['x-membership-id'] = membershipId;

      const q = membershipId ? `?membership_id=${membershipId}` : '';
      const res = await fetch(`/api/v1/tenants/${tenantId}/proactive/collaborations/${collabId}${q}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal menghapus kolaborasi.');
      }

      setSuccessMsg('Kolaborasi AI Agent berhasil dihapus.');
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus kolaborasi.');
    } finally {
      setSubmittingId(null);
    }
  };

  const isCollaborated = (agentId: string) => {
    return activeCollabs.some((c) => c.ai_agent_id === agentId);
  };

  if (isExecutive) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
            <Crown className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Pendampingan Eksekutif Otomatis</h2>
          <p className="text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
            Sebagai pimpinan tingkat Eksekutif (Owner / Direksi), Anda secara otomatis didampingi langsung oleh{' '}
            <span className="text-amber-400 font-semibold">Arya (AI Chief of Staff)</span> dengan visibilitas rangkuman
            lintas departemen penuh. Anda tidak perlu memilih kolaborator perorangan.
          </p>
          <div className="pt-4 flex justify-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Kembali
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Kolaborasi Staf Human & AI Agent
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Pilih AI Agent pendamping di departemen Anda untuk menerima briefing harian dan sinkronisasi tugas.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-800 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Muat Ulang"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onComplete && activeCollabs.length > 0 && (
            <button
              type="button"
              onClick={onComplete}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <span>Lanjut ke Jadwal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
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

      {/* Notification Banner */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Info Card */}
      <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-start gap-3 text-xs text-slate-300">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-white">Prinsip Batasan Kolaborasi Departemen:</span>
          <p className="text-slate-400 leading-relaxed">
            Daftar di bawah telah disaring otomatis sesuai departemen Anda. Kartu tugas dan pembaruan AI Agent yang Anda
            pilih akan otomatis disertakan dalam Daily Report WhatsApp/Telegram dan Task Board pribadi Anda.
          </p>
        </div>
      </div>

      {/* Active Collaborations Section */}
      {activeCollabs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>AI Agent Kolaborator Aktif Anda</span>
            <span className="text-xs font-semibold text-emerald-400">
              · {activeCollabs.length} Terpilih
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {activeCollabs.map((collab) => (
              <div
                key={collab.id}
                className={`p-4 rounded-xl border transition-all ${
                  collab.is_primary
                    ? 'bg-emerald-950/20 border-emerald-500/40 ring-1 ring-emerald-500/30'
                    : 'bg-slate-800/80 border-slate-700/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center text-emerald-400 font-bold text-sm">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{collab.agent_display_name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-400 font-medium">{collab.title_name}</span>
                        {collab.is_primary && (
                          <span className="text-[10px] font-semibold text-emerald-300">
                            · Utama
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCollaboration(collab.id)}
                    disabled={submittingId === collab.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Hapus Kolaborasi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eligible Agents Grid */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Pilihan AI Agent yang Tersedia di Departemen Anda
          </h2>
          <span className="text-xs text-slate-400">{eligibleAgents.length} Agen Tersedia</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonLoader variant="card" count={3} />
          </div>
        ) : eligibleAgents.length === 0 ? (
          <EmptyState
            title="Tidak Ada AI Agent di Departemen Ini"
            description="Belum ada AI Agent aktif yang ditugaskan ke departemen Anda saat ini. Silakan hubungi Administrator untuk penugasan agen."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {eligibleAgents.map((agent) => {
              const selected = isCollaborated(agent.id);
              const isSubmitting = submittingId === agent.id;

              return (
                <div
                  key={agent.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    selected
                      ? 'bg-slate-800/40 border-slate-700/60 opacity-80'
                      : 'bg-slate-800/90 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header Card */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-slate-700/80 border border-slate-600/50 flex items-center justify-center text-emerald-400">
                          <Bot className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{agent.display_name}</h3>
                          <div className="flex items-center gap-1 mt-0.5">
                            {Array.from({ length: agent.badge_stars || 1 }).map((_, i) => (
                              <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                        · {agent.category_tag}
                      </span>
                    </div>

                    {/* Official Job Title Badge */}
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/40 space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                        <Briefcase className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{agent.title_name}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2">
                        {agent.system_prompt || 'Menangani otomatisasi dan pendampingan alur kerja operasional terarah.'}
                      </p>
                    </div>

                    {/* Department Scope */}
                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Departemen: {agent.department_name || 'Umum'}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-slate-700/50 mt-3 flex items-center gap-2">
                    {selected ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-1.5 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Sudah Terpilih</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAddCollaboration(agent.id, false)}
                          disabled={isSubmitting}
                          className="flex-1 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Pilih Kolaborator</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddCollaboration(agent.id, true)}
                          disabled={isSubmitting}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Pilih sebagai kolaborator utama"
                        >
                          Jadikan Utama
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
