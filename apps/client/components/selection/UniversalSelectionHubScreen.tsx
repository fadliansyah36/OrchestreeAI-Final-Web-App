'use client';

import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  Sparkles,
  Sliders,
  BarChart3,
  Hash,
  ShieldCheck,
  RefreshCw,
  Plus,
  FileText,
  Award,
  Lock,
  TrendingUp,
  Lightbulb,
  AlertOctagon,
  Compass,
  Activity,
  Check,
  HelpCircle,
  Layers,
  PieChart as PieIcon,
  BrainCircuit,
  ArrowLeft
} from 'lucide-react';
import { SelectionAnalyticsScreen } from './SelectionAnalyticsScreen';
import { SelectionInsightPanel } from './SelectionInsightPanel';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  CartesianGrid,
  Legend,
  ScatterChart,
  Scatter,
  LineChart,
  Line
} from 'recharts';

interface SelectionCriterion {
  key: string;
  label: string;
  description?: string;
  weight: number;
  min_threshold?: number;
}

interface SelectionDocument {
  id: string;
  document_name: string;
  file_url: string;
  source_type: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  raw_text: string;
  parsed_attributes: {
    skills?: string[];
    experience_years?: number;
    strengths?: string[];
    extracted_at?: string;
  };
  extraction_status: string;
  model_used: string;
  created_at: string;
}

interface SelectionScoreResult {
  id: string;
  run_id: string;
  document_id: string;
  candidate_name: string;
  rank_position: number;
  overall_score: number;
  criterion_breakdown: Record<string, number>;
  justification: string;
  recommendation: 'HIGHLY_RECOMMENDED' | 'RECOMMENDED' | 'CONSIDER' | 'REJECT';
  human_reviewed: boolean;
  human_override_score: number | null;
  human_review_status: 'PENDING' | 'ACCEPTED' | 'OVERRIDDEN' | 'REJECTED';
  human_reviewer_notes: string | null;
  created_at: string;
}

interface SelectionRun {
  id: string;
  run_number: number;
  model_used: string;
  weights_snapshot: Record<string, number>;
  calibration_version: number;
  status: string;
  total_candidates: number;
  average_score: number;
  reproducibility_hash: string;
  execution_duration_ms: number;
  created_at: string;
}

interface CalibrationRecord {
  id: string;
  criteria_key: string;
  old_weight: number;
  adjusted_weight: number;
  calibration_factor: number;
  human_feedback_notes: string;
  created_at: string;
}

interface SelectionJob {
  id: string;
  tenant_id: string;
  title: string;
  category: string;
  description: string;
  criteria: SelectionCriterion[];
  weights: Record<string, number>;
  status: 'DRAFT' | 'INGESTING' | 'PROCESSING' | 'CALIBRATING' | 'PENDING_HUMAN_REVIEW' | 'FINAL_APPROVED' | 'REJECTED';
  total_documents: number;
  active_run_id: string | null;
  human_reviewer_id: string | null;
  human_review_notes: string | null;
  final_approved_at: string | null;
  created_at: string;
  updated_at: string;
  documents?: SelectionDocument[];
  active_run?: SelectionRun | null;
  scoring_results?: SelectionScoreResult[];
  calibration_history?: CalibrationRecord[];
}

export function UniversalSelectionHubScreen({
  tenantId = 'default-tenant',
  onBack,
}: {
  tenantId?: string;
  onBack?: () => void;
}) {
  const [jobs, setJobs] = useState<SelectionJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<SelectionJob | null>(null);
  const [activeTab, setActiveTab] = useState<'ranking' | 'upload' | 'calibration' | 'analytics'>('ranking');
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Review modal
  const [reviewModalTarget, setReviewModalTarget] = useState<SelectionScoreResult | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'ACCEPTED' | 'OVERRIDDEN' | 'REJECTED'>('ACCEPTED');
  const [reviewOverrideScore, setReviewOverrideScore] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');

  // Final approval modal
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [finalApprovalNotes, setFinalApprovalNotes] = useState('');

  // Create Job modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobCategory, setNewJobCategory] = useState('RECRUITMENT');
  const [newJobDescription, setNewJobDescription] = useState('');

  // Upload Document modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [docCandidateName, setDocCandidateName] = useState('');
  const [docCandidateEmail, setDocCandidateEmail] = useState('');
  const [docCandidatePhone, setDocCandidatePhone] = useState('');
  const [docName, setDocName] = useState('');
  const [docSourceType, setDocSourceType] = useState('RESUME');
  const [docRawContent, setDocRawContent] = useState('');

  // Continuous Calibration form
  const [calNotes, setCalNotes] = useState('');
  const [calAdjustments, setCalAdjustments] = useState<Record<string, number>>({});

  // Dynamic Analytics & Diagram Selector & Grounded AI Insights
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [visualizationsData, setVisualizationsData] = useState<any[]>([]);
  const [insightsData, setInsightsData] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs`);
      if (res.ok) {
        const json = await res.json();
        const list: SelectionJob[] = json.data || [];
        setJobs(list);
        if (list.length > 0 && !selectedJobId) {
          setSelectedJobId(list[0].id);
        }
      }
    } catch (err: any) {
      console.error('Gagal mengambil daftar seleksi:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchJobDetail = async (jobId: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${jobId}`);
      if (res.ok) {
        const json = await res.json();
        const detail: SelectionJob = json.data;
        setCurrentJob(detail);

        if (detail.weights) {
          const adj: Record<string, number> = {};
          Object.keys(detail.weights).forEach(k => {
            adj[k] = 1.0;
          });
          setCalAdjustments(adj);
        }
      }
    } catch (err: any) {
      console.error('Gagal mengambil rincian seleksi:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAnalyticsAndVisualizations = async (jobId: string) => {
    try {
      setAnalyticsLoading(true);
      const [anaRes, vizRes, insRes] = await Promise.all([
        fetch(`/api/v1/selection/tenants/${tenantId}/jobs/${jobId}/analytics`),
        fetch(`/api/v1/selection/tenants/${tenantId}/jobs/${jobId}/visualizations`),
        fetch(`/api/v1/selection/tenants/${tenantId}/jobs/${jobId}/insights`),
      ]);
      if (anaRes.ok) {
        const j = await anaRes.json();
        setAnalyticsData(j.data || null);
      }
      if (vizRes.ok) {
        const j = await vizRes.json();
        setVisualizationsData(j.data || []);
      }
      if (insRes.ok) {
        const j = await insRes.json();
        setInsightsData(j.data || []);
      }
    } catch (err) {
      console.error('Gagal mengambil analitik dan visualisasi:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [tenantId]);

  useEffect(() => {
    if (selectedJobId) {
      fetchJobDetail(selectedJobId);
      fetchAnalyticsAndVisualizations(selectedJobId);
    }
  }, [selectedJobId]);

  const handleExecuteScoring = async () => {
    if (!currentJob) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${currentJob.id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_used: 'meta-llama/llama-3.3-70b-instruct' })
      });
      if (res.ok) {
        showFeedback('Scoring deterministik selesai! Perangkingan terverifikasi dengan hash reproduksibilitas.');
        await fetchJobDetail(currentJob.id);
        fetchAnalyticsAndVisualizations(currentJob.id);
        fetchJobs();
      } else {
        const err = await res.json();
        showFeedback(err.error || err.detail || 'Gagal mengeksekusi scoring.', 'error');
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewModalTarget) return;
    if (!reviewNotes || reviewNotes.trim().length < 5) {
      showFeedback('Catatan peninjau wajib diisi minimal 5 karakter untuk integritas audit.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const payload: any = {
        decision: reviewDecision,
        reviewer_notes: reviewNotes,
        reviewer_id: 'reviewer-lead-uuid'
      };
      if (reviewDecision === 'OVERRIDDEN' && reviewOverrideScore) {
        payload.override_score = parseFloat(reviewOverrideScore);
      }

      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/scores/${reviewModalTarget.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showFeedback(`Human review untuk ${reviewModalTarget.candidate_name} berhasil dicatat!`);
        setReviewModalTarget(null);
        setReviewNotes('');
        setReviewOverrideScore('');
        if (currentJob) await fetchJobDetail(currentJob.id);
      } else {
        const err = await res.json();
        showFeedback(err.error || err.detail || 'Gagal menyimpan tinjauan.', 'error');
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalApproval = async () => {
    if (!currentJob) return;
    if (!finalApprovalNotes || finalApprovalNotes.trim().length < 10) {
      showFeedback('Catatan persetujuan akhir wajib diisi minimal 10 karakter.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${currentJob.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_id: 'reviewer-director-uuid',
          approval_notes: finalApprovalNotes
        })
      });

      if (res.ok) {
        showFeedback('Pekerjaan seleksi berhasil disetujui secara final dan dicatat ke Audit Ledger!');
        setShowFinalModal(false);
        setFinalApprovalNotes('');
        await fetchJobDetail(currentJob.id);
        fetchJobs();
      } else {
        const err = await res.json();
        showFeedback(err.error || err.detail || 'Persetujuan akhir ditolak.', 'error');
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApplyCalibration = async () => {
    if (!currentJob) return;
    if (!calNotes || calNotes.trim().length < 5) {
      showFeedback('Catatan kalibrasi wajib diisi minimal 5 karakter.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${currentJob.id}/calibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          human_feedback_notes: calNotes,
          criteria_adjustments: calAdjustments,
          human_reviewer_id: 'lead-evaluator-uuid'
        })
      });

      if (res.ok) {
        showFeedback('Bobot kriteria berhasil dikalibrasi berkelanjutan! Jalankan scoring ulang untuk memperbarui ranking.');
        setCalNotes('');
        await fetchJobDetail(currentJob.id);
      } else {
        const err = await res.json();
        showFeedback(err.error || err.detail || 'Gagal mengkalibrasi bobot.', 'error');
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateJob = async () => {
    if (!newJobTitle.trim()) {
      showFeedback('Judul pekerjaan seleksi wajib diisi.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newJobTitle,
          category: newJobCategory,
          description: newJobDescription
        })
      });

      if (res.ok) {
        const json = await res.json();
        showFeedback('Pekerjaan seleksi baru berhasil dibuat!');
        setShowCreateModal(false);
        setNewJobTitle('');
        setNewJobDescription('');
        await fetchJobs();
        setSelectedJobId(json.data.id);
      } else {
        const err = await res.json();
        showFeedback(err.error || err.detail || 'Gagal membuat pekerjaan seleksi.', 'error');
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadDocument = async () => {
    if (!currentJob) return;
    if (!docCandidateName.trim() || !docName.trim()) {
      showFeedback('Nama kandidat dan nama berkas wajib diisi.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${currentJob.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_name: docName,
          candidate_name: docCandidateName,
          source_type: docSourceType,
          candidate_email: docCandidateEmail,
          candidate_phone: docCandidatePhone,
          raw_text: docRawContent || `Kandidat ${docCandidateName} memiliki kualifikasi relevan pada ${docName}.`
        })
      });

      if (res.ok) {
        showFeedback(`Berkas ${docName} berhasil diunggah & atribut terstruktur diekstraksi.`);
        setShowUploadModal(false);
        setDocCandidateName('');
        setDocCandidateEmail('');
        setDocCandidatePhone('');
        setDocName('');
        setDocRawContent('');
        await fetchJobDetail(currentJob.id);
      } else {
        const err = await res.json();
        showFeedback(err.error || err.detail || 'Gagal mengunggah berkas.', 'error');
      }
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const scores = currentJob?.scoring_results || [];
  const unreviewedCount = scores.filter(s => !s.human_reviewed).length;
  const allReviewed = scores.length > 0 && unreviewedCount === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {feedbackMessage && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl flex items-center space-x-3 text-sm font-medium border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/60'
              : 'bg-rose-950/90 text-rose-200 border-rose-700/60'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Header Utama */}
      {onBack && (
        <div className="mb-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Feature Hub</span>
          </button>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <Award className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Universal Selection Hub
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Autonomous Workforce
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Seleksi cerdas multi-sumber, scoring deterministik dengan verifikasi reproduksibilitas & Human Review Gate wajib.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchJobs()}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 text-sm font-medium flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-emerald-700/25 transition"
          >
            <Plus className="w-4 h-4" />
            Pekerjaan Seleksi Baru
          </button>
        </div>
      </div>

      {/* Selector Pekerjaan & Ringkasan Status */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              Pekerjaan Seleksi Aktif
            </label>
            <select
              value={selectedJobId || ''}
              onChange={e => setSelectedJobId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            >
              {jobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.title} ({j.category} • {j.status})
                </option>
              ))}
            </select>
            {currentJob?.description && (
              <p className="text-xs text-slate-400 mt-2 line-clamp-1">{currentJob.description}</p>
            )}
          </div>

          <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-4">
            <div>
              <span className="text-xs text-slate-400 block">Status Alur</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-1 ${
                  currentJob?.status === 'FINAL_APPROVED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : currentJob?.status === 'PENDING_HUMAN_REVIEW'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : currentJob?.status === 'CALIBRATING'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {currentJob?.status === 'FINAL_APPROVED' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                {currentJob?.status === 'PENDING_HUMAN_REVIEW' && <Clock className="w-3.5 h-3.5 text-amber-400" />}
                {currentJob?.status || 'MEMUAT'}
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Berkas Terunggah</span>
              <span className="text-base font-bold text-white mt-1 block">
                {currentJob?.total_documents || 0} Dokumen
              </span>
            </div>
          </div>
        </div>

        {/* Human Review Gate Status Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Human Review Gate
            </span>
            {allReviewed ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Siap Disetujui
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" /> Wajib Review ({unreviewedCount} Tersisa)
              </span>
            )}
          </div>

          <div className="my-2">
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  allReviewed ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{
                  width: `${scores.length > 0 ? ((scores.length - unreviewedCount) / scores.length) * 100 : 0}%`
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {scores.length - unreviewedCount} dari {scores.length} Ditinjau
            </span>
            {currentJob?.status === 'FINAL_APPROVED' ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3" /> Telah Disetujui
              </span>
            ) : (
              <button
                onClick={() => setShowFinalModal(true)}
                disabled={!allReviewed || actionLoading}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                  allReviewed
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                Persetujuan Final
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigasi Tab */}
      <div className="flex border-b border-slate-800 space-x-1">
        <button
          onClick={() => setActiveTab('ranking')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'ranking'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          Perangkingan & Tinjauan Manusia
          {scores.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {scores.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'upload'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          Unggah Berkas Multi-Sumber
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {currentJob?.documents?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('calibration')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'calibration'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Kriteria & Kalibrasi Berkelanjutan
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'analytics'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analitik & Jejak Audit
        </button>
      </div>

      {/* Tab 1: Ranking */}
      {activeTab === 'ranking' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Hash className="w-4 h-4 text-emerald-400" />
                Daftar Peringkat Terverifikasi & Deterministik
              </h2>
              {currentJob?.active_run ? (
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Hash Reproduksibilitas: {currentJob.active_run.reproducibility_hash.substring(0, 24)}... • Putaran #{currentJob.active_run.run_number}
                </p>
              ) : (
                <p className="text-xs text-slate-400 mt-1">
                  Scoring belum dijalankan. Klik tombol di kanan untuk memproses dokumen sumber.
                </p>
              )}
            </div>

            <button
              onClick={handleExecuteScoring}
              disabled={actionLoading || !currentJob?.documents || currentJob.documents.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/25 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {actionLoading ? 'Mengkalkulasi...' : 'Jalankan Scoring Deterministik'}
            </button>
          </div>

          {scores.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl p-12 text-center">
              <Award className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-medium text-slate-300">Belum Ada Hasil Scoring</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
                Unggah dokumen sumber kandidat atau jalankan scoring deterministik untuk menyusun peringkat pelamar.
              </p>
              <button
                onClick={() => setActiveTab('upload')}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition"
              >
                Ke Unggah Berkas
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {scores.map((cand) => (
                <div
                  key={cand.id}
                  className={`bg-slate-900/90 border rounded-xl p-4 transition-all duration-200 ${
                    cand.human_reviewed
                      ? 'border-slate-800 hover:border-slate-700'
                      : 'border-amber-900/60 bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/20'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                          cand.rank_position === 1
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : cand.rank_position === 2
                            ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30'
                            : cand.rank_position === 3
                            ? 'bg-amber-800/30 text-amber-500 border border-amber-800/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{cand.rank_position}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-semibold text-white">{cand.candidate_name}</h4>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              cand.recommendation === 'HIGHLY_RECOMMENDED'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : cand.recommendation === 'RECOMMENDED'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                : cand.recommendation === 'CONSIDER'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {cand.recommendation === 'HIGHLY_RECOMMENDED' ? 'Sangat Direkomendasikan' : cand.recommendation}
                          </span>

                          {cand.human_reviewed ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Ditinjau ({cand.human_review_status})
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700 flex items-center gap-1 font-semibold animate-pulse">
                              <Clock className="w-3 h-3 text-amber-400" />
                              Menunggu Human Review
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 mt-1">{cand.justification}</p>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {Object.entries(cand.criterion_breakdown).map(([critKey, val]) => (
                            <span key={critKey} className="text-xs bg-slate-950 px-2 py-1 rounded border border-slate-800 text-slate-300">
                              <span className="text-slate-500 font-mono text-[10px]">{critKey}:</span> {val}
                            </span>
                          ))}
                        </div>

                        {cand.human_reviewer_notes && (
                          <div className="mt-2 text-xs bg-slate-950/70 p-2 rounded border border-slate-800 text-slate-300">
                            <span className="text-emerald-400 font-semibold">Catatan Reviewer: </span>
                            {cand.human_reviewer_notes}
                            {cand.human_override_score !== null && (
                              <span className="ml-2 text-amber-300 font-mono">
                                (Override Skor: {cand.human_override_score})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between lg:justify-end gap-4 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Skor Akhir</span>
                        <div className="text-2xl font-bold font-mono text-emerald-400">
                          {cand.human_override_score !== null ? cand.human_override_score : cand.overall_score}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setReviewModalTarget(cand);
                          setReviewDecision(cand.human_review_status === 'PENDING' ? 'ACCEPTED' : (cand.human_review_status as any));
                          setReviewOverrideScore(cand.human_override_score ? String(cand.human_override_score) : '');
                          setReviewNotes(cand.human_reviewer_notes || '');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                          cand.human_reviewed
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30'
                        }`}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        {cand.human_reviewed ? 'Ubah Tinjauan' : 'Tinjau Sekarang'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Upload */}
      {activeTab === 'upload' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emerald-400" />
                Manajemen Dokumen Multi-Sumber
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Dukungan resume, berkas tender, portofolio, dan evaluasi berkas dengan ekstraksi fitur terstruktur LLM.
              </p>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              Unggah Dokumen Baru
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(currentJob?.documents || []).map((doc) => (
              <div key={doc.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-emerald-400">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{doc.candidate_name}</h4>
                      <p className="text-xs text-slate-400">{doc.document_name}</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 font-mono text-emerald-400 border border-slate-700">
                    {doc.source_type}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2 text-xs">
                  <div className="text-[11px] font-semibold text-slate-300">
                    Ekstraksi Fitur (Model: {doc.model_used}):
                  </div>
                  {doc.parsed_attributes?.skills && (
                    <div className="flex flex-wrap gap-1">
                      {doc.parsed_attributes.skills.map((s: string, idx: number) => (
                        <span key={idx} className="bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded text-[10px] border border-slate-800">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {doc.parsed_attributes?.experience_years && (
                    <p className="text-slate-400">
                      Pengalaman Kerja: <span className="text-white font-medium">{doc.parsed_attributes.experience_years} Tahun</span>
                    </p>
                  )}
                  {doc.parsed_attributes?.strengths && (
                    <div className="text-slate-400">
                      {doc.parsed_attributes.strengths.map((str: string, i: number) => (
                        <div key={i} className="text-emerald-400 text-[11px] flex items-center gap-1 mt-0.5">
                          • {str}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Kalibrasi */}
      {activeTab === 'calibration' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Matriks Bobot & Kalibrasi Umpan Balik Manusia
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Kriteria evaluasi dan mekanisme kalibrasi adaptif berlandaskan pertimbangan Human Reviewer.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentJob?.criteria?.map((crit) => {
                const currentWeight = currentJob.weights[crit.key] || crit.weight;
                const adjustment = calAdjustments[crit.key] || 1.0;
                return (
                  <div key={crit.key} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{crit.label}</span>
                      <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                        Bobot: {(currentWeight * 100).toFixed(1)}%
                      </span>
                    </div>
                    {crit.description && <p className="text-xs text-slate-400">{crit.description}</p>}

                    <div className="pt-2 border-t border-slate-850 flex items-center justify-between gap-3">
                      <label className="text-xs text-slate-400">Faktor Kalibrasi:</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          value={adjustment}
                          onChange={(e) =>
                            setCalAdjustments({
                              ...calAdjustments,
                              [crit.key]: parseFloat(e.target.value)
                            })
                          }
                          className="w-28 accent-emerald-500"
                        />
                        <span className="text-xs font-mono text-emerald-300 w-10 text-right">
                          {adjustment.toFixed(1)}x
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Catatan Umpan Balik Kalibrasi Reviewer
              </label>
              <textarea
                value={calNotes}
                onChange={(e) => setCalNotes(e.target.value)}
                rows={2}
                placeholder="Misal: Naikkan bobot rekam jejak teknis karena proyek membutuhkan kestabilan arsitektur tingkat lanjut..." // allowlist: standard UI input hint
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-3 text-xs focus:outline-none focus:border-emerald-500"
              />

              <div className="flex justify-end">
                <button
                  onClick={handleApplyCalibration}
                  disabled={actionLoading || !calNotes.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-700/25 transition disabled:opacity-50"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  {actionLoading ? 'Menerapkan...' : 'Terapkan Kalibrasi Bobot'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Analytics */}
      {activeTab === 'analytics' && (
        <SelectionAnalyticsScreen
          jobId={selectedJobId || currentJob?.id || ''}
          tenantId={tenantId}
          jobTitle={currentJob?.title}
          scoringResults={scores.map((s) => ({
            ...s,
            total_score: s.overall_score,
            entity_label: s.candidate_name,
            score_breakdown: s.criterion_breakdown,
          }))}
          analytics={analyticsData}
          visualizations={visualizationsData}
          insights={insightsData}
          onSelectEntityForReview={(entity) => {
            setReviewModalTarget(entity);
            setReviewDecision('ACCEPTED');
            setReviewOverrideScore(String(entity.overall_score || entity.total_score || ''));
          }}
        />
      )}

      {/* Review Modal */}
      {reviewModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Tinjauan Manusia Wajib</h3>
                <p className="text-xs text-slate-400">{reviewModalTarget.candidate_name}</p>
              </div>
              <button
                onClick={() => setReviewModalTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Keputusan Tinjauan</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ACCEPTED', 'OVERRIDDEN', 'REJECTED'] as const).map((dec) => (
                    <button
                      key={dec}
                      type="button"
                      onClick={() => setReviewDecision(dec)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                        reviewDecision === dec
                          ? dec === 'ACCEPTED'
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : dec === 'OVERRIDDEN'
                            ? 'bg-amber-600 border-amber-500 text-white'
                            : 'bg-rose-600 border-rose-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {dec}
                    </button>
                  ))}
                </div>
              </div>

              {reviewDecision === 'OVERRIDDEN' && (
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Skor Penyesuaian Manusia (0 - 100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={reviewOverrideScore}
                    onChange={(e) => setReviewOverrideScore(e.target.value)}
                    placeholder={`Skor AI asli: ${reviewModalTarget.overall_score}`} // allowlist: standard UI input hint
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Catatan Justifikasi Tinjauan (Wajib)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                  placeholder="Justifikasi peninjauan manusia atas kualifikasi, validasi sertifikasi, atau catatan wawancara..." // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setReviewModalTarget(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-700/25 transition disabled:opacity-50"
              >
                {actionLoading ? 'Menyimpan...' : 'Simpan Tinjauan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final Approval Modal */}
      {showFinalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center space-x-2 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Persetujuan Akhir Seleksi</h3>
            </div>
            <p className="text-xs text-slate-400">
              Seluruh kandidat telah melalui verifikasi Human Review. Menyetujui secara final akan mengunci hasil peringkat dan mencatat audit ledger permanen.
            </p>

            <textarea
              value={finalApprovalNotes}
              onChange={(e) => setFinalApprovalNotes(e.target.value)}
              rows={3}
              placeholder="Catatan penutupan komite seleksi dan rekomendasi penugasan..." // allowlist: standard UI input hint
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowFinalModal(false)}
                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Batal
              </button>
              <button
                onClick={handleFinalApproval}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-700/25 transition disabled:opacity-50"
              >
                {actionLoading ? 'Memproses...' : 'Setujui Secara Final'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Buat Pekerjaan Seleksi Cerdas Baru</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Judul Seleksi</label>
                <input
                  type="text"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  placeholder="Misal: Seleksi Senior MLOps Engineer" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Kategori</label>
                <select
                  value={newJobCategory}
                  onChange={(e) => setNewJobCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="RECRUITMENT">Rekrutmen Karyawan</option>
                  <option value="VENDOR_SELECTION">Seleksi Vendor</option>
                  <option value="TENDER_EVALUATION">Evaluasi Tender</option>
                  <option value="LEAD_QUALIFICATION">Kualifikasi Prospek</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Deskripsi Lingkup</label>
                <textarea
                  value={newJobDescription}
                  onChange={(e) => setNewJobDescription(e.target.value)}
                  rows={2}
                  placeholder="Kriteria teknis, ruang lingkup, dan ekspektasi peran..." // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Batal
              </button>
              <button
                onClick={handleCreateJob}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                {actionLoading ? 'Menyimpan...' : 'Buat Pekerjaan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Unggah Berkas Sumber Kandidat</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nama Kandidat / Vendor</label>
                <input
                  type="text"
                  value={docCandidateName}
                  onChange={(e) => setDocCandidateName(e.target.value)}
                  placeholder="Misal: Dimas Pratama" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Nama Berkas</label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="Misal: CV_Dimas_Pratama.pdf" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Jenis Berkas</label>
                  <select
                    value={docSourceType}
                    onChange={(e) => setDocSourceType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="RESUME">Resume / CV</option>
                    <option value="PROPOSAL">Proposal Tender</option>
                    <option value="PORTFOLIO">Portofolio Teknis</option>
                    <option value="CERTIFICATE">Sertifikat Resmi</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Email</label>
                  <input
                    type="email"
                    value={docCandidateEmail}
                    onChange={(e) => setDocCandidateEmail(e.target.value)}
                    placeholder="kontak@domain.com" // allowlist: standard UI input hint
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Konten Teks Berkas</label>
                <textarea
                  value={docRawContent}
                  onChange={(e) => setDocRawContent(e.target.value)}
                  rows={3}
                  placeholder="Keahlian: Python, FastAPI, Docker, PostgreSQL... Pengalaman 6 tahun sistem AI terdistribusi..." // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Batal
              </button>
              <button
                onClick={handleUploadDocument}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                {actionLoading ? 'Mengekstrak...' : 'Simpan & Ekstrak Fitur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
