'use client';

import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  BarChart3,
  X,
  Zap,
  Users,
  Eye,
  Archive,
  Info
} from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export interface StandardJobTitle {
  id: string;
  title_code: string;
  title_name: string;
  category_tag: string;
  primary_deliverable: string;
  structural_role?: {
    id: string;
    role_code: string;
    name: string;
  };
  job_level?: {
    level_code: string;
    name: string;
  };
}

export interface MCPToolItem {
  id: string;
  key_name: string;
  description: string;
  risk_tier: string;
  is_active: boolean;
}

export interface BlueprintItem {
  id: string;
  blueprint_code: string;
  display_name: string;
  description: string;
  industry_category: string;
  job_title_id: string;
  job_title_name?: string;
  job_title_code?: string;
  structural_role_id?: string;
  structural_role_name?: string;
  default_skill_summary: string;
  recommended_tool_keys: string[];
  recommended_model_capability?: string;
  rollout_stage: 'internal_review' | 'beta_tenant' | 'general_availability' | 'deprecated';
  created_at: string;
  updated_at?: string;
  adoption_count: number;
}

export interface JobTitleCoverageItem {
  job_title_id: string;
  title_code: string;
  title_name: string;
  category_tag: string;
  blueprint_count: number;
  ga_count: number;
  beta_count: number;
  review_count: number;
}

export interface AdoptionStats {
  blueprint_id: string;
  active_agents_count: number;
  total_agents_created: number;
  tenant_adoption_count: number;
  rollout_history: Array<{
    from_stage: string | null;
    to_stage: string;
    reason: string;
    changed_at: string | null;
  }>;
}

const INDUSTRY_OPTIONS = [
  { value: 'retail', label: 'Ritel & E-Commerce' },
  { value: 'finance', label: 'Keuangan & Perbankan' },
  { value: 'healthcare', label: 'Layanan Kesehatan' },
  { value: 'logistics', label: 'Logistik & Distribusi' },
  { value: 'technology', label: 'Teknologi & SaaS' },
  { value: 'human_resources', label: 'Manajemen SDM' },
  { value: 'consulting', label: 'Konsultasi & Riset' },
  { value: 'manufacturing', label: 'Manufaktur & Pabrikasi' },
  { value: 'general_enterprise', label: 'Korporat Umum' },
  { value: 'legal', label: 'Hukum & Kepatuhan' },
  { value: 'analytics', label: 'Analitik & Business Intelligence' },
  { value: 'other', label: 'Lainnya' },
];

const MODEL_CAPABILITY_OPTIONS = [
  { value: 'text_reasoning', label: 'Penalaran Teks & Eksekusi SOP (Text Reasoning)' },
  { value: 'multimodal', label: 'Multimodal Visual & Dokumen (Multimodal)' },
  { value: 'image_gen', label: 'Generasi Aset Visual Terstandar (Image Gen)' },
];

export const AgentBlueprintCatalogScreen: React.FC = () => {
  const [blueprints, setBlueprints] = useState<BlueprintItem[]>([]);
  const [jobTitles, setJobTitles] = useState<StandardJobTitle[]>([]);
  const [mcpTools, setMcpTools] = useState<MCPToolItem[]>([]);
  const [coverageStats, setCoverageStats] = useState<JobTitleCoverageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [industryFilter, setIndustryFilter] = useState<string>('ALL');
  const [jobTitleFilter, setJobTitleFilter] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showPromoteModal, setShowPromoteModal] = useState<boolean>(false);
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [activeBlueprint, setActiveBlueprint] = useState<BlueprintItem | null>(null);
  const [adoptionStats, setAdoptionStats] = useState<AdoptionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  // Form: Tambah Blueprint Baru
  const [formIndustry, setFormIndustry] = useState<string>('retail');
  const [formDisplayName, setFormDisplayName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formJobTitleId, setFormJobTitleId] = useState<string>('');
  const [formStructuralRoleId, setFormStructuralRoleId] = useState<string>('');
  const [formSkillSummary, setFormSkillSummary] = useState<string>('');
  const [formSelectedTools, setFormSelectedTools] = useState<string[]>([]);
  const [formModelCapability, setFormModelCapability] = useState<string>('text_reasoning');
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);

  // Form: Promosikan Rilis
  const [promoteTargetStage, setPromoteTargetStage] = useState<string>('general_availability');
  const [promoteReason, setPromoteReason] = useState<string>('');
  const [promoteSubmitting, setPromoteSubmitting] = useState<boolean>(false);

  const fetchInitialData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [bpRes, jtRes, toolsRes, covRes] = await Promise.all([
        fetch('/api/v1/admin/agent-blueprints'),
        fetch('/api/v1/admin/job-titles'),
        fetch('/api/v1/admin/mcp-tools'),
        fetch('/api/v1/admin/agent-blueprints/job-title-coverage'),
      ]);

      if (bpRes.ok) {
        const bpData = await bpRes.json();
        setBlueprints(Array.isArray(bpData) ? bpData : []);
      }
      if (jtRes.ok) {
        const jtData = await jtRes.json();
        setJobTitles(Array.isArray(jtData) ? jtData : []);
        if (Array.isArray(jtData) && jtData.length > 0 && !formJobTitleId) {
          setFormJobTitleId(jtData[0].id);
          if (jtData[0].structural_role) {
            setFormStructuralRoleId(jtData[0].structural_role.id);
          }
        }
      }
      if (toolsRes.ok) {
        const toolsData = await toolsRes.json();
        setMcpTools(Array.isArray(toolsData) ? toolsData : []);
      }
      if (covRes.ok) {
        const covData = await covRes.json();
        setCoverageStats(Array.isArray(covData) ? covData : []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat master data blueprint.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleJobTitleChange = (jtId: string) => {
    setFormJobTitleId(jtId);
    const matched = jobTitles.find((j) => j.id === jtId);
    if (matched && matched.structural_role) {
      setFormStructuralRoleId(matched.structural_role.id);
    } else {
      setFormStructuralRoleId('');
    }
  };

  const handleToolToggle = (toolKey: string) => {
    setFormSelectedTools((prev) =>
      prev.includes(toolKey) ? prev.filter((t) => t !== toolKey) : [...prev, toolKey]
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDisplayName.trim() || !formDescription.trim() || !formJobTitleId) {
      setErrorMsg('Nama tampilan, deskripsi fungsional, dan Jabatan Utama wajib diisi.');
      return;
    }
    if (formSelectedTools.length === 0) {
      setErrorMsg('Pilih minimal satu perkakas MCP aktif yang direkomendasikan.');
      return;
    }

    setFormSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/admin/agent-blueprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry_category: formIndustry,
          display_name: formDisplayName.trim(),
          description: formDescription.trim(),
          job_title_id: formJobTitleId,
          structural_role_id: formStructuralRoleId || null,
          default_skill_summary: formSkillSummary.trim(),
          recommended_tool_keys: formSelectedTools,
          recommended_model_capability: formModelCapability,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Gagal menyimpan blueprint baru.');
      }

      setSuccessMsg(`Blueprint '${data.display_name}' berhasil didaftarkan (Status: internal_review).`);
      setShowCreateModal(false);
      // Reset form
      setFormDisplayName('');
      setFormDescription('');
      setFormSkillSummary('');
      setFormSelectedTools([]);
      fetchInitialData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBlueprint) return;
    if (!promoteReason.trim()) {
      setErrorMsg('Alasan perubahan status rilis wajib diisi untuk pencatatan audit log.');
      return;
    }

    setPromoteSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/agent-blueprints/${activeBlueprint.id}/rollout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_stage: promoteTargetStage,
          reason: promoteReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Gagal memperbarui status rilis blueprint.');
      }

      setSuccessMsg(`Status rilis blueprint '${activeBlueprint.display_name}' berhasil diperbarui ke '${promoteTargetStage}'.`);
      setShowPromoteModal(false);
      setPromoteReason('');
      fetchInitialData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setPromoteSubmitting(false);
    }
  };

  const handleOpenStats = async (bp: BlueprintItem) => {
    setActiveBlueprint(bp);
    setShowStatsModal(true);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/agent-blueprints/${bp.id}/adoption-stats`);
      if (res.ok) {
        const data = await res.json();
        setAdoptionStats(data);
      }
    } catch (e: any) {
      console.warn('Adoption stats error:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  const filteredBlueprints = blueprints.filter((bp) => {
    if (industryFilter !== 'ALL' && bp.industry_category !== industryFilter) return false;
    if (jobTitleFilter !== 'ALL' && bp.job_title_id !== jobTitleFilter) return false;
    if (stageFilter !== 'ALL' && bp.rollout_stage !== stageFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = bp.display_name.toLowerCase().includes(q);
      const matchDesc = bp.description.toLowerCase().includes(q);
      const matchCode = bp.blueprint_code.toLowerCase().includes(q);
      const matchJt = (bp.job_title_name || '').toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchCode && !matchJt) return false;
    }
    return true;
  });

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Katalog Jabatan & Skill AI (Master Blueprint)
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Repositori template kerja AI Agent terstandarisasi. Seluruh use-case dirumuskan dengan bahasa fungsional netral tanpa brand asing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchInitialData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Blueprint Baru</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Indikator Sebaran Blueprint per 15 Jabatan Utama */}
      <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Indikator Sebaran Blueprint per 15 Jabatan Utama</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Terisi: {coverageStats.filter((c) => c.blueprint_count > 0).length} / {jobTitles.length || 15} Jabatan
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {coverageStats.map((item) => {
            const hasBp = item.blueprint_count > 0;
            return (
              <div
                key={item.job_title_id}
                className={`p-2.5 rounded-xl border transition-all ${
                  hasBp
                    ? 'bg-slate-900/80 border-slate-700/80'
                    : 'bg-amber-950/20 border-amber-900/50 text-amber-300'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-semibold truncate text-white" title={item.title_name}>
                    {item.title_name}
                  </span>
                  <span
                    className={`font-mono px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      hasBp ? 'bg-purple-950 text-purple-300 border border-purple-800/60' : 'bg-amber-900/60 text-amber-200'
                    }`}
                  >
                    {item.blueprint_count}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center justify-between">
                  <span>{item.category_tag}</span>
                  {hasBp ? (
                    <span className="text-emerald-400">{item.ga_count} Rilis</span>
                  ) : (
                    <span className="text-amber-400">Belum Ada</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari blueprint, kode, deskripsi, atau jabatan..." // allowlist: standard HTML input guidance
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500" // allowlist: standard tailwind styling
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none"
          >
            <option value="ALL">Semua Industri</option>
            {INDUSTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={jobTitleFilter}
            onChange={(e) => setJobTitleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none"
          >
            <option value="ALL">Semua Jabatan Utama</option>
            {jobTitles.map((jt) => (
              <option key={jt.id} value={jt.id}>
                {jt.title_name}
              </option>
            ))}
          </select>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none"
          >
            <option value="ALL">Semua Status Rilis</option>
            <option value="general_availability">Umum (General Availability)</option>
            <option value="beta_tenant">Khusus Beta Tenant</option>
            <option value="internal_review">Review Internal</option>
            <option value="deprecated">Nonaktif (Deprecated)</option>
          </select>
        </div>
      </div>

      {/* Blueprint Table */}
      <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span>Memuat repositori blueprint resmi...</span>
          </div>
        ) : filteredBlueprints.length === 0 ? (
          <div className="p-8">
            <EmptyState
              id="empty-blueprint-admin"
              icon={Boxes}
              title="Belum Ada Blueprint Sesuai Filter"
              description="Tidak ditemukan blueprint yang sesuai dengan kriteria penyaringan saat ini. Sesuaikan filter atau daftarkan blueprint baru."
              actionLabel="Tambah Blueprint Baru"
              onAction={() => setShowCreateModal(true)}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Kode & Nama Blueprint</th>
                  <th className="py-3 px-4">Jabatan Utama & Peran</th>
                  <th className="py-3 px-4">Industri</th>
                  <th className="py-3 px-4">Perkakas Rekomendasi</th>
                  <th className="py-3 px-4">Status Rilis</th>
                  <th className="py-3 px-4 text-center">Adopsi</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredBlueprints.map((bp) => {
                  const stageBadge = {
                    general_availability: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
                    beta_tenant: 'bg-blue-950/80 text-blue-300 border-blue-800/80',
                    internal_review: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
                    deprecated: 'bg-slate-800 text-slate-400 border-slate-700',
                  }[bp.rollout_stage] || 'bg-slate-800 text-slate-400';

                  const stageLabel = {
                    general_availability: 'Umum (GA)',
                    beta_tenant: 'Beta Tenant',
                    internal_review: 'Review Internal',
                    deprecated: 'Nonaktif',
                  }[bp.rollout_stage] || bp.rollout_stage;

                  return (
                    <tr key={bp.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-white truncate" title={bp.display_name}>
                          {bp.display_name}
                        </div>
                        <div className="text-[11px] font-mono text-purple-400 mt-0.5">{bp.blueprint_code}</div>
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{bp.description}</p>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-200">{bp.job_title_name || '-'}</div>
                        <div className="text-[11px] text-slate-400">{bp.structural_role_name || 'Spesialis'}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-300 capitalize">
                        {bp.industry_category.replace('_', ' ')}
                      </td>
                      <td className="py-3.5 px-4 max-w-[200px]">
                        <div className="flex flex-wrap gap-1">
                          {bp.recommended_tool_keys.slice(0, 3).map((k) => (
                            <span
                              key={k}
                              className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300"
                            >
                              {k}
                            </span>
                          ))}
                          {bp.recommended_tool_keys.length > 3 && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              +{bp.recommended_tool_keys.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stageBadge}`}>
                          {stageLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenStats(bp)}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-bold text-slate-200 border border-slate-700 transition-colors"
                          title="Lihat rincian adopsi"
                        >
                          {bp.adoption_count} agen
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveBlueprint(bp);
                              setPromoteTargetStage(
                                bp.rollout_stage === 'internal_review'
                                  ? 'beta_tenant'
                                  : bp.rollout_stage === 'beta_tenant'
                                  ? 'general_availability'
                                  : 'deprecated'
                              );
                              setShowPromoteModal(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border border-purple-700/60 text-[11px] font-semibold transition-colors"
                          >
                            Ubah Status
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Tambah Blueprint Baru (Manual-Assisted) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B1220] border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-sm">Pendaftaran Master Blueprint AI Agent Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/50 text-[11px] text-purple-200 flex items-start gap-2">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                <strong>Aturan Perumusan:</strong> Tulis ulang deskripsi fungsional blueprint dengan kata-kata sendiri. Dilarang menyalin verbatim atau mencantumkan merek/nama sumber luar. Blueprint akan diawali dengan status <em>internal_review</em>.
              </span>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Kategori Industri *</label>
                  <select
                    value={formIndustry}
                    onChange={(e) => setFormIndustry(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Jabatan Utama (15 Katalog) *</label>
                  <select
                    value={formJobTitleId}
                    onChange={(e) => handleJobTitleChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                    required
                  >
                    {jobTitles.map((jt) => (
                      <option key={jt.id} value={jt.id}>
                        {jt.title_name} ({jt.category_tag})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nama Tampilan Fungsional *</label>
                <input
                  type="text"
                  required
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder="Misal: Blueprint: Kualifikasi Prospek & Penutupan Penjualan B2B" // allowlist: standard HTML input guidance
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Deskripsi Fungsional (Tulis Ulang Sendiri) *</label>
                <textarea
                  required
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Tulis ulang fungsi blueprint ini dengan bahasa sendiri, jangan salin dari sumber luar. Jelaskan nilai bisnis dan alur kerja utama agen." // allowlist: standard HTML input guidance
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Ringkasan Skill Bawaan</label>
                <input
                  type="text"
                  value={formSkillSummary}
                  onChange={(e) => setFormSkillSummary(e.target.value)}
                  placeholder="Misal: Verifikasi kontak prospek, evaluasi diskon terstruktur, draf kontrak" // allowlist: standard HTML input guidance
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Kapabilitas Model (Model Router)</label>
                <select
                  value={formModelCapability}
                  onChange={(e) => setFormModelCapability(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {MODEL_CAPABILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Multi-Select Tool dari MCP Tool Registry */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-slate-300 font-semibold">
                    Perkakas yang Direkomendasikan (MCP Tools Aktif) *
                  </label>
                  <span className="text-[11px] text-purple-400 font-mono">
                    {formSelectedTools.length} perkakas terpilih
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {mcpTools.map((t) => {
                    const isChecked = formSelectedTools.includes(t.key_name);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-[11px] border transition-colors ${
                          isChecked
                            ? 'bg-purple-950/60 border-purple-700 text-purple-200'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToolToggle(t.key_name)}
                          className="rounded border-slate-600 text-purple-600 focus:ring-0"
                        />
                        <div className="truncate">
                          <div className="font-mono font-medium text-slate-200 truncate">{t.key_name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{t.description || t.risk_tier}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {formSubmitting ? 'Memverifikasi & Menyimpan...' : 'Simpan Blueprint Resmi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Promosikan Tahap Rilis */}
      {showPromoteModal && activeBlueprint && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B1220] border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 text-white shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm">Ubah Status Rilis Blueprint</h3>
              <button
                type="button"
                onClick={() => setShowPromoteModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <span className="text-slate-400 block text-[11px]">Blueprint:</span>
              <span className="font-bold text-white text-xs">{activeBlueprint.display_name}</span>
              <span className="block font-mono text-[10px] text-purple-400">{activeBlueprint.blueprint_code}</span>
            </div>

            <form onSubmit={handlePromoteSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Status Rilis Tujuan *</label>
                <select
                  value={promoteTargetStage}
                  onChange={(e) => setPromoteTargetStage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none"
                >
                  <option value="beta_tenant">Khusus Beta Tenant (BETA_TENANT)</option>
                  <option value="general_availability">Umum untuk Semua Tenant (GA)</option>
                  <option value="internal_review">Review Internal (INTERNAL_REVIEW)</option>
                  <option value="deprecated">Nonaktifkan (DEPRECATED)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Alasan Perubahan Status (Wajib Audit) *</label>
                <textarea
                  required
                  rows={3}
                  value={promoteReason}
                  onChange={(e) => setPromoteReason(e.target.value)}
                  placeholder="Jelaskan alasan pembaruan status rilis untuk dicatat pada log audit..." // allowlist: standard HTML input guidance
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPromoteModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={promoteSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold disabled:opacity-50"
                >
                  {promoteSubmitting ? 'Memproses...' : 'Terapkan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Statistik Adopsi Nyata */}
      {showStatsModal && activeBlueprint && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B1220] border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 text-white shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-sm">Metrik Adopsi Nyata Blueprint</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowStatsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <span className="font-bold text-white">{activeBlueprint.display_name}</span>
              <span className="block font-mono text-[10px] text-purple-400">{activeBlueprint.blueprint_code}</span>
            </div>

            {statsLoading ? (
              <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>Memuat data adopsi riil...</span>
              </div>
            ) : adoptionStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Agen Aktif</span>
                    <span className="text-lg font-bold font-mono text-emerald-400">
                      {adoptionStats.active_agents_count}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Total Dibuat</span>
                    <span className="text-lg font-bold font-mono text-purple-400">
                      {adoptionStats.total_agents_created}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Tenant Pengguna</span>
                    <span className="text-lg font-bold font-mono text-blue-400">
                      {adoptionStats.tenant_adoption_count}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="font-bold text-slate-300 block mb-1.5">Riwayat Transisi Status Rilis:</span>
                  {adoptionStats.rollout_history.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Belum ada riwayat transisi status.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {adoptionStats.rollout_history.map((log, i) => (
                        <div key={i} className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px]">
                          <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 mb-0.5">
                            <span>
                              {log.from_stage || 'awal'} → <strong className="text-purple-300">{log.to_stage}</strong>
                            </span>
                            <span>{log.changed_at ? new Date(log.changed_at).toLocaleDateString('id-ID') : '-'}</span>
                          </div>
                          <p className="text-slate-300">{log.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-slate-400">Tidak ada metrik adopsi.</p>
            )}

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowStatsModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
