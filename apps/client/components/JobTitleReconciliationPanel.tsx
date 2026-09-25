import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Bot,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Layers,
  Award,
  SlidersHorizontal,
  ChevronRight,
  BookOpen,
  ArrowRight
} from 'lucide-react';

interface StructuralRole {
  id: string;
  role_code: string;
  name: string;
  description: string | null;
  hierarchy_rank: number;
}

interface JobLevel {
  id: string;
  level_code: string;
  name: string;
  description: string | null;
  level_rank: number;
  min_complexity_multiplier: number;
}

interface JobSubtitle {
  id: string;
  subtitle_code: string;
  subtitle_name: string;
  description: string | null;
  focus_areas: string[];
}

export interface StandardizedJobTitle {
  id: string;
  title_code: string;
  title_name: string;
  category_tag: string;
  badge_stars: string;
  primary_duties: string;
  recommended_tools: string[];
  primary_deliverable: string;
  is_reference: boolean;
  structural_role: StructuralRole;
  job_level: JobLevel;
  subtitles: JobSubtitle[];
}

export interface ReconciliationMappingItem {
  agent_id: string;
  agent_display_name: string;
  department_name?: string;
  persona_type: string;
  tenant_id: string;
  resolution_status: 'AUTO_MAPPED' | 'ACTION_REQUIRED';
  target_job_title_id: string | null;
  target_job_title_code: string | null;
  target_title_name: string | null;
  structural_role_name: string | null;
  level_code: string | null;
  confidence: string;
  requires_manual_review: boolean;
  notes: string;
}

export interface JobTitleMigrationReport {
  id?: string;
  report_batch_id: string;
  tenant_id: string | null;
  total_agents_audited: number;
  auto_mapped_count: number;
  ambiguous_count: number;
  reconciliation_status: string;
  mappings: ReconciliationMappingItem[];
  summary_notes: string;
  generated_at: string;
}

interface JobTitleReconciliationPanelProps {
  tenantId: string;
  userRole?: string;
  onRefreshParent?: () => void;
}

export const JobTitleReconciliationPanel: React.FC<JobTitleReconciliationPanelProps> = ({
  tenantId,
  userRole = 'TENANT_OWNER',
  onRefreshParent,
}) => {
  const [jobTitles, setJobTitles] = useState<StandardizedJobTitle[]>([]);
  const [report, setReport] = useState<JobTitleMigrationReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedTitleDetail, setSelectedTitleDetail] = useState<StandardizedJobTitle | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-User-Role': userRole,
    };
  }, [tenantId, userRole]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [titlesRes, reportRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/job-titles`, { credentials: 'omit' }),
        fetch(`/api/v1/tenants/${tenantId}/job-titles/reconciliation-report`, { credentials: 'omit' }),
      ]);

      if (titlesRes.ok) {
        const titlesData = await titlesRes.json();
        setJobTitles(titlesData);
      }

      if (reportRes.ok) {
        const reportData = await reportRes.json();
        setReport(reportData);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal memuat data katalog dan laporan rekonsiliasi.' });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTriggerReconcile = async () => {
    setReconciling(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/job-titles/reconcile`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || 'Gagal menjalankan rekonsiliasi.');
      }
      const updatedReport = await res.json();
      setReport(updatedReport);
      setMessage({
        type: 'success',
        text: 'Audit rekonsiliasi jabatan selesai! Database dan status pemetaan telah diperbarui secara real-time.',
      });
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Terjadi galat saat memproses audit rekonsiliasi.' });
    } finally {
      setReconciling(false);
    }
  };

  const handleAssignJobTitle = async (agentId: string) => {
    const chosenTitleId = selectedAssignment[agentId];
    if (!chosenTitleId) {
      setMessage({ type: 'error', text: 'Pilih salah satu jabatan resmi terlebih dahulu.' });
      return;
    }

    setAssigningId(agentId);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/agents/${agentId}/job-title`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ job_title_id: chosenTitleId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || 'Gagal menetapkan jabatan.');
      }

      const resData = await res.json();
      setMessage({
        type: 'success',
        text: `Jabatan resmi '${resData.data?.assigned_title?.title_name}' berhasil ditetapkan untuk ${resData.data?.agent?.display_name}.`,
      });

      // Refresh laporan
      await handleTriggerReconcile();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal menyimpan penugasan jabatan.' });
    } finally {
      setAssigningId(null);
    }
  };

  const categories = [
    { key: 'ALL', label: 'Semua Kategori' },
    { key: 'EXECUTIVE', label: 'Eksekutif' },
    { key: 'OPERATIONS', label: 'Operasional' },
    { key: 'FINANCE', label: 'Keuangan' },
    { key: 'SALES', label: 'Penjualan & CRM' },
    { key: 'HR', label: 'SDM' },
    { key: 'CUSTOMER_SERVICE', label: 'Layanan' },
    { key: 'ANALYTICS', label: 'Analitik & Riset' },
    { key: 'KNOWLEDGE', label: 'Pengetahuan' },
  ];

  const filteredTitles = jobTitles.filter((title) => {
    const matchesCat = categoryFilter === 'ALL' || title.category_tag.toUpperCase() === categoryFilter.toUpperCase();
    const matchesSearch =
      title.title_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      title.title_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      title.primary_duties.toLowerCase().includes(searchQuery.toLowerCase()) ||
      title.structural_role.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Status Alert Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <p className="text-xs font-semibold">{message.text}</p>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-xs font-medium opacity-70 hover:opacity-100 px-2 py-0.5"
          >
            Tutup
          </button>
        </div>
      )}

      {/* KPI & Summary Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Katalog Jabatan Resmi</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {jobTitles.length || 15}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 block">
            Ontologi Resmi Platform
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total AI Agent Terdaftar</span>
            <Bot className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {report?.total_agents_audited ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Tercatat di Supabase Postgres</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Terpetakan Otomatis</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {report?.auto_mapped_count ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Sinkronisasi via Shadow Mapping</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Butuh Keputusan Manual</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {report?.ambiguous_count ?? 0}
          </div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1 block">
            {(report?.ambiguous_count ?? 0) > 0 ? 'Tindakan Administrator Diperlukan' : 'Seluruh Agen Terpetakan'}
          </span>
        </div>
      </div>

      {/* Audit Reconciliation Section */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Laporan Audit Rekonsiliasi & Shadow Mapping
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  report?.reconciliation_status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                {report?.reconciliation_status === 'COMPLETED' ? 'LENGKAP' : 'PERLU TINDAKAN'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Batch: <span className="font-mono text-slate-700 dark:text-slate-300">{report?.report_batch_id || 'STANDBY'}</span> • Diperbarui:{' '}
              {report?.generated_at ? new Date(report.generated_at).toLocaleString('id-ID') : 'Belum diverifikasi'}
            </p>
          </div>

          <button
            onClick={handleTriggerReconcile}
            disabled={reconciling}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin' : ''}`} />
            <span>{reconciling ? 'Memproses Audit...' : 'Jalankan Ulang Audit'}</span>
          </button>
        </div>

        {/* Informative description */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">
            Mekanisme Transisi Aman (Shadow Mapping):
          </p>
          <p>
            Kolom <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">job_title_id</span> pada tabel{' '}
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">ai_agents</span> menyimpan referensi jabatan resmi tanpa menghapus identitas legacy{' '}
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">persona_type</span>. Agen dengan status ambigu dapat ditetapkan langsung ke salah satu dari 15 jabatan resmi di bawah.
          </p>
        </div>

        {/* Audit Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-3">Nama Agen & Departemen</th>
                <th className="py-3 px-3">Persona Asli</th>
                <th className="py-3 px-3">Status Shadow Mapping</th>
                <th className="py-3 px-3">Jabatan Resmi Terstandarisasi</th>
                <th className="py-3 px-3">Kepastian</th>
                <th className="py-3 px-3 text-right">Aksi Penetapan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {report?.mappings && report.mappings.length > 0 ? (
                report.mappings.map((item) => {
                  const isAmbiguous = item.resolution_status === 'ACTION_REQUIRED';
                  return (
                    <tr key={item.agent_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                          <span>{item.agent_display_name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {item.department_name || 'Umum'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {item.persona_type || 'unspecified'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {isAmbiguous ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300/50">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Tindakan Diperlukan</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300/50">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Terpetakan Otomatis</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {item.target_title_name ? (
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {item.target_title_name}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {item.structural_role_name} • {item.level_code}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Belum terhubung ke ontologi resmi</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`font-semibold text-[11px] ${
                            item.confidence === 'HIGH'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : item.confidence === 'MEDIUM'
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {item.confidence}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        {isAmbiguous ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <select
                              value={selectedAssignment[item.agent_id] || ''}
                              onChange={(e) =>
                                setSelectedAssignment((prev) => ({
                                  ...prev,
                                  [item.agent_id]: e.target.value,
                                }))
                              }
                              className="px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white max-w-[190px]"
                            >
                              <option value="">Pilih Jabatan Resmi...</option>
                              {jobTitles.map((jt) => (
                                <option key={jt.id} value={jt.id}>
                                  {jt.title_name} ({jt.job_level.level_code})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAssignJobTitle(item.agent_id)}
                              disabled={assigningId === item.agent_id || !selectedAssignment[item.agent_id]}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-all shrink-0"
                            >
                              {assigningId === item.agent_id ? 'Menyimpan...' : 'Tetapkan'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Tervalidasi
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    {loading ? 'Memuat audit pemetaan jabatan...' : 'Belum ada data agen terdaftar pada organisasi ini.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 15 Standardized AI Job Titles Reference Catalog */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                15 Katalog Jabatan Staf AI Terstandarisasi Platform
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                DATA REFERENSI RESMI
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Spesifikasi peran struktural, level otonomi, rubrik tugas utama, dan deliverable terverifikasi.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Cari jabatan atau tugas"
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategoryFilter(c.key)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                categoryFilter === c.key
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Grid of 15 Titles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTitles.map((jt) => (
            <div
              key={jt.id}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300">
                      {jt.job_level.level_code}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {jt.category_tag}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    <span>{jt.badge_stars}</span>
                  </span>
                </div>

                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  {jt.title_name}
                </h4>
                <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  <span>{jt.structural_role.name}</span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 line-clamp-3">
                  {jt.primary_duties}
                </p>

                {/* Subtitles preview */}
                {jt.subtitles && jt.subtitles.length > 0 && (
                  <div className="mb-4">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Sub-Spesialisasi ({jt.subtitles.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {jt.subtitles.map((sub) => (
                        <span
                          key={sub.id}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          {sub.subtitle_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div className="text-[10px] text-slate-400">
                  Deliverable: <span className="font-semibold text-slate-700 dark:text-slate-300">{jt.primary_deliverable}</span>
                </div>
                <button
                  onClick={() => setSelectedTitleDetail(jt)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Lihat Rincian Jabatan"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Detail Spesifikasi Jabatan */}
      {selectedTitleDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                  {selectedTitleDetail.job_level.level_code} • {selectedTitleDetail.category_tag}
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {selectedTitleDetail.title_name}
                </h3>
                <span className="text-xs font-mono text-slate-400">{selectedTitleDetail.title_code}</span>
              </div>
              <button
                onClick={() => setSelectedTitleDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-500 uppercase text-[10px] block">Peran Struktural:</span>
                <p className="text-slate-900 dark:text-white font-medium mt-0.5">
                  {selectedTitleDetail.structural_role.name} (Tingkat Hirarki: {selectedTitleDetail.structural_role.hierarchy_rank})
                </p>
                <p className="text-slate-500 text-[11px] mt-0.5">{selectedTitleDetail.structural_role.description}</p>
              </div>

              <div>
                <span className="font-semibold text-slate-500 uppercase text-[10px] block">Level Otonomi:</span>
                <p className="text-slate-900 dark:text-white font-medium mt-0.5">
                  {selectedTitleDetail.job_level.name} (Multiplier Kompleksitas: {selectedTitleDetail.job_level.min_complexity_multiplier}x)
                </p>
                <p className="text-slate-500 text-[11px] mt-0.5">{selectedTitleDetail.job_level.description}</p>
              </div>

              <div>
                <span className="font-semibold text-slate-500 uppercase text-[10px] block">Tugas Utama:</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                  {selectedTitleDetail.primary_duties}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-500 uppercase text-[10px] block">Deliverable Utama:</span>
                <p className="text-emerald-700 dark:text-emerald-300 font-semibold mt-0.5">
                  {selectedTitleDetail.primary_deliverable}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-500 uppercase text-[10px] block">Perangkat yang Direkomendasikan:</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {selectedTitleDetail.recommended_tools.map((tool, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              {selectedTitleDetail.subtitles && selectedTitleDetail.subtitles.length > 0 && (
                <div>
                  <span className="font-semibold text-slate-500 uppercase text-[10px] block">Sub-Spesialisasi:</span>
                  <div className="space-y-1.5 mt-1">
                    {selectedTitleDetail.subtitles.map((sub) => (
                      <div key={sub.id} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{sub.subtitle_name}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{sub.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-right">
              <button
                onClick={() => setSelectedTitleDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-all"
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
