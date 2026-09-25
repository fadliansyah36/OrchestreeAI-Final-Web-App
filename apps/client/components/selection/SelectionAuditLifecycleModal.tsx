'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Layers,
  Award,
  CheckCircle2,
  XCircle,
  Download,
  AlertTriangle,
  UserCheck,
  Bot,
  Database,
  Sliders,
  ExternalLink,
  ChevronRight,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

export interface SelectionAuditLifecycleModalProps {
  tenantId: string;
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SelectionAuditLifecycleModal({
  tenantId,
  jobId,
  isOpen,
  onClose,
}: SelectionAuditLifecycleModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'prompt' | 'documents' | 'results' | 'exports'>('timeline');

  useEffect(() => {
    if (!isOpen || !jobId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/tenants/${tenantId}/selection/jobs/${jobId}/audit-lifecycle`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Gagal mengambil data jejak audit siklus hidup.');
        }
        return res.json();
      })
      .then((json) => {
        if (isMounted) {
          setData(json.data || null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, jobId, tenantId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-surface rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-surface-secondary/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground tracking-tight">
                  Jejak Audit Siklus Hidup Seleksi
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {jobId.slice(0, 8)}...
                </span>
              </div>
              <p className="text-xs text-foreground-secondary mt-0.5">
                Audit trail terpadu dari instruksi awal, dataset sumber, evaluasi AI, persetujuan, hingga ekspor laporan.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-secondary hover:text-foreground hover:bg-surface-secondary transition-colors"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-border bg-surface overflow-x-auto">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground-secondary hover:text-foreground'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Rantai Kejadian ({data?.timeline?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'prompt'
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground-secondary hover:text-foreground'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Instruksi & Kriteria</span>
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'documents'
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground-secondary hover:text-foreground'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Dataset Sumber ({data?.dataset_documents?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'results'
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground-secondary hover:text-foreground'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Hasil & Persetujuan ({data?.scoring_results?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('exports')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'exports'
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground-secondary hover:text-foreground'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Riwayat Ekspor ({data?.exports?.length || 0})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-5">
          {loading && (
            <div className="p-4 space-y-4">
              <SkeletonLoader count={4} />
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm">
              <p className="font-semibold">Terjadi kendala saat memuat jejak audit</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl border border-border bg-surface-secondary/40">
                  <span className="text-[11px] text-foreground-secondary font-medium block">Domain Evaluasi</span>
                  <span className="text-sm font-bold text-foreground mt-0.5 block uppercase">
                    {data.domain_category || 'General'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl border border-border bg-surface-secondary/40">
                  <span className="text-[11px] text-foreground-secondary font-medium block">Status Alur</span>
                  <span className="text-sm font-bold text-primary mt-0.5 block uppercase">
                    {data.pipeline_stage || 'Unknown'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl border border-border bg-surface-secondary/40">
                  <span className="text-[11px] text-foreground-secondary font-medium block">Entitas Teruji</span>
                  <span className="text-sm font-bold text-foreground mt-0.5 block">
                    {data.summary?.total_entities_evaluated || 0} Entitas
                  </span>
                </div>
                <div className="p-3.5 rounded-xl border border-border bg-surface-secondary/40">
                  <span className="text-[11px] text-foreground-secondary font-medium block">Persetujuan Akhir</span>
                  <span className={`text-sm font-bold mt-0.5 block ${
                    data.summary?.is_final_approved ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                  }`}>
                    {data.summary?.is_final_approved ? 'Disahkan Final' : 'Menunggu Pengesahan'}
                  </span>
                </div>
              </div>

              {/* Tab 1: Timeline */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-secondary">
                    Rantai Kejadian Siklus Hidup ({data.timeline?.length || 0})
                  </h3>
                  {data.timeline && data.timeline.length > 0 ? (
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                      {data.timeline.map((ev: any, idx: number) => {
                        const isDenied = ev.event_type === 'SELECTION_ABAC_DENIED';
                        const isReview = ev.event_type === 'SELECTION_HUMAN_REVIEW' || ev.event_type === 'SELECTION_FINAL_APPROVAL';
                        const isExport = ev.event_type === 'SELECTION_REPORT_EXPORTED';

                        return (
                          <div key={ev.id || idx} className="relative group">
                            {/* Dot icon */}
                            <div className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full flex items-center justify-center border text-[10px] ${
                              isDenied
                                ? 'bg-rose-500/20 border-rose-500 text-rose-600'
                                : isReview
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-600'
                                : isExport
                                ? 'bg-purple-500/20 border-purple-500 text-purple-600'
                                : 'bg-primary/20 border-primary text-primary'
                            }`}>
                              {idx + 1}
                            </div>
                            <div className="p-3.5 rounded-xl border border-border bg-surface hover:bg-surface-secondary/20 transition-colors">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-foreground">
                                  {ev.title || ev.event_type}
                                </span>
                                <span className="text-[11px] text-foreground-secondary font-mono">
                                  {ev.timestamp ? new Date(ev.timestamp).toLocaleString('id-ID') : '-'}
                                </span>
                              </div>
                              <p className="text-xs text-foreground-secondary mt-1">
                                {ev.summary}
                              </p>
                              {ev.insights && Object.keys(ev.insights).length > 0 && (
                                <div className="mt-2.5 p-2 rounded-lg bg-surface-secondary/60 border border-border/50 text-[11px] font-mono text-foreground-secondary overflow-x-auto">
                                  {JSON.stringify(ev.insights, null, 2)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      id="empty-selection-timeline"
                      icon={Clock}
                      title="Belum Ada Rantai Kejadian"
                      description="Kejadian siklus hidup akan tercatat secara otomatis saat evaluasi berjalan."
                    />
                  )}
                </div>
              )}

              {/* Tab 2: Prompt & Kriteria */}
              {activeTab === 'prompt' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-border bg-surface-secondary/20">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider block mb-1">
                      Prompt Instruksi Awal
                    </span>
                    <p className="text-xs text-foreground leading-relaxed">
                      {data.prompt_instruction?.instruction_prompt || 'Tidak ada instruksi khusus.'}
                    </p>
                  </div>

                  {data.agent_executor && (
                    <div className="p-4 rounded-xl border border-border bg-surface flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-foreground">
                          Agen AI Eksekutor: {data.agent_executor.name}
                        </span>
                        <p className="text-xs text-foreground-secondary mt-0.5">
                          Jabatan: {data.agent_executor.job_title} • Departemen: {data.agent_executor.department_name}
                        </p>
                        <span className="inline-flex items-center gap-1 mt-2 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3" />
                          <span>ABAC Lulus Verifikasi</span>
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground-secondary mb-2">
                      Kriteria Evaluasi Terbobot
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(data.prompt_instruction?.criteria || []).map((c: any, i: number) => (
                        <div key={i} className="p-3 rounded-xl border border-border bg-surface flex items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold text-foreground block">{c.label || c.key}</span>
                            <span className="text-[10px] text-foreground-secondary uppercase">{c.source_type}</span>
                          </div>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                            {(Number(c.weight) * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Dataset Dokumen Sumber */}
              {activeTab === 'documents' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground-secondary">
                    Dokumen Sumber Terdaftar ({data.dataset_documents?.length || 0})
                  </h4>
                  {data.dataset_documents && data.dataset_documents.length > 0 ? (
                    <div className="space-y-2">
                      {data.dataset_documents.map((doc: any) => (
                        <div key={doc.id} className="p-3.5 rounded-xl border border-border bg-surface flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-foreground block">
                                {doc.raw_text?.slice(0, 40) || `Dokumen ${doc.id.slice(0, 8)}`}...
                              </span>
                              <span className="text-[11px] text-foreground-secondary">
                                Kanal: {doc.source_channel} • Status: {doc.validity_status}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-emerald-600 block">
                              Skor Kualitas: {doc.quality_score}%
                            </span>
                            <span className="text-[10px] text-foreground-secondary font-mono">
                              {doc.ingested_at ? new Date(doc.ingested_at).toLocaleDateString('id-ID') : '-'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      id="empty-audit-docs"
                      icon={Database}
                      title="Belum Ada Dokumen Sumber"
                      description="Pekerjaan ini belum memuat dokumen sumber pendukung."
                    />
                  )}
                </div>
              )}

              {/* Tab 4: Hasil & Persetujuan */}
              {activeTab === 'results' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground-secondary">
                    Hasil Penilaian & Tinjauan Manusia ({data.scoring_results?.length || 0})
                  </h4>
                  {data.scoring_results && data.scoring_results.length > 0 ? (
                    <div className="space-y-2">
                      {data.scoring_results.map((res: any) => {
                        const isApproved = res.decision_status === 'approved';
                        const isOverridden = res.decision_status === 'overridden';
                        const isRejected = res.decision_status === 'rejected';

                        return (
                          <div key={res.id} className="p-3.5 rounded-xl border border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-foreground">
                                  #{res.rank_position || '-'} {res.entity_label}
                                </span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  isApproved
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : isOverridden
                                    ? 'bg-amber-500/10 text-amber-600'
                                    : isRejected
                                    ? 'bg-rose-500/10 text-rose-600'
                                    : 'bg-slate-500/10 text-slate-600'
                                }`}>
                                  {res.decision_status}
                                </span>
                              </div>
                              {res.reviewer_notes && (
                                <p className="text-xs text-foreground-secondary italic mt-1">
                                  Catatan Tinjauan: "{res.reviewer_notes}"
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-bold text-foreground">
                                Skor: {res.total_score}
                              </span>
                              {res.previous_rank_position && (
                                <span className="text-[11px] text-amber-600 font-mono">
                                  (Penyesuaian dari #{res.previous_rank_position})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      id="empty-audit-results"
                      icon={Award}
                      title="Belum Ada Hasil Penilaian"
                      description="Jalankan alur seleksi terlebih dahulu untuk menghasilkan skor dan perangkingan."
                    />
                  )}
                </div>
              )}

              {/* Tab 5: Riwayat Ekspor Berkas */}
              {activeTab === 'exports' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground-secondary">
                    Riwayat Dokumen Laporan Ter-ekspor ({data.exports?.length || 0})
                  </h4>
                  {data.exports && data.exports.length > 0 ? (
                    <div className="space-y-2">
                      {data.exports.map((exp: any, i: number) => (
                        <div key={exp.event_id || i} className="p-3.5 rounded-xl border border-border bg-surface flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                              {exp.format === 'excel' ? (
                                <FileSpreadsheet className="w-4 h-4" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-foreground block">
                                {exp.filename || `Laporan_${exp.format.toUpperCase()}`}
                              </span>
                              <span className="text-[11px] text-foreground-secondary">
                                Format: {exp.format?.toUpperCase()} • Ukuran: {exp.size_bytes ? `${Math.round(exp.size_bytes / 1024)} KB` : '-'}
                              </span>
                            </div>
                          </div>
                          {exp.download_url && (
                            <a
                              href={exp.download_url}
                              download
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary text-foreground text-xs font-semibold hover:bg-primary hover:text-white transition-colors border border-border"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      id="empty-audit-exports"
                      icon={Download}
                      title="Belum Ada Laporan Ter-ekspor"
                      description="Gunakan fitur Ekspor Laporan pada layar hasil untuk mencatat berkas nyata ke audit ledger."
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-surface flex items-center justify-between">
          <span className="text-[11px] text-foreground-secondary">
            Diaudit secara kriptografis dan terhubung langsung ke Audit Ledger Supabase.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-secondary text-foreground hover:bg-surface-secondary/80 border border-border transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
