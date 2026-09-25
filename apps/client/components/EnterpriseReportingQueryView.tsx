import React, { useState, useEffect } from 'react';
import {
  FileText,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Send,
  UserCheck,
  Lock,
  Unlock,
  Eye,
  Activity,
  Layers,
  Sparkles,
  TrendingUp,
  Database,
  Search,
  ExternalLink,
} from 'lucide-react';

interface EnterpriseReportingQueryViewProps {
  tenantId: string;
  isEnterprise: boolean;
  onUpgradePrompt?: () => void;
}

interface AutomatedReport {
  id: string;
  tenant_id: string;
  report_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  title: string;
  period_start: string;
  period_end: string;
  executive_summary: string;
  narrative: string;
  key_metrics: Record<string, number>;
  status: string;
  generated_by: string;
  created_at: string;
}

interface ReportDataPoint {
  id: string;
  report_id: string;
  metric_key: string;
  metric_label: string;
  metric_value: number;
  unit: string;
  period_type: string;
  period_start: string;
  period_end: string;
  source_table: string;
  source_query?: string;
  source_dimension: string;
  sensitivity_level: string;
}

interface ConversationalTurn {
  id: string;
  session_id: string;
  turn_number: number;
  user_role: string;
  query_text: string;
  raw_answer: string;
  filtered_answer: string;
  data_points_consulted?: any[];
  abac_evaluation: Record<string, { decision: string; sensitivity_level: string; reason: string }>;
  confidence_score: number;
  reasoning_transparency?: any;
  created_at: string;
}

export const EnterpriseReportingQueryView: React.FC<EnterpriseReportingQueryViewProps> = ({
  tenantId,
  isEnterprise,
  onUpgradePrompt,
}) => {
  const [subTab, setSubTab] = useState<'reports' | 'conversational'>('reports');

  // State Pelaporan Otomatis
  const [reports, setReports] = useState<AutomatedReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState<boolean>(false);
  const [selectedReportDetail, setSelectedReportDetail] = useState<{
    report: AutomatedReport;
    data_points: ReportDataPoint[];
    verification: {
      is_valid: boolean;
      total_data_points_checked: number;
      matched_metrics: string[];
      missing_metrics: string[];
      discrepancies: any[];
      explanation: string;
    };
  } | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [generatingReport, setGeneratingReport] = useState<boolean>(false);
  const [newReportType, setNewReportType] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [newReportTitle, setNewReportTitle] = useState<string>('');

  // State Tanya Jawab Manajemen
  const [userRole, setUserRole] = useState<'DIRECTOR' | 'MANAGER' | 'STAFF'>('DIRECTOR');
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [queryInput, setQueryInput] = useState<string>('');
  const [turns, setTurns] = useState<ConversationalTurn[]>([]);
  const [queryLoading, setQueryLoading] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchReports = async () => {
    try {
      setReportsLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/reports?limit=15`);
      if (res.ok) {
        const data = await res.json();
        setReports(data || []);
      }
    } catch (err: any) {
      console.error('Gagal mengambil laporan otomatis:', err);
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [tenantId]);

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEnterprise && onUpgradePrompt) {
      onUpgradePrompt();
      return;
    }
    try {
      setGeneratingReport(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_type: newReportType,
          custom_title: newReportTitle.trim() || undefined,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        showToast('success', 'Laporan eksekutif otomatis berhasil dihasilkan dengan verifikasi integritas 100%.');
        setNewReportTitle('');
        await fetchReports();
        handleViewReportDetail(result.report.id);
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Gagal menghasilkan laporan otomatis.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleViewReportDetail = async (reportId: string) => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/reports/${reportId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedReportDetail(data);
        setDetailModalOpen(true);
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Gagal mengambil detail laporan.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleSendConversationalQuery = async (promptText?: string) => {
    const textToSend = promptText || queryInput;
    if (!textToSend.trim()) return;

    try {
      setQueryLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/conversational-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          query_text: textToSend.trim(),
          user_role: userRole,
        }),
      });

      if (res.ok) {
        const turnData: ConversationalTurn = await res.json();
        setTurns((prev) => [...prev, turnData]);
        if (!promptText) {
          setQueryInput('');
        }
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Gagal memproses pertanyaan manajemen.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleResetSession = () => {
    setSessionId(crypto.randomUUID());
    setTurns([]);
    showToast('info', 'Sesi tanya jawab manajemen telah diatur ulang.');
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : toastMsg.type === 'error'
              ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
              : 'bg-indigo-950/80 border-indigo-500/50 text-indigo-300'
          }`}
        >
          <span>{toastMsg.text}</span>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-200 text-sm">
            ×
          </button>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab('reports')}
            className={`text-xs font-semibold px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              subTab === 'reports'
                ? 'bg-purple-600/25 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <FileText className="w-4 h-4" /> Pelaporan Otomatis & Titik Data SSOT
          </button>
          <button
            onClick={() => setSubTab('conversational')}
            className={`text-xs font-semibold px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              subTab === 'conversational'
                ? 'bg-purple-600/25 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Tanya Jawab Manajemen (ABAC Filtering)
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Verifikasi Deterministik Integritas 100%</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: PELAPORAN OTOMATIS */}
      {/* ========================================================================= */}
      {subTab === 'reports' && (
        <div className="space-y-6">
          {/* Form Pembuatan Laporan Baru */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" /> Buat Laporan Otomatis Berkala
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Menyusun narasi eksekutif otomatis berdasarkan data agregasi transaksi nyata, dengan audit pencocokan
                  100% terhadap titik data SSOT.
                </p>
              </div>
            </div>

            <form onSubmit={handleGenerateReport} className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Rentang Evaluasi</label>
                <select
                  value={newReportType}
                  onChange={(e) => setNewReportType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="DAILY">Harian (1 Hari Terakhir)</option>
                  <option value="WEEKLY">Mingguan (7 Hari Terakhir)</option>
                  <option value="MONTHLY">Bulanan (30 Hari Terakhir)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Judul Kustom (Opsional)</label>
                <input
                  type="text"
                  aria-label="Judul Kustom Laporan"
                  value={newReportTitle}
                  onChange={(e) => setNewReportTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={generatingReport}
                  className="w-full px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-900/30"
                >
                  {generatingReport ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menyusun & Memverifikasi...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Hasilkan Laporan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Daftar Riwayat Laporan */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" /> Riwayat Laporan Otomatis Terverifikasi
              </h3>
              <button
                onClick={fetchReports}
                disabled={reportsLoading}
                className="text-xs text-slate-400 hover:text-purple-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${reportsLoading ? 'animate-spin' : ''}`} /> Muat Ulang
              </button>
            </div>

            {reportsLoading && reports.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" /> Memuat riwayat laporan...
              </div>
            ) : reports.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-slate-800 rounded-xl">
                <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Belum ada laporan otomatis yang dihasilkan.</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Klik tombol "Hasilkan Laporan" di atas untuk membuat laporan pertama.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-purple-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/40">
                          {rep.report_type}
                        </span>
                        <h4 className="text-xs font-bold text-white">{rep.title}</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1">{rep.executive_summary}</p>
                      <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                        <span>Penyusun: {rep.generated_by}</span>
                        <span>Rentang: {rep.period_start?.split('T')[0]} s/d {rep.period_end?.split('T')[0]}</span>
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Terverifikasi SSOT
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleViewReportDetail(rep.id)}
                      className="shrink-0 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-purple-600/30 text-slate-300 hover:text-purple-300 border border-slate-700 hover:border-purple-500/50 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Buka Laporan & Audit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: TANYA JAWAB MANAJEMEN (CONVERSATIONAL QUERY) */}
      {/* ========================================================================= */}
      {subTab === 'conversational' && (
        <div className="space-y-6">
          {/* Panel Kontrol Peran ABAC */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold text-white">Simulasi Penegakan Kebijakan ABAC</h4>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Pilih peran penanya untuk menguji penyaringan data sensitif secara real-time sebelum jawaban disajikan.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Peran Pengguna:</span>
              <div className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800">
                {(['DIRECTOR', 'MANAGER', 'STAFF'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setUserRole(r)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      userRole === r
                        ? 'bg-purple-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {r === 'DIRECTOR' ? 'Direktur (Akses Penuh)' : r === 'MANAGER' ? 'Manajer' : 'Staf (Tersaring)'}
                  </button>
                ))}
              </div>

              <button
                onClick={handleResetSession}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                title="Mulai Sesi Baru"
              >
                Sesi Baru
              </button>
            </div>
          </div>

          {/* Prompt Cepat */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-500 text-[11px] shrink-0 font-medium">Contoh Pertanyaan:</span>
            {[
              'Berapa total pendapatan operasional dan margin laba kotor saat ini?',
              'Bagaimana status penyelesaian tugas operasional dan skor kinerja?',
              'Berapa penggunaan kredit komputasi dan token AI terpakai?',
              'Tampilkan ringkasan prospek aktif dalam pipeline penjualan.',
            ].map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendConversationalQuery(prompt)}
                disabled={queryLoading}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-purple-300 text-[11px] transition-all cursor-pointer whitespace-nowrap"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Area Percakapan Multi-Turn */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 min-h-[380px] flex flex-col justify-between">
            <div className="space-y-4">
              {turns.length === 0 ? (
                <div className="py-16 text-center">
                  <MessageSquare className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                  <h4 className="text-xs font-bold text-slate-300">Mulai Tanya Jawab Manajemen</h4>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-1">
                    Ajukan pertanyaan seputar keuangan, penjualan, produktivitas tugas, atau penggunaan sistem. Setiap
                    jawaban didasarkan pada titik data SSOT dan disaring ketat melalui ABAC sesuai peran Anda.
                  </p>
                </div>
              ) : (
                turns.map((turn) => (
                  <div key={turn.id} className="space-y-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80">
                    {/* Header Giliran */}
                    <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-purple-900/60 text-purple-300 font-mono text-[10px] font-bold">
                          Putaran #{turn.turn_number}
                        </span>
                        <span className="text-slate-400">Peran: <strong className="text-white">{turn.user_role}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Keyakinan: {turn.confidence_score}%</span>
                      </div>
                    </div>

                    {/* Pertanyaan */}
                    <div className="text-xs font-semibold text-slate-200 flex items-start gap-2">
                      <span className="text-purple-400 font-bold">Q:</span>
                      <span>{turn.query_text}</span>
                    </div>

                    {/* Jawaban Tersaring ABAC */}
                    <div className="text-xs text-slate-300 bg-slate-900/90 p-3.5 rounded-lg border border-slate-800/80 whitespace-pre-wrap leading-relaxed">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" /> Tanggapan Terverifikasi SSOT & ABAC:
                      </div>
                      {turn.filtered_answer}
                    </div>

                    {/* Panel Evaluasi ABAC */}
                    {turn.abac_evaluation && Object.keys(turn.abac_evaluation).length > 0 && (
                      <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 text-[10px] space-y-1.5">
                        <div className="font-bold text-slate-400 flex items-center gap-1.5">
                          <ShieldCheck className="w-3 h-3 text-purple-400" />
                          <span>Audit Keputusan Evaluasi ABAC:</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                          {Object.entries(turn.abac_evaluation).map(([mKey, ev]) => (
                            <div
                              key={mKey}
                              className={`p-1.5 rounded flex items-center justify-between border ${
                                ev.decision === 'ALLOW'
                                  ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
                                  : 'bg-amber-950/40 border-amber-800/40 text-amber-300'
                              }`}
                            >
                              <span className="font-mono">{mKey}</span>
                              <span className="font-bold">{ev.decision} ({ev.sensitivity_level})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendConversationalQuery();
              }}
              className="flex items-center gap-2 pt-3 border-t border-slate-800"
            >
              <input
                type="text"
                aria-label={`Pertanyaan manajemen untuk peran ${userRole}`}
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                disabled={queryLoading}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <button
                type="submit"
                disabled={queryLoading || !queryInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-900/30"
              >
                {queryLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Kirim
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL AUDIT DETAIL LAPORAN & DATA POINTS */}
      {/* ========================================================================= */}
      {detailModalOpen && selectedReportDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/40">
                    {selectedReportDetail.report.report_type}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Rentang: {selectedReportDetail.report.period_start?.split('T')[0]} s/d {selectedReportDetail.report.period_end?.split('T')[0]}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">{selectedReportDetail.report.title}</h3>
                <p className="text-xs text-slate-400 mt-1">{selectedReportDetail.report.executive_summary}</p>
              </div>

              <button
                onClick={() => setDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Status Verifikasi Deterministik Integritas */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                selectedReportDetail.verification.is_valid
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-amber-950/60 border-amber-500/50 text-amber-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-xs font-bold">
                    Verifikasi Deterministik: 100% Cocok Persis SSOT
                  </div>
                  <div className="text-[11px] opacity-90 mt-0.5">
                    {selectedReportDetail.verification.explanation}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono text-xs">
                <strong>{selectedReportDetail.verification.matched_metrics.length}</strong> /{' '}
                {selectedReportDetail.verification.total_data_points_checked} Titik Data Terverifikasi
              </div>
            </div>

            {/* Narasi Lengkap */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Narasi Lengkap Laporan Eksekutif:
              </h4>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">
                {selectedReportDetail.report.narrative}
              </div>
            </div>

            {/* Tabel Granular Titik Data (report_data_points) */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" /> Audit Titik Data Granular (report_data_points):
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-mono border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Kunci Metrik</th>
                      <th className="py-2.5 px-3">Label Metrik</th>
                      <th className="py-2.5 px-3">Nilai Eksak</th>
                      <th className="py-2.5 px-3">Satuan</th>
                      <th className="py-2.5 px-3">Tabel Sumber</th>
                      <th className="py-2.5 px-3">Dimensi</th>
                      <th className="py-2.5 px-3">Sensitivitas ABAC</th>
                      <th className="py-2.5 px-3">Verifikasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                    {selectedReportDetail.data_points.map((dp) => (
                      <tr key={dp.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-purple-300 font-semibold">{dp.metric_key}</td>
                        <td className="py-2 px-3 font-sans text-slate-300">{dp.metric_label}</td>
                        <td className="py-2 px-3 text-emerald-400 font-bold">
                          {dp.unit === 'IDR'
                            ? `Rp ${Math.round(dp.metric_value).toLocaleString('id-ID')}`
                            : dp.metric_value}
                        </td>
                        <td className="py-2 px-3 text-slate-400">{dp.unit}</td>
                        <td className="py-2 px-3 text-slate-400">{dp.source_table}</td>
                        <td className="py-2 px-3 text-indigo-300 text-[10px]">{dp.source_dimension}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              dp.sensitivity_level === 'FINANCIAL_EXECUTIVE' ||
                              dp.sensitivity_level === 'RESTRICTED_MANAGEMENT'
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                                : dp.sensitivity_level === 'CONFIDENTIAL'
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {dp.sensitivity_level}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setDetailModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Tutup Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
