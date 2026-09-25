'use client';

import React, { useState, useMemo } from 'react';
import {
  Award,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ShieldCheck,
  FileSpreadsheet,
  FileText,
  Printer,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';
import { SelectionInsightPanel } from './SelectionInsightPanel';

export interface SelectionScoringResultItem {
  id: string;
  entity_label: string;
  total_score: number;
  score_breakdown: Record<string, number>;
  rank_position?: number | null;
  previous_rank_position?: number | null;
  priority_level?: string | null;
  recommendation_classification?: string | null;
  risk_score?: number | null;
  confidence_score?: number | null;
  quality_score?: number | null;
  decision_status: string;
  reviewer_notes?: string | null;
  source_document_id?: string | null;
}

export interface SelectionResultJobInfo {
  id: string;
  title: string;
  domain_category?: string | null;
  instruction_prompt?: string | null;
  pipeline_stage?: string | null;
  stage_progress_pct?: number | null;
  total_documents?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
  criteria?: Array<{ key: string; label: string; weight: number }>;
}

interface SelectionResultScreenProps {
  tenantId: string;
  jobInfo: SelectionResultJobInfo | null;
  results: SelectionScoringResultItem[];
  insights?: any[];
  isLoading?: boolean;
  onOpenReview?: (resultId?: string) => void;
  onOpenRerun?: () => void;
  onOpenCompare?: () => void;
}

type SortField = 'rank_position' | 'total_score' | 'risk_score' | 'quality_score' | 'confidence_score' | 'entity_label';
type SortOrder = 'asc' | 'desc';

export function SelectionResultScreen({
  tenantId,
  jobInfo,
  results = [],
  insights = [],
  isLoading = false,
  onOpenReview,
  onOpenRerun,
  onOpenCompare,
}: SelectionResultScreenProps) {
  const [sortField, setSortField] = useState<SortField>('rank_position');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [exportReportType, setExportReportType] = useState<'detailed_selection' | 'executive_summary' | 'ranking_analytics'>('detailed_selection');
  const [selectedEntityForInsight, setSelectedEntityForInsight] = useState<string | null>(null);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const total = results.length;
    let selected = 0;
    let rejected = 0;
    let review = 0;

    results.forEach((r) => {
      const decision = (r.decision_status || '').toLowerCase();
      const rec = (r.recommendation_classification || '').toLowerCase();

      if (decision === 'approved' || (decision === 'pending' && rec === 'select')) {
        selected++;
      } else if (decision === 'rejected' || (decision === 'pending' && rec === 'reject')) {
        rejected++;
      } else {
        review++;
      }
    });

    return { total, selected, rejected, review };
  }, [results]);

  // Protected domain categories requiring Human Review guardrail
  const isProtectedDomain = useMemo(() => {
    const cat = (jobInfo?.domain_category || '').toLowerCase();
    return ['recruitment', 'finance', 'procurement', 'supplier'].includes(cat);
  }, [jobInfo?.domain_category]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'rank_position' ? 'asc' : 'desc');
    }
  };

  const filteredAndSortedResults = useMemo(() => {
    let list = [...results];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.entity_label.toLowerCase().includes(q));
    }

    // Status filter
    if (filterStatus !== 'all') {
      list = list.filter((r) => {
        const d = (r.decision_status || '').toLowerCase();
        const rec = (r.recommendation_classification || '').toLowerCase();
        if (filterStatus === 'selected') return d === 'approved' || rec === 'select';
        if (filterStatus === 'rejected') return d === 'rejected' || rec === 'reject';
        if (filterStatus === 'review') return d === 'pending' || rec === 'review';
        return true;
      });
    }

    // Sort
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (valA === undefined || valA === null) valA = sortOrder === 'asc' ? 999999 : -999999;
      if (valB === undefined || valB === null) valB = sortOrder === 'asc' ? 999999 : -999999;

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }, [results, searchQuery, filterStatus, sortField, sortOrder]);

  const executeExport = async () => {
    if (!jobInfo?.id) return;
    try {
      setExportLoading(exportFormat);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/${jobInfo.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: exportFormat,
          report_type: exportReportType,
        }),
      });

      if (!res.ok) {
        throw new Error('Gagal mengekspor laporan');
      }

      const json = await res.json();
      const downloadUrl = json.data?.download_url;
      if (downloadUrl) {
        window.open(downloadUrl, '_blank');
      }
      setShowExportModal(false);
    } catch (err: any) {
      alert(`Gagal mengekspor berkas: ${err.message}`);
    } finally {
      setExportLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <SkeletonLoader count={4} />
      </div>
    );
  }

  if (!jobInfo) {
    return (
      <div className="p-8">
        <EmptyState
          id="no-selection-job-selected"
          icon={Award}
          title="Belum Ada Pekerjaan Seleksi yang Dipilih"
          description="Pilih salah satu pekerjaan seleksi dari daftar riwayat atau buat evaluasi baru."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Context Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              {jobInfo.domain_category || 'General'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ID: {jobInfo.id.slice(0, 8)}...
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {jobInfo.title}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1 max-w-2xl">
            {jobInfo.instruction_prompt || 'Instruksi evaluasi kualifikasi multi-kriteria kognitif.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenReview && (
            <button
              onClick={() => onOpenReview()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Tinjauan & Persetujuan</span>
            </button>
          )}

          {onOpenRerun && (
            <button
              onClick={onOpenRerun}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-300 dark:border-slate-700"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Jalankan Ulang</span>
            </button>
          )}

          {onOpenCompare && (
            <button
              onClick={onOpenCompare}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-300 dark:border-slate-700"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Bandingkan</span>
            </button>
          )}

          <button
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor Laporan</span>
          </button>
        </div>
      </div>

      {/* Human Review Guardrail Banner */}
      {isProtectedDomain && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="text-xs space-y-1">
            <span className="font-semibold text-sm">
              Protokol Perlindungan Otonom: Wajib Tinjauan Manusia Aktif
            </span>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              Domain kategori ini ({jobInfo.domain_category}) membutuhkan validasi peninjau manusia berwenang sebelum status evaluasi dapat disahkan secara final.
            </p>
          </div>
        </div>
      )}

      {/* 4 Summary Cards (Total Data, Selected, Rejected, Review) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Data */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Total Data Entitas</span>
            <Award className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {summaryCounts.total}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Kandidat / berkas dievaluasi
          </span>
        </div>

        {/* Selected */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/40 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-medium mb-1">
            <span>Terpilih (Selected)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {summaryCounts.selected}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Lolos kualifikasi & prioritas
          </span>
        </div>

        {/* Review */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-medium mb-1">
            <span>Perlu Tinjauan (Review)</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            {summaryCounts.review}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Menunggu validasi keputusan
          </span>
        </div>

        {/* Rejected */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/40 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs font-medium mb-1">
            <span>Ditolak (Rejected)</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">
            {summaryCounts.rejected}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Di bawah ambang batas skor
          </span>
        </div>
      </div>

      {/* Main Ranking Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Table Filters & Search */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              Tabel Peringkat Hasil Seleksi
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
              {filteredAndSortedResults.length} Baris
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Cari entitas..." // allowlist: standard UI input hint
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Semua Status</option>
              <option value="selected">Terpilih (Selected)</option>
              <option value="review">Perlu Tinjauan (Review)</option>
              <option value="rejected">Ditolak (Rejected)</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {filteredAndSortedResults.length === 0 ? (
          <div className="p-8">
            <EmptyState
              id="empty-ranking-table"
              icon={Award}
              title="Tidak Ada Data Peringkat Sesuai Filter"
              description="Coba ubah kata kunci pencarian atau sesuaikan filter status di atas."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-100/70 dark:bg-slate-800/60 uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th
                    onClick={() => handleSort('rank_position')}
                    className="p-3.5 cursor-pointer hover:text-blue-500 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Peringkat</span>
                      {sortField === 'rank_position' && (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('entity_label')}
                    className="p-3.5 cursor-pointer hover:text-blue-500 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nama Entitas / Dokumen</span>
                      {sortField === 'entity_label' && (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('total_score')}
                    className="p-3.5 cursor-pointer hover:text-blue-500 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Skor Akhir</span>
                      {sortField === 'total_score' && (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('risk_score')}
                    className="p-3.5 cursor-pointer hover:text-blue-500 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Risiko (Risk)</span>
                      {sortField === 'risk_score' && (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('quality_score')}
                    className="p-3.5 cursor-pointer hover:text-blue-500 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Kualitas Data</span>
                      {sortField === 'quality_score' && (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('confidence_score')}
                    className="p-3.5 cursor-pointer hover:text-blue-500 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Keyakinan AI</span>
                      {sortField === 'confidence_score' && (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />
                      )}
                    </div>
                  </th>
                  <th className="p-3.5 whitespace-nowrap">Rekomendasi & Keputusan</th>
                  <th className="p-3.5 text-right whitespace-nowrap">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredAndSortedResults.map((r) => {
                  const isTopRank = (r.rank_position || 99) <= 3;
                  const isReviewNeeded = (r.decision_status || '').toLowerCase() === 'pending';
                  const isOverridden = (r.decision_status || '').toLowerCase() === 'overridden';

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Peringkat */}
                      <td className="p-3.5 font-bold">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                              isTopRank
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 font-extrabold border border-amber-300 dark:border-amber-800'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            #{r.rank_position || '-'}
                          </span>
                          {r.previous_rank_position && r.previous_rank_position !== r.rank_position && (
                            <span className="text-[10px] text-slate-400 line-through">
                              #{r.previous_rank_position}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Entitas */}
                      <td className="p-3.5 font-semibold text-slate-900 dark:text-white">
                        <div>
                          <span>{r.entity_label}</span>
                          {r.reviewer_notes && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 italic font-normal mt-0.5 line-clamp-1">
                              "{r.reviewer_notes}"
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Skor Akhir */}
                      <td className="p-3.5 font-bold">
                        <span className="text-emerald-700 dark:text-emerald-400 font-mono text-sm">
                          {r.total_score.toFixed(2)}
                        </span>
                      </td>

                      {/* Risiko (Risk) */}
                      <td className="p-3.5 font-mono">
                        {r.risk_score !== null && r.risk_score !== undefined ? (
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                              r.risk_score > 50
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : r.risk_score > 25
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {r.risk_score.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Kualitas Data (Quality Score) */}
                      <td className="p-3.5 font-mono">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold">
                          {(r.quality_score ?? 100.0).toFixed(0)}%
                        </span>
                      </td>

                      {/* Keyakinan AI (Confidence Score) */}
                      <td className="p-3.5 font-mono">
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">
                          {(r.confidence_score ?? 95.0).toFixed(1)}%
                        </span>
                      </td>

                      {/* Rekomendasi & Keputusan */}
                      <td className="p-3.5">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-block w-fit text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              r.decision_status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                : r.decision_status === 'rejected'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                                : isOverridden
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                            }`}
                          >
                            {r.decision_status}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                            AI: {r.recommendation_classification || 'SELECT'}
                          </span>
                        </div>
                      </td>

                      {/* Tindakan */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {onOpenReview && (
                            <button
                              onClick={() => onOpenReview(r.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
                            >
                              Tinjau
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedEntityForInsight(r.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 transition-colors"
                          >
                            Insight
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

      {/* Panel AI Insights (Prompt B / selection_insights) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Panel Insight & Justifikasi Cerdas AI
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Analisis matematis deterministik, identifikasi keunggulan, anomali, dan mitigasi risiko.
            </p>
          </div>
        </div>

        <SelectionInsightPanel
          insights={insights}
          selectedEntityId={selectedEntityForInsight}
          onSelectEntity={(entityId) => setSelectedEntityForInsight(entityId)}
        />
      </div>

      {/* Export Report Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  Ekspor Laporan Seleksi
                </h4>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Format Berkas
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat('pdf')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                      exportFormat === 'pdf'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <FileText className="w-5 h-5 mb-1" />
                    <span>PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('excel')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                      exportFormat === 'excel'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <FileSpreadsheet className="w-5 h-5 mb-1" />
                    <span>Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('csv')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                      exportFormat === 'csv'
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Printer className="w-5 h-5 mb-1" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Tipe Laporan
                </label>
                <select
                  value={exportReportType}
                  onChange={(e: any) => setExportReportType(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="detailed_selection">Laporan Rinci & Matriks Kriteria (Detailed)</option>
                  <option value="executive_summary">Ringkasan Eksekutif (Executive Summary)</option>
                  <option value="ranking_analytics">Analitik & Distribusi Peringkat (Analytics)</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-600 dark:text-slate-400">
                Laporan akan digenerate secara deterministik dari dataset nyata dan tercatat ke Audit Ledger organisasi.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={Boolean(exportLoading)}
                onClick={executeExport}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                {exportLoading ? (
                  <span>Menghasilkan Berkas...</span>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
