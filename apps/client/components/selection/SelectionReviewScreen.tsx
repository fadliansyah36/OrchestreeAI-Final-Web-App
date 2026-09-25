'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Sliders,
  AlertTriangle,
  Award,
  Filter,
  CheckSquare,
  Sparkles,
  Info,
  Clock,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

export interface CandidateReviewItem {
  id: string; // score_id or result_id
  entity_label: string;
  total_score: number;
  rank_position?: number | null;
  previous_rank_position?: number | null;
  score_breakdown: Record<string, number>;
  decision_status: 'pending' | 'approved' | 'rejected' | 'overridden' | string;
  recommendation_classification?: string;
  risk_score?: number;
  confidence_score?: number;
  quality_score?: number;
  reviewer_notes?: string | null;
  reviewer_id?: string | null;
}

interface SelectionReviewScreenProps {
  tenantId: string;
  jobId: string;
  jobTitle: string;
  domainCategory?: string;
  pipelineStage?: string;
  candidates: CandidateReviewItem[];
  isLoading?: boolean;
  onRefresh: () => void;
  onFinalizeJob?: () => void;
}

const PROTECTED_CATEGORIES = ['recruitment', 'finance', 'procurement', 'supplier'];

export function SelectionReviewScreen({
  tenantId,
  jobId,
  jobTitle,
  domainCategory = 'general',
  pipelineStage = 'in_review',
  candidates = [],
  isLoading = false,
  onRefresh,
  onFinalizeJob,
}: SelectionReviewScreenProps) {
  // Filters & State
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateReviewItem | null>(null);
  const [actionType, setActionType] = useState<'approved' | 'rejected' | 'overridden' | null>(null);
  const [overrideScore, setOverrideScore] = useState<string>('');
  const [reviewerNotes, setReviewerNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Batch actions
  const [showBatchThresholdModal, setShowBatchThresholdModal] = useState<boolean>(false);
  const [thresholdScore, setThresholdScore] = useState<number>(60);
  const [batchNotes, setBatchNotes] = useState<string>('Ditolak massal karena skor di bawah batas minimum seleksi.');
  const [batchLoading, setBatchLoading] = useState<boolean>(false);

  // Guardrail verification
  const isProtectedDomain = useMemo(() => {
    return PROTECTED_CATEGORIES.includes((domainCategory || '').toLowerCase());
  }, [domainCategory]);

  const reviewedCount = useMemo(() => {
    return candidates.filter(
      (c) => ['approved', 'rejected', 'overridden'].includes((c.decision_status || '').toLowerCase())
    ).length;
  }, [candidates]);

  const pendingCount = useMemo(() => {
    return candidates.filter(
      (c) => !['approved', 'rejected', 'overridden'].includes((c.decision_status || '').toLowerCase())
    ).length;
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    if (filterStatus === 'all') return candidates;
    return candidates.filter((c) => (c.decision_status || '').toLowerCase() === filterStatus.toLowerCase());
  }, [candidates, filterStatus]);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message: msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleOpenAction = (candidate: CandidateReviewItem, type: 'approved' | 'rejected' | 'overridden') => {
    setSelectedCandidate(candidate);
    setActionType(type);
    setReviewerNotes(candidate.reviewer_notes || '');
    setOverrideScore(candidate.total_score ? String(candidate.total_score) : '');
  };

  const handleCloseModal = () => {
    setSelectedCandidate(null);
    setActionType(null);
    setReviewerNotes('');
    setOverrideScore('');
  };

  const handleSubmitIndividualReview = async () => {
    if (!selectedCandidate || !actionType) return;

    if ((actionType === 'rejected' || actionType === 'overridden') && !reviewerNotes.trim()) {
      showNotification('Catatan peninjau wajib diisi untuk keputusan Tolak atau Override.', 'error');
      return;
    }

    if (actionType === 'overridden') {
      const parsed = parseFloat(overrideScore);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        showNotification('Skor override harus berupa angka antara 0 hingga 100.', 'error');
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/results/${selectedCandidate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: actionType,
          override_score: actionType === 'overridden' ? parseFloat(overrideScore) : undefined,
          notes: reviewerNotes.trim() || undefined,
          reviewer_id: 'human_manager_review',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal menyimpan tinjauan manusia.');
      }

      showNotification(`Keputusan ${actionType.toUpperCase()} berhasil disimpan untuk ${selectedCandidate.entity_label}`);
      handleCloseModal();
      onRefresh();
    } catch (err: any) {
      showNotification(err.message || 'Terjadi kesalahan sistem saat menyimpan review.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchApproveSelected = async () => {
    const candidatesToApprove = candidates.filter(
      (c) =>
        (c.recommendation_classification === 'selected' || (c.total_score || 0) >= 75) &&
        (c.decision_status || '').toLowerCase() !== 'approved'
    );

    if (candidatesToApprove.length === 0) {
      showNotification('Tidak ada kandidat memenuhi syarat untuk persetujuan massal.', 'error');
      return;
    }

    try {
      setBatchLoading(true);
      let successCount = 0;
      for (const cand of candidatesToApprove) {
        const res = await fetch(`/api/v1/tenants/${tenantId}/selection/results/${cand.id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'approved',
            notes: 'Persetujuan massal rekomendasi terpilih (Batch Approval).',
            reviewer_id: 'human_batch_action',
          }),
        });
        if (res.ok) successCount++;
      }
      showNotification(`Berhasil menyetujui ${successCount} data/kandidat secara massal.`);
      onRefresh();
    } catch (err: any) {
      showNotification(err.message || 'Gagal menjalankan aksi massal.', 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchRejectBelowThreshold = async () => {
    if (!batchNotes.trim()) {
      showNotification('Catatan alasan penolakan wajib disertakan.', 'error');
      return;
    }

    const candidatesToReject = candidates.filter(
      (c) => (c.total_score || 0) < thresholdScore && (c.decision_status || '').toLowerCase() !== 'rejected'
    );

    if (candidatesToReject.length === 0) {
      showNotification(`Tidak ada data dengan skor di bawah ${thresholdScore}.`, 'error');
      setShowBatchThresholdModal(false);
      return;
    }

    try {
      setBatchLoading(true);
      let rejectedCount = 0;
      for (const cand of candidatesToReject) {
        const res = await fetch(`/api/v1/tenants/${tenantId}/selection/results/${cand.id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'rejected',
            notes: batchNotes.trim(),
            reviewer_id: 'human_batch_action',
          }),
        });
        if (res.ok) rejectedCount++;
      }
      showNotification(`Berhasil menolak ${rejectedCount} kandidat di bawah ambang batas ${thresholdScore}.`);
      setShowBatchThresholdModal(false);
      onRefresh();
    } catch (err: any) {
      showNotification(err.message || 'Gagal menjalankan penolakan massal.', 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleFinalizeApproval = async () => {
    if (isProtectedDomain && reviewedCount === 0) {
      showNotification(
        `Guardrail Aktif: Kategori domain '${domainCategory}' mewajibkan minimal 1 tinjauan manusia sebelum selesai.`,
        'error'
      );
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${jobId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_id: 'human_authorized_manager',
          approval_notes: `Pekerjaan seleksi '${jobTitle}' disahkan secara final oleh pengawas manusia.`,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal mengesahkan pekerjaan seleksi.');
      }

      showNotification('Pekerjaan seleksi berhasil disahkan dan diselesaikan secara final.');
      if (onFinalizeJob) onFinalizeJob();
      onRefresh();
    } catch (err: any) {
      showNotification(err.message || 'Gagal mengesahkan pekerjaan seleksi.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm shadow-md animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs underline ml-4">
            Tutup
          </button>
        </div>
      )}

      {/* Header & Guardrail Banner */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
                {domainCategory}
              </span>
              <h1 className="text-xl font-bold text-foreground">Workflow Tinjauan & Persetujuan Manusia</h1>
            </div>
            <p className="text-sm text-foreground-secondary mt-1">
              Pekerjaan: <span className="font-medium text-foreground">{jobTitle}</span> • Tahap saat ini:{' '}
              <span className="font-semibold text-primary">{pipelineStage.toUpperCase()}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleFinalizeApproval}
              disabled={submitting || (isProtectedDomain && reviewedCount === 0)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <UserCheck className="w-4 h-4" />
              Sahkan Pekerjaan Final
            </button>
          </div>
        </div>

        {/* Guardrail Policy Indicator */}
        <div
          className={`mt-5 p-4 rounded-xl border flex items-start gap-3 text-sm ${
            isProtectedDomain
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
              : 'bg-primary/5 border-primary/20 text-foreground'
          }`}
        >
          {isProtectedDomain ? (
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-semibold">
              {isProtectedDomain
                ? 'Kebijakan Guardrail Human Review Wajib (Domain Sensitif)'
                : 'Pusat Keputusan Kebijakan Terpadu (Unified PDP)'}
            </p>
            <p className="text-xs mt-0.5 text-foreground-secondary leading-relaxed">
              {isProtectedDomain
                ? `Kategori '${domainCategory}' termasuk domain berisiko tinggi. Sistem mengunci status final menjadi 'in_review' sampai peninjau manusia melakukan minimal 1 validasi (Sudah ditinjau: ${reviewedCount}/${candidates.length}).`
                : `Setiap persetujuan atau modifikasi tercatat di Audit Ledger secara permanen dengan stempel waktu dan identitas akun peninjau.`}
            </p>
          </div>
        </div>
      </div>

      {/* Batch Actions Bar & Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
          <p className="text-xs text-foreground-secondary font-medium">Total Kandidat Terdaftar</p>
          <p className="text-2xl font-bold text-foreground mt-1">{candidates.length}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
          <p className="text-xs text-foreground-secondary font-medium">Menunggu Tinjauan</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{pendingCount}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
          <p className="text-xs text-foreground-secondary font-medium">Telah Divalidasi</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{reviewedCount}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col justify-center gap-2">
          <button
            onClick={handleBatchApproveSelected}
            disabled={batchLoading}
            className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
          >
            Approve All Selected
          </button>
          <button
            onClick={() => setShowBatchThresholdModal(true)}
            disabled={batchLoading}
            className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition disabled:opacity-50"
          >
            Reject Below Threshold...
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {['all', 'pending', 'approved', 'rejected', 'overridden'].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
              filterStatus === st
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-surface-secondary text-foreground-secondary hover:text-foreground'
            }`}
          >
            {st} ({st === 'all' ? candidates.length : candidates.filter((c) => (c.decision_status || '').toLowerCase() === st).length})
          </button>
        ))}
      </div>

      {/* Candidates Review Table */}
      {isLoading ? (
        <div className="space-y-3">
          <SkeletonLoader count={4} />
        </div>
      ) : filteredCandidates.length === 0 ? (
        <EmptyState
          title="Tidak Ada Kandidat untuk Ditinjau"
          description="Seluruh kandidat dalam filter ini sudah selesai diproses atau belum ada data evaluasi."
          actionLabel="Muat Ulang Data"
          onAction={onRefresh}
        />
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-secondary/50 text-foreground-secondary text-xs uppercase font-semibold border-b border-border">
                <tr>
                  <th className="px-4 py-3">Peringkat</th>
                  <th className="px-4 py-3">Identitas / Entitas</th>
                  <th className="px-4 py-3">Skor Total</th>
                  <th className="px-4 py-3">Breakdown Bobot</th>
                  <th className="px-4 py-3">Status Saat Ini</th>
                  <th className="px-4 py-3">Catatan Peninjau</th>
                  <th className="px-4 py-3 text-right">Aksi Keputusan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {filteredCandidates.map((cand) => {
                  const status = (cand.decision_status || 'pending').toLowerCase();
                  return (
                    <tr key={cand.id} className="hover:bg-surface-secondary/30 transition">
                      <td className="px-4 py-3 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">
                            {cand.rank_position || '-'}
                          </span>
                          {cand.previous_rank_position && cand.previous_rank_position !== cand.rank_position && (
                            <span className="text-[10px] text-foreground-secondary line-through">
                              #{cand.previous_rank_position}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{cand.entity_label}</p>
                        {cand.recommendation_classification && (
                          <span className="inline-block mt-0.5 text-[10px] uppercase font-semibold text-primary">
                            {cand.recommendation_classification}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-baseline gap-1">
                          <span className="text-base font-bold text-foreground">{cand.total_score.toFixed(1)}</span>
                          <span className="text-xs text-foreground-secondary">/100</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {Object.entries(cand.score_breakdown || {}).map(([k, v]) => (
                            <span
                              key={k}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-surface-secondary text-foreground-secondary border border-border"
                              title={`${k}: ${v}`}
                            >
                              {k.slice(0, 10)}: <span className="font-semibold text-foreground">{Number(v).toFixed(0)}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                            status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : status === 'rejected'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              : status === 'overridden'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                          {status === 'rejected' && <XCircle className="w-3 h-3" />}
                          {status === 'overridden' && <Sliders className="w-3 h-3" />}
                          {status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-foreground-secondary truncate" title={cand.reviewer_notes || ''}>
                          {cand.reviewer_notes || <span className="italic text-foreground-tertiary">Belum ada catatan</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenAction(cand, 'approved')}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                            title="Setujui (Approve)"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenAction(cand, 'rejected')}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            title="Tolak (Reject)"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenAction(cand, 'overridden')}
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition"
                            title="Modifikasi Skor (Override)"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Individual Decision Modal */}
      {selectedCandidate && actionType && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface rounded-2xl border border-border max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                {actionType === 'approved' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                {actionType === 'rejected' && <XCircle className="w-5 h-5 text-rose-600" />}
                {actionType === 'overridden' && <Sliders className="w-5 h-5 text-amber-600" />}
                Keputusan Tinjauan: {actionType.toUpperCase()}
              </h3>
              <button onClick={handleCloseModal} className="text-foreground-secondary hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="text-sm space-y-1">
              <p>
                Entitas: <span className="font-semibold text-foreground">{selectedCandidate.entity_label}</span>
              </p>
              <p className="text-foreground-secondary">
                Skor Algoritma Saat Ini: <span className="font-bold text-foreground">{selectedCandidate.total_score.toFixed(1)}</span> / 100
              </p>
            </div>

            {/* Override score field */}
            {actionType === 'overridden' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Skor Baru (0 - 100) *</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Contoh: 88.5" // allowlist: standard UI input hint
                />
              </div>
            )}

            {/* Reason Notes */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Catatan Alasan Peninjau {(actionType === 'rejected' || actionType === 'overridden') && <span className="text-rose-500">* (Wajib)</span>}
              </label>
              <textarea
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={ // allowlist: standard UI input hint
                  actionType === 'rejected'
                    ? 'Sebutkan alasan penolakan kandidat/entitas ini secara objektif...'
                    : actionType === 'overridden'
                    ? 'Sebutkan pertimbangan mengapa skor diubah secara manual...'
                    : 'Catatan tambahan persetujuan (opsional)...'
                }
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-surface-secondary text-foreground hover:bg-surface-secondary/80 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitIndividualReview}
                disabled={submitting}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Keputusan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Threshold Modal */}
      {showBatchThresholdModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface rounded-2xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-600" />
              Tolak Massal Di Bawah Ambang Batas
            </h3>
            <p className="text-xs text-foreground-secondary">
              Semua kandidat dengan skor total di bawah nilai yang ditentukan akan otomatis ditandai sebagai REJECTED.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Ambang Batas Skor Minimal</label>
              <input
                type="number"
                min="0"
                max="100"
                value={thresholdScore}
                onChange={(e) => setThresholdScore(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Catatan Penolakan Wajib</label>
              <textarea
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowBatchThresholdModal(false)}
                disabled={batchLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-surface-secondary text-foreground"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleBatchRejectBelowThreshold}
                disabled={batchLoading}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition disabled:opacity-50"
              >
                {batchLoading ? 'Memproses...' : 'Tolak Massal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
