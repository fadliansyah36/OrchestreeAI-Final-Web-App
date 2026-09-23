import React, { useState, useEffect } from 'react';
import {
  Boxes,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ArrowRight,
  Plus,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronRight,
  RefreshCw,
  Search,
  Lock,
  Globe,
  Users,
  Eye,
  X
} from 'lucide-react';

export type RolloutStage = 'INTERNAL' | 'BETA_TENANT' | 'GENERAL_AVAILABILITY';
export type PolicyScanStatus = 'PENDING' | 'PASSED' | 'FAILED';

export interface PolicyScanViolation {
  rule_id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  location: string;
}

export interface PolicyScanReport {
  status: PolicyScanStatus;
  safety_score: number;
  scanned_at: string;
  rules_evaluated: number;
  violations_found: PolicyScanViolation[];
  summary: string;
}

export interface AgentSkillBlueprint {
  id: string;
  package_id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  system_prompt_template: string;
  required_capabilities: string[];
  tool_definitions: any[];
  default_config: Record<string, any>;
  rollout_stage: RolloutStage;
  allowed_tenant_ids: string[];
  policy_scan_status: PolicyScanStatus;
  policy_scan_report: PolicyScanReport;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  tenantId: string;
  isSuperAdmin?: boolean;
}

export const AgentBlueprintCatalogScreen: React.FC<Props> = ({
  tenantId,
  isSuperAdmin = true,
}) => {
  const [blueprints, setBlueprints] = useState<AgentSkillBlueprint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [selectedBlueprint, setSelectedBlueprint] = useState<AgentSkillBlueprint | null>(null);
  const [showScanModal, setShowScanModal] = useState<boolean>(false);
  const [showRolloutModal, setShowRolloutModal] = useState<boolean>(false);
  const [showIngestModal, setShowIngestModal] = useState<boolean>(false);

  // Rollout transition form state
  const [targetStage, setTargetStage] = useState<RolloutStage>('BETA_TENANT');
  const [betaTenantIdsInput, setBetaTenantIdsInput] = useState<string>(tenantId);
  const [transitionLoading, setTransitionLoading] = useState<boolean>(false);

  // Ingest form state
  const [newPackageId, setNewPackageId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newVersion, setNewVersion] = useState<string>('1.0.0');
  const [newCategory, setNewCategory] = useState<string>('sales');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newSystemPrompt, setNewSystemPrompt] = useState<string>('');
  const [ingestLoading, setIngestLoading] = useState<boolean>(false);

  const fetchBlueprints = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const endpoint = isSuperAdmin
        ? '/api/v1/admin/agent-catalog/blueprints'
        : `/api/v1/tenants/${tenantId}/agent-catalog/available`;

      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`Gagal mengambil katalog blueprint (${res.status})`);
      }
      const data = await res.json();
      setBlueprints(data || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat katalog blueprint agen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlueprints();
  }, [tenantId, isSuperAdmin]);

  const handleRolloutTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlueprint) return;

    setTransitionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const allowedTenants =
        targetStage === 'BETA_TENANT'
          ? betaTenantIdsInput.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

      const res = await fetch(`/api/v1/admin/agent-catalog/blueprints/${selectedBlueprint.id}/rollout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_stage: targetStage,
          allowed_tenant_ids: allowedTenants,
          operator: 'Super Admin',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengubah tahap rollout.');
      }

      setSuccessMsg(`Blueprint '${selectedBlueprint.name}' berhasil diperbarui ke tahap ${targetStage}.`);
      setShowRolloutModal(false);
      await fetchBlueprints();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengubah tahap rollout.');
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleIngestPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngestLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload = {
        package_id: newPackageId.trim(),
        name: newName.trim(),
        version: newVersion.trim(),
        category: newCategory,
        description: newDescription.trim(),
        system_prompt_template: newSystemPrompt.trim(),
        required_capabilities: ['crm.leads.write', 'sales.orders.read'],
        tool_definitions: [
          {
            name: 'qualify_lead',
            description: 'Memeriksa kelayakan calon pelanggan berdasarkan kriteria BANT.',
            parameters: { type: 'object', properties: { budget: { type: 'number' } } },
          },
        ],
        default_config: { temperature: 0.2, max_tokens: 1500 },
        operator: 'Super Admin',
      };

      const res = await fetch('/api/v1/admin/agent-catalog/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal melakukan ingesti paket blueprint.');
      }

      setSuccessMsg(`Paket blueprint '${newName}' berhasil diingesti. Status audit kebijakan: ${data.policy_scan_status}.`);
      setShowIngestModal(false);
      // Reset form
      setNewPackageId('');
      setNewName('');
      setNewDescription('');
      setNewSystemPrompt('');
      await fetchBlueprints();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal melakukan ingesti paket blueprint.');
    } finally {
      setIngestLoading(false);
    }
  };

  const filteredBlueprints = blueprints.filter((bp) => {
    if (stageFilter !== 'ALL' && bp.rollout_stage !== stageFilter) return false;
    if (categoryFilter !== 'ALL' && bp.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        bp.name.toLowerCase().includes(q) ||
        bp.package_id.toLowerCase().includes(q) ||
        bp.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-slate-100">
      {/* Header Hub */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Boxes className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Katalog Blueprint Agen AI
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
              F.01-AGENTCAT
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Katalog terkelola Super Admin untuk template agen AI dengan pemindaian kebijakan keamanan dan pelepasan bertahap.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          {isSuperAdmin && (
            <button
              onClick={() => setShowIngestModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Ingest Blueprint Baru
            </button>
          )}

          <button
            onClick={fetchBlueprints}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama atau paket blueprint..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {isSuperAdmin && (
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Semua Tahap Rollout</option>
              <option value="INTERNAL">Internal (Alpha)</option>
              <option value="BETA_TENANT">Beta Tenant</option>
              <option value="GENERAL_AVAILABILITY">Ketersediaan Umum (GA)</option>
            </select>
          )}

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">Semua Kategori</option>
            <option value="sales">Sales & Komersial</option>
            <option value="operations">Operasional & Layanan</option>
            <option value="finance">Keuangan & Akuntansi</option>
            <option value="intelligence">Intelijen & Analisis</option>
          </select>
        </div>
      </div>

      {/* Blueprint Cards Grid */}
      {filteredBlueprints.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-dashed border-slate-800">
          <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">Belum Ada Blueprint Tersedia</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            {isSuperAdmin
              ? 'Gunakan tombol "Ingest Blueprint Baru" di atas untuk menambahkan template agen AI pertama ke katalog terpusat.'
              : 'Belum ada template agen AI yang dialokasikan untuk tenant Anda. Hubungi administrator platform.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBlueprints.map((bp) => {
            const isPassed = bp.policy_scan_status === 'PASSED';
            const isFailed = bp.policy_scan_status === 'FAILED';

            return (
              <div
                key={bp.id}
                className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {bp.package_id}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">v{bp.version}</span>
                  </div>

                  <h3 className="text-base font-bold text-white tracking-tight">{bp.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{bp.description}</p>
                </div>

                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  {/* Rollout Stage Tag */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Tahap Rollout:</span>
                    {bp.rollout_stage === 'GENERAL_AVAILABILITY' ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Umum (GA)
                      </span>
                    ) : bp.rollout_stage === 'BETA_TENANT' ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1">
                        <Users className="w-3 h-3" /> Beta Tenant
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-700 text-slate-300 border border-slate-600 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Internal Alpha
                      </span>
                    )}
                  </div>

                  {/* Policy Scanner Status */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Status Kebijakan:</span>
                    {isPassed ? (
                      <button
                        onClick={() => {
                          setSelectedBlueprint(bp);
                          setShowScanModal(true);
                        }}
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 hover:bg-emerald-500/20 transition cursor-pointer"
                      >
                        <ShieldCheck className="w-3 h-3" /> Lolos Audit
                      </button>
                    ) : isFailed ? (
                      <button
                        onClick={() => {
                          setSelectedBlueprint(bp);
                          setShowScanModal(true);
                        }}
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1 hover:bg-red-500/20 transition cursor-pointer"
                      >
                        <ShieldAlert className="w-3 h-3" /> Pelanggaran Terdeteksi
                      </button>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Menunggu Audit
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {isSuperAdmin && (
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedBlueprint(bp);
                        setTargetStage(
                          bp.rollout_stage === 'INTERNAL'
                            ? 'BETA_TENANT'
                            : bp.rollout_stage === 'BETA_TENANT'
                            ? 'GENERAL_AVAILABILITY'
                            : 'INTERNAL'
                        );
                        setShowRolloutModal(true);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
                      Kelola Tahap Rollout
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Policy Scan Report Details */}
      {showScanModal && selectedBlueprint && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Laporan Audit Kebijakan Keamanan</h3>
              </div>
              <button
                onClick={() => setShowScanModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400">Blueprint:</span>
                <span className="ml-2 font-bold text-white">{selectedBlueprint.name}</span>
                <span className="ml-2 text-slate-500 font-mono">({selectedBlueprint.package_id})</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                <span>Skor Keamanan:</span>
                <span className="font-bold text-emerald-400 text-sm">
                  {selectedBlueprint.policy_scan_report?.safety_score
                    ? `${(selectedBlueprint.policy_scan_report.safety_score * 100).toFixed(0)}%`
                    : '100%'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1.5">Hasil Pemeriksaan Aturan:</span>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedBlueprint.policy_scan_report?.violations_found &&
                  selectedBlueprint.policy_scan_report.violations_found.length > 0 ? (
                    selectedBlueprint.policy_scan_report.violations_found.map((v, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span>{v.rule_id}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20">{v.severity}</span>
                        </div>
                        <p className="text-[11px] text-red-200">{v.message}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Seluruh aturan kepatuhan keamanan (injeksi prompt, kebocoran kunci, eksekusi kode) lolos verifikasi bersih.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowScanModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rollout Stage Transition */}
      {showRolloutModal && selectedBlueprint && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Transisi Tahap Rollout</h3>
              </div>
              <button
                onClick={() => setShowRolloutModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedBlueprint.policy_scan_status !== 'PASSED' && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Kebijakan Pemindaian Wajib</strong>
                  Blueprint ini belum lolos pemindai kebijakan ({selectedBlueprint.policy_scan_status}).
                  Staged rollout ke BETA_TENANT atau GENERAL_AVAILABILITY diblokir sampai pelanggaran diperbaiki.
                </div>
              </div>
            )}

            <form onSubmit={handleRolloutTransition} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Target Tahap Rollout</label>
                <select
                  value={targetStage}
                  onChange={(e) => setTargetStage(e.target.value as RolloutStage)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="INTERNAL">INTERNAL (Hanya Super Admin/Internal)</option>
                  <option value="BETA_TENANT">BETA_TENANT (Tenant Terdaftar)</option>
                  <option value="GENERAL_AVAILABILITY">GENERAL_AVAILABILITY (Seluruh Tenant)</option>
                </select>
              </div>

              {targetStage === 'BETA_TENANT' && (
                <div>
                  <label className="block text-slate-400 mb-1">
                    Daftar UUID Tenant Diizinkan (pisahkan dengan koma)
                  </label>
                  <input
                    type="text"
                    value={betaTenantIdsInput}
                    onChange={(e) => setBetaTenantIdsInput(e.target.value)}
                    placeholder="e.g. 00000000-0000-0000-0000-000000000001"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-[11px] focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRolloutModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={transitionLoading}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {transitionLoading ? 'Menyimpan...' : 'Perbarui Tahap Rollout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ingest New Blueprint Package */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Ingest Blueprint Skill Agen Baru</h3>
              </div>
              <button
                onClick={() => setShowIngestModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleIngestPackage} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">ID Paket (kebab-case)</label>
                  <input
                    type="text"
                    value={newPackageId}
                    onChange={(e) => setNewPackageId(e.target.value)}
                    placeholder="sales-lead-qualifier-v1"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-[11px] focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Nama Blueprint</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="AI Sales Qualification Specialist"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Kategori</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="sales">Sales & Komersial</option>
                    <option value="operations">Operasional & Layanan</option>
                    <option value="finance">Keuangan & Akuntansi</option>
                    <option value="intelligence">Intelijen & Analisis</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Versi SemVer</label>
                  <input
                    type="text"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-[11px] focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Deskripsi Peran & Tanggung Jawab</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Bertanggung jawab memvalidasi kualifikasi calon pelanggan masuk..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Template Prompt Sistem</label>
                <textarea
                  rows={4}
                  value={newSystemPrompt}
                  onChange={(e) => setNewSystemPrompt(e.target.value)}
                  placeholder="Anda adalah asisten kualifikasi penjualan profesional untuk {{company_name}}..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-[11px] focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={ingestLoading}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {ingestLoading ? 'Menjalankan Audit...' : 'Ingest & Scan Paket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
