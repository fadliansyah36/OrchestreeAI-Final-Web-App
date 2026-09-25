'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Eye,
  Sliders,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Clock,
  Award,
  ArrowRight,
  SlidersHorizontal,
  Bot,
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

interface JobSummary {
  id: string;
  tenant_id: string;
  title: string;
  domain_category?: string;
  pipeline_stage?: string;
  stage_progress_pct?: number;
  total_documents?: number;
  created_at: string;
  completed_at?: string;
}

interface SelectionHistoryScreenProps {
  tenantId: string;
  onReopenJob: (jobId: string) => void;
  onInitiateRerun?: (jobId: string) => void;
}

export function SelectionHistoryScreen({
  tenantId,
  onReopenJob,
  onInitiateRerun,
}: SelectionHistoryScreenProps) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Compare mode state
  const [compareJob1Id, setCompareJob1Id] = useState<string | null>(null);
  const [compareJob2Id, setCompareJob2Id] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [compareLoading, setCompareLoading] = useState<boolean>(false);
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false);

  // Rerun modal state
  const [rerunTargetJob, setRerunTargetJob] = useState<JobSummary | null>(null);
  const [rerunTitle, setRerunTitle] = useState<string>('');
  const [rerunPrompt, setRerunPrompt] = useState<string>('');
  const [rerunCriteria, setRerunCriteria] = useState<Array<{ key: string; label: string; weight: number }>>([]);
  const [rerunAgentId, setRerunAgentId] = useState<string>('');
  const [eligibleAgents, setEligibleAgents] = useState<any[]>([]);
  const [rerunSubmitting, setRerunSubmitting] = useState<boolean>(false);

  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs`);
      if (res.ok) {
        const json = await res.json();
        setJobs(json.data || []);
      }
    } catch (err) {
      console.error('Gagal mengambil riwayat seleksi:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/eligible-agents`);
      if (res.ok) {
        const json = await res.json();
        setEligibleAgents(json.data || []);
      }
    } catch (err) {
      console.error('Gagal mengambil daftar agent:', err);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchAgents();
  }, [tenantId]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = j.title.toLowerCase().includes(q);
        const matchesCategory = (j.domain_category || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesCategory) return false;
      }

      // Category filter
      if (categoryFilter !== 'all') {
        if ((j.domain_category || '').toLowerCase() !== categoryFilter.toLowerCase()) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const stage = (j.pipeline_stage || '').toLowerCase();
        if (statusFilter === 'completed' && stage !== 'completed') return false;
        if (statusFilter === 'processing' && stage === 'completed') return false;
      }

      return true;
    });
  }, [jobs, searchQuery, categoryFilter, statusFilter]);

  const executeCompare = async (job1: string, job2: string) => {
    try {
      setCompareLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${job1}/compare/${job2}`);
      if (res.ok) {
        const json = await res.json();
        setComparisonData(json.data);
        setShowCompareModal(true);
      } else {
        alert('Gagal memuat perbandingan antara dua evaluasi.');
      }
    } catch (err) {
      console.error('Error comparing jobs:', err);
      alert('Terjadi kesalahan saat membandingkan evaluasi.');
    } finally {
      setCompareLoading(false);
    }
  };

  const handleOpenRerunModal = async (job: JobSummary) => {
    setRerunTargetJob(job);
    setRerunTitle(`${job.title} (Rerun Evaluasi)`);
    setRerunSubmitting(false);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${job.id}`);
      if (res.ok) {
        const json = await res.json();
        const detail = json.data;
        setRerunPrompt(detail.instruction_prompt || '');
        setRerunCriteria(detail.criteria || []);
        setRerunAgentId(detail.initiated_by_agent_id || '');
      }
    } catch (err) {
      console.error('Gagal mengambil kriteria job:', err);
    }
  };

  const handleWeightChange = (key: string, newWeight: number) => {
    setRerunCriteria((prev) =>
      prev.map((c) => (c.key === key ? { ...c, weight: Math.max(0, Math.min(1, newWeight)) } : c))
    );
  };

  const submitRerun = async () => {
    if (!rerunTargetJob) return;
    try {
      setRerunSubmitting(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${rerunTargetJob.id}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: rerunTitle,
          instruction_prompt: rerunPrompt,
          criteria: rerunCriteria,
          initiated_by_agent_id: rerunAgentId || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Gagal membuat rerun seleksi');
      }

      const json = await res.json();
      const newJobId = json.data?.new_job_id;
      setRerunTargetJob(null);
      await fetchJobs();
      if (newJobId) {
        onReopenJob(newJobId);
      }
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setRerunSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1 text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <History className="w-4 h-4 text-blue-500" />
            <span>Pusat Riwayat & Audit Seleksi</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Riwayat Pekerjaan Seleksi
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Telusuri rekam jejak evaluasi masa lalu, lakukan eksekusi ulang (re-run) dengan kriteria kalibrasi baru, atau bandingkan dua hasil secara langsung.
          </p>
        </div>

        <button
          onClick={fetchJobs}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Filter and search bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari judul pekerjaan atau domain..." // allowlist: standard UI input hint
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">Semua Domain</option>
            <option value="recruitment">Rekrutmen & Talenta</option>
            <option value="supplier">Pengadaan & Vendor</option>
            <option value="finance">Keuangan & Investasi</option>
            <option value="sales">Kualifikasi Prospek</option>
            <option value="general">Umum & Operasional</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">Semua Status</option>
            <option value="completed">Selesai (Completed)</option>
            <option value="processing">Sedang Berjalan</option>
          </select>
        </div>
      </div>

      {/* Compare Selector Bar if 2 items selected */}
      {(compareJob1Id || compareJob2Id) && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
            <ArrowUpDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold">Mode Komparasi Dua Pekerjaan:</span>
            <span>
              {compareJob1Id ? 'Pekerjaan 1 Dipilih' : 'Pilih Pekerjaan 1'} |{' '}
              {compareJob2Id ? 'Pekerjaan 2 Dipilih' : 'Pilih Pekerjaan 2'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCompareJob1Id(null);
                setCompareJob2Id(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
            >
              Reset Pilihan
            </button>
            <button
              disabled={!compareJob1Id || !compareJob2Id || compareLoading}
              onClick={() => compareJob1Id && compareJob2Id && executeCompare(compareJob1Id, compareJob2Id)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 transition-colors shadow-xs"
            >
              {compareLoading ? 'Memproses Diff...' : 'Tampilkan Komparasi'}
            </button>
          </div>
        </div>
      )}

      {/* Jobs List */}
      {isLoading ? (
        <SkeletonLoader count={4} />
      ) : filteredJobs.length === 0 ? (
        <div className="p-8">
          <EmptyState
            id="empty-history-jobs"
            icon={History}
            title="Tidak Ada Riwayat Evaluasi yang Sesuai"
            description="Mulai pekerjaan seleksi cerdas pertama Anda atau ubah filter pencarian."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredJobs.map((j) => {
            const isCompleted = (j.pipeline_stage || '').toLowerCase() === 'completed';
            const isSelected1 = compareJob1Id === j.id;
            const isSelected2 = compareJob2Id === j.id;

            return (
              <div
                key={j.id}
                className={`p-4 md:p-5 rounded-2xl border transition-all ${
                  isSelected1 || isSelected2
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {j.domain_category || 'General'}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {j.pipeline_stage || 'Draft'} ({j.stage_progress_pct || 0}%)
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      {j.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(j.created_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        <span>{j.total_documents || 0} Berkas Sumber</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Compare Selection Toggle */}
                    <button
                      onClick={() => {
                        if (compareJob1Id === j.id) setCompareJob1Id(null);
                        else if (compareJob2Id === j.id) setCompareJob2Id(null);
                        else if (!compareJob1Id) setCompareJob1Id(j.id);
                        else if (!compareJob2Id) setCompareJob2Id(j.id);
                        else setCompareJob2Id(j.id);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
                        isSelected1 || isSelected2
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {isSelected1 ? 'Slot 1 Terpilih' : isSelected2 ? 'Slot 2 Terpilih' : 'Pilih Komparasi'}
                    </button>

                    {/* Re-run button */}
                    <button
                      onClick={() => handleOpenRerunModal(j)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors flex items-center gap-1"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Re-run</span>
                    </button>

                    {/* Re-open (Read-only view) */}
                    <button
                      onClick={() => onReopenJob(j.id)}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Buka Hasil</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rerun Modal */}
      {rerunTargetJob && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  Jalankan Ulang Evaluasi (Re-run)
                </h4>
              </div>
              <button
                onClick={() => setRerunTargetJob(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Ubah kriteria, bobot, atau instruksi evaluasi. Seluruh berkas asal akan disalin ke pekerjaan baru dan perbedaan kriteria dicatat ke riwayat.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Judul Pekerjaan Baru
                </label>
                <input
                  type="text"
                  value={rerunTitle}
                  onChange={(e) => setRerunTitle(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Instruksi Prompt Evaluasi
                </label>
                <textarea
                  rows={2}
                  value={rerunPrompt}
                  onChange={(e) => setRerunPrompt(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Jabatan Pelaksana AI Agent
                </label>
                <select
                  value={rerunAgentId}
                  onChange={(e) => setRerunAgentId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">Eksekusi Pengguna Manusia</option>
                  {eligibleAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} — {ag.job_title} ({ag.structural_mapping?.department})
                    </option>
                  ))}
                </select>
              </div>

              {/* Criteria Weight Sliders */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Sesuaikan Bobot Kriteria
                </label>
                <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/40">
                  {rerunCriteria.length === 0 ? (
                    <span className="text-xs text-slate-400">Tidak ada kriteria awal yang terdaftar.</span>
                  ) : (
                    rerunCriteria.map((crit) => (
                      <div key={crit.key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {crit.label || crit.key}
                          </span>
                          <span className="font-mono text-purple-600 dark:text-purple-400 font-bold">
                            {(crit.weight * 100).toFixed(0)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={crit.weight}
                          onChange={(e) => handleWeightChange(crit.key, parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRerunTargetJob(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={rerunSubmitting}
                onClick={submitRerun}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                {rerunSubmitting ? 'Membuat Job Rerun...' : 'Jalankan Ulang Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Modal */}
      {showCompareModal && comparisonData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  Perbandingan Dua Evaluasi Seleksi
                </h4>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block">Total Entitas Dibandingkan</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  {comparisonData.summary?.total_compared_entities || 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <span className="text-emerald-700 dark:text-emerald-300 block">Peringkat Naik</span>
                <span className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
                  {comparisonData.summary?.improved_ranks_count || 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                <span className="text-rose-700 dark:text-rose-300 block">Peringkat Turun</span>
                <span className="text-lg font-bold text-rose-800 dark:text-rose-300">
                  {comparisonData.summary?.declined_ranks_count || 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                <span className="text-blue-700 dark:text-blue-300 block">Delta Skor Rata-rata</span>
                <span className="text-lg font-bold text-blue-800 dark:text-blue-300 font-mono">
                  {comparisonData.summary?.average_score_delta > 0 ? '+' : ''}
                  {comparisonData.summary?.average_score_delta || 0}
                </span>
              </div>
            </div>

            {/* Side-by-side Entities Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
                <thead className="bg-slate-100 dark:bg-slate-800 font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Entitas</th>
                    <th className="p-3">Job 1 ({comparisonData.job_1?.title?.slice(0, 15)}...)</th>
                    <th className="p-3">Job 2 ({comparisonData.job_2?.title?.slice(0, 15)}...)</th>
                    <th className="p-3 text-center">Perubahan Peringkat</th>
                    <th className="p-3 text-center">Perubahan Skor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(comparisonData.entities || []).map((ent: any, i: number) => {
                    const deltaRank = ent.rank_delta;
                    const deltaScore = ent.score_delta;

                    return (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">
                          {ent.entity_label}
                        </td>
                        <td className="p-3">
                          <span className="font-bold">#{ent.job_1?.rank ?? '-'}</span>
                          <span className="text-slate-400 ml-2 font-mono">
                            {ent.job_1?.score?.toFixed(2) ?? '-'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-bold">#{ent.job_2?.rank ?? '-'}</span>
                          <span className="text-slate-400 ml-2 font-mono">
                            {ent.job_2?.score?.toFixed(2) ?? '-'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold">
                          {deltaRank !== null && deltaRank !== undefined ? (
                            deltaRank > 0 ? (
                              <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
                                <TrendingUp className="w-3.5 h-3.5 mr-1" />+{deltaRank}
                              </span>
                            ) : deltaRank < 0 ? (
                              <span className="inline-flex items-center text-rose-600 dark:text-rose-400">
                                <TrendingDown className="w-3.5 h-3.5 mr-1" />
                                {deltaRank}
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-slate-400">
                                <Minus className="w-3.5 h-3.5 mr-1" />
                                Tetap
                              </span>
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-3 text-center font-mono font-bold">
                          {deltaScore !== null && deltaScore !== undefined ? (
                            <span
                              className={
                                deltaScore > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : deltaScore < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-400'
                              }
                            >
                              {deltaScore > 0 ? `+${deltaScore.toFixed(2)}` : deltaScore.toFixed(2)}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
