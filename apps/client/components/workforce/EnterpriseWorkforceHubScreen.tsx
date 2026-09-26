import React, { useState, useEffect } from 'react';
import { TenantRegistrationResponse } from '../../types';
import {
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  UserCheck,
  Check,
  X,
  FileText,
  Layers,
} from 'lucide-react';

interface SkillTrend {
  skill_key: string;
  skill_name: string;
  confidence_score: number;
  current_confidence: number;
  total_invocations: number;
  successful_invocations: number;
  failed_invocations: number;
  success_rate_pct: number;
  trend_direction: 'STABLE' | 'IMPROVING' | 'DEGRADING';
  decay_applied: boolean;
  last_calculated_at?: string;
  historical_origin?: string;
}

interface SpecialistInsight {
  domain: string;
  specialist_name: string;
  focus_area: string;
  diagnostic_summary: string;
  health_score: number;
  health_status: string;
  identified_risks: string[];
  strategic_guidance: string;
}

interface ActionProposal {
  id: string;
  title: string;
  target_domain: string;
  action_type: string;
  description: string;
  rationale: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  requires_human_approval: boolean;
  approval_status: 'PENDING_HUMAN_APPROVAL' | 'HUMAN_APPROVED' | 'HUMAN_REJECTED';
  execution_mode: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
}

interface BriefingRecord {
  id: string;
  tenant_id: string;
  briefing_date: string;
  executive_summary: string;
  department_highlights: any[];
  kpi_snapshot: Record<string, any>;
  specialist_insights: SpecialistInsight[];
  skill_confidence_trends: SkillTrend[];
  action_items: ActionProposal[];
  authority_boundary_enforced: boolean;
  requires_human_approval: boolean;
  generated_by: string;
  created_at: string;
  sent_via_proactive?: boolean;
  proactive_channels?: string[];
}

interface EnterpriseWorkforceHubScreenProps {
  tenant?: TenantRegistrationResponse | null;
  tenantId?: string;
  tenantDisplayName?: string;
  onBack?: () => void;
  isEnterpriseTier?: boolean;
}

export const EnterpriseWorkforceHubScreen: React.FC<EnterpriseWorkforceHubScreenProps> = ({
  tenant,
  tenantId: propTenantId,
  tenantDisplayName: propTenantDisplayName,
  onBack,
  isEnterpriseTier = true,
}) => {
  const tenantId = tenant?.tenant_id || propTenantId || 'd1159d6d-0044-42ea-8007-d549a0011402';
  const tenantDisplayName = tenant?.display_name || tenant?.legal_name || propTenantDisplayName || 'Organisasi Enterprise';
  const [briefings, setBriefings] = useState<BriefingRecord[]>([]);
  const [selectedBriefing, setSelectedBriefing] = useState<BriefingRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [approvingActionId, setApprovingActionId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [activeSubView, setActiveSubView] = useState<'briefing' | 'skills' | 'specialists' | 'governance'>('briefing');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [readOnlyMode, setReadOnlyMode] = useState<boolean>(!isEnterpriseTier);

  // Load Briefings from Backend
  const loadBriefings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/briefings`);
      if (res.ok) {
        const data = await res.json();
        const list: BriefingRecord[] = (data.briefings || []).map((b: any) => ({
          ...b,
          specialist_insights: Array.isArray(b.specialist_insights)
            ? b.specialist_insights
            : typeof b.specialist_insights === 'string'
            ? JSON.parse(b.specialist_insights)
            : [],
          skill_confidence_trends: Array.isArray(b.skill_confidence_trends)
            ? b.skill_confidence_trends
            : typeof b.skill_confidence_trends === 'string'
            ? JSON.parse(b.skill_confidence_trends)
            : [],
          action_items: Array.isArray(b.action_items)
            ? b.action_items
            : typeof b.action_items === 'string'
            ? JSON.parse(b.action_items)
            : [],
          department_highlights: Array.isArray(b.department_highlights)
            ? b.department_highlights
            : typeof b.department_highlights === 'string'
            ? JSON.parse(b.department_highlights)
            : [],
          kpi_snapshot: typeof b.kpi_snapshot === 'object' ? b.kpi_snapshot : {},
        }));
        setBriefings(list);
        if (list.length > 0) {
          setSelectedBriefing(list[0]);
        }
        setReadOnlyMode(Boolean(data.read_only_history));
      }
    } catch (err: any) {
      console.error('Gagal memuat briefing eksekutif:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBriefings();
  }, [tenantId]);

  // Generate Fresh Morning Briefing
  const handleGenerateBriefing = async () => {
    try {
      setGenerating(true);
      setToastMessage(null);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefing_date: new Date().toISOString().split('T')[0] }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Gagal mensintesis morning briefing');
      }

      setToastMessage({
        type: 'success',
        text: 'Morning Briefing eksekutif berhasil disintesis dengan data keahlian dan wawasan spesialis terbaru.',
      });
      await loadBriefings();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: err.message || 'Terjadi kesalahan saat mensintesis briefing.',
      });
    } finally {
      setGenerating(false);
    }
  };

  // Handle Human Approval of Action Item
  const handleActionApproval = async (actionId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedBriefing) return;
    try {
      setApprovingActionId(actionId);
      const notes = reviewNotes[actionId] || '';
      const res = await fetch(
        `/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/briefings/${selectedBriefing.id}/actions/${actionId}/approval`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            approved_by: tenantDisplayName,
            review_notes: notes,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Gagal memproses persetujuan');
      }

      const updatedActions = selectedBriefing.action_items.map((a) => {
        if (a.id === actionId) {
          return {
            ...a,
            approval_status: decision === 'APPROVED' ? ('HUMAN_APPROVED' as const) : ('HUMAN_REJECTED' as const),
            reviewed_by: tenantDisplayName,
            reviewed_at: new Date().toISOString(),
            review_notes: notes,
          };
        }
        return a;
      });

      setSelectedBriefing({
        ...selectedBriefing,
        action_items: updatedActions,
      });

      setToastMessage({
        type: 'success',
        text: `Usulan aksi berhasil ditandai sebagai ${decision === 'APPROVED' ? 'Disetujui' : 'Ditolak'}.`,
      });
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: err.message || 'Gagal menyimpan persetujuan aksi.',
      });
    } finally {
      setApprovingActionId(null);
    }
  };

  const currentSkills = selectedBriefing?.skill_confidence_trends || [];
  const currentSpecialists = selectedBriefing?.specialist_insights || [];
  const currentActions = selectedBriefing?.action_items || [];
  const currentDept = selectedBriefing?.department_highlights || [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg border max-w-md text-sm transition-all duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
              : toastMessage.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
              : 'bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-100'
          }`}
        >
          <div className="flex items-start gap-3">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            ) : toastMessage.type === 'error' ? (
              <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className="font-medium">{toastMessage.text}</p>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header Command Center */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>Enterprise Command Center</span>
                <span aria-hidden="true">·</span>
                <span>Tata Kelola Eksekutif</span>
                <span aria-hidden="true">·</span>
                <span>Otoritas Koordinasi Murni</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                <span>Enterprise Workforce Hub</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  Arya (AI Chief of Staff)
                </span>
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 transition"
                >
                  Kembali
                </button>
              )}
              <button
                onClick={handleGenerateBriefing}
                disabled={generating || readOnlyMode}
                className={`px-4 py-2 text-xs font-medium rounded transition flex items-center gap-2 ${
                  generating || readOnlyMode
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                <span>{generating ? 'Mensintesis...' : 'Sintesis Morning Briefing'}</span>
              </button>
            </div>
          </div>

          {/* Sub-Navigation Tabs */}
          <div className="flex items-center gap-1 mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 overflow-x-auto text-xs font-medium">
            <button
              onClick={() => setActiveSubView('briefing')}
              className={`px-3 py-1.5 rounded transition ${
                activeSubView === 'briefing'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Morning Briefing & Aksi
            </button>
            <button
              onClick={() => setActiveSubView('skills')}
              className={`px-3 py-1.5 rounded transition flex items-center gap-1.5 ${
                activeSubView === 'skills'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Matriks Keahlian Terlacak</span>
              <span className="text-[10px] opacity-75">({currentSkills.length})</span>
            </button>
            <button
              onClick={() => setActiveSubView('specialists')}
              className={`px-3 py-1.5 rounded transition flex items-center gap-1.5 ${
                activeSubView === 'specialists'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Wawasan Spesialis Domain</span>
              <span className="text-[10px] opacity-75">({currentSpecialists.length})</span>
            </button>
            <button
              onClick={() => setActiveSubView('governance')}
              className={`px-3 py-1.5 rounded transition ${
                activeSubView === 'governance'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Batasan Otoritas & Tata Kelola
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Governance Guard Notice Banner */}
        <div className="bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Batasan Otoritas Terpelihara:
                </span>{' '}
                <span className="text-slate-600 dark:text-slate-400">
                  Arya (AI Chief of Staff) beroperasi murni sebagai koordinator & sintesis. Seluruh usulan tindakan wajib melalui persetujuan manusia sebelum dieksekusi.
                </span>
              </div>
            </div>
            <div className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
              <span>Akses Data: Agregat Departemen</span>
              <span aria-hidden="true" className="mx-2">·</span>
              <span>Audit Log: Aktif</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
            <p className="text-xs">Memuat data Command Center eksekutif...</p>
          </div>
        ) : (
          <>
            {/* VIEW 1: MORNING BRIEFING & ACTION ITEMS */}
            {activeSubView === 'briefing' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {selectedBriefing ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            <span>Siklus Operasional: {selectedBriefing.briefing_date}</span>
                            <span aria-hidden="true" className="mx-2">·</span>
                            <span>Penyusun: {selectedBriefing.generated_by}</span>
                          </div>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                            Executive Morning Briefing
                          </h2>
                        </div>
                        <div className="flex items-center gap-3">
                          {selectedBriefing.sent_via_proactive && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Juga terkirim via WhatsApp/Telegram
                            </span>
                          )}
                          <div className="text-xs text-slate-500">
                            {new Date(selectedBriefing.created_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            WIB
                          </div>
                        </div>
                      </div>

                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {selectedBriefing.executive_summary}
                        </p>
                      </div>

                      {currentDept.length > 0 && (
                        <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                            Sorotan Performa Lintas Departemen
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {currentDept.map((dept: any, idx: number) => (
                              <div
                                key={idx}
                                className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-800"
                              >
                                <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                                  {dept.department}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Lead: {dept.lead}
                                </div>
                                <div className="text-xs font-semibold text-slate-900 dark:text-white mt-2">
                                  KPI: {dept.kpi_score}
                                </div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                  {dept.key_update}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                      <FileText className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Belum ada morning briefing yang terdata untuk organisasi ini.
                      </p>
                      <button
                        onClick={handleGenerateBriefing}
                        className="mt-3 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
                      >
                        Sintesis Briefing Sekarang
                      </button>
                    </div>
                  )}

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Usulan Tindakan Strategis & Titik Persetujuan Manusia
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Setiap usulan rekomendasi berada dalam status koordinasi dan menunggu keputusan pimpinan manusia.
                        </p>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {currentActions.filter((a) => a.approval_status === 'HUMAN_APPROVED').length} /{' '}
                        {currentActions.length} Disetujui
                      </div>
                    </div>

                    {currentActions.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">
                        Tidak ada usulan tindakan tertunda pada siklus ini.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {currentActions.map((action) => {
                          const isApproved = action.approval_status === 'HUMAN_APPROVED';
                          const isRejected = action.approval_status === 'HUMAN_REJECTED';
                          const isPending = action.approval_status === 'PENDING_HUMAN_APPROVAL';

                          return (
                            <div
                              key={action.id}
                              className={`p-4 rounded-lg border transition ${
                                isApproved
                                  ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                                  : isRejected
                                  ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
                                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                <div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                                    <span>Domain: {action.target_domain}</span>
                                    <span aria-hidden="true" className="mx-2">·</span>
                                    <span>Tipe: {action.action_type}</span>
                                    <span aria-hidden="true" className="mx-2">·</span>
                                    <span>Risiko: {action.risk_level}</span>
                                  </div>
                                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {action.title}
                                  </h4>
                                </div>

                                <div className="text-xs">
                                  {isApproved && (
                                    <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Disetujui Manusia
                                    </span>
                                  )}
                                  {isRejected && (
                                    <span className="text-rose-700 dark:text-rose-400 font-medium flex items-center gap-1">
                                      <XCircle className="w-3.5 h-3.5" />
                                      Ditolak
                                    </span>
                                  )}
                                  {isPending && (
                                    <span className="text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5" />
                                      Menunggu Persetujuan
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
                                {action.description}
                              </p>

                              <div className="text-[11px] text-slate-500 mt-1 italic">
                                Rasional: {action.rationale}
                              </div>

                              {(isApproved || isRejected) && action.reviewed_by && (
                                <div className="mt-2 text-[11px] text-slate-500 border-t border-slate-200 dark:border-slate-700/60 pt-1.5 flex items-center justify-between">
                                  <span>Ditinjau oleh: {action.reviewed_by}</span>
                                  {action.review_notes && <span>Catatan: {action.review_notes}</span>}
                                </div>
                              )}

                              {isPending && (
                                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <input
                                    type="text"
                                    aria-label="Catatan peninjau (opsional)"
                                    value={reviewNotes[action.id] || ''}
                                    onChange={(e) =>
                                      setReviewNotes({ ...reviewNotes, [action.id]: e.target.value })
                                    }
                                    className="text-xs px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex-1 max-w-sm"
                                  />

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleActionApproval(action.id, 'REJECTED')}
                                      disabled={approvingActionId === action.id}
                                      className="px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 rounded transition flex items-center gap-1"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      Tolak
                                    </button>
                                    <button
                                      onClick={() => handleActionApproval(action.id, 'APPROVED')}
                                      disabled={approvingActionId === action.id}
                                      className="px-3 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded transition flex items-center gap-1 font-medium shadow-sm"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Setujui Tindakan
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Metrik Eksekutif Agregat
                    </h3>

                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">Kesehatan Operasional</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {selectedBriefing?.kpi_snapshot?.overall_health || '95.5'}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">Tenaga Kerja Struktural Aktif</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {selectedBriefing?.kpi_snapshot?.active_workforces || '14'} Agen
                        </span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">Kepatuhan SLA Eksekusi</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {selectedBriefing?.kpi_snapshot?.sla_compliance || '99.4%'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">Rata-rata Skor Keahlian</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {selectedBriefing?.kpi_snapshot?.avg_skill_confidence || '88.6%'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Status Otoritas Mandat</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          Koordinasi Murni
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Arsip Morning Briefing
                      </h3>
                      <span className="text-[11px] text-slate-400 font-mono">{briefings.length} tercatat</span>
                    </div>

                    {briefings.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">Belum ada riwayat briefing.</p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {briefings.map((b) => {
                          const isSelected = selectedBriefing?.id === b.id;
                          return (
                            <button
                              key={b.id}
                              onClick={() => setSelectedBriefing(b)}
                              className={`w-full text-left p-2.5 rounded text-xs transition border ${
                                isSelected
                                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 font-medium'
                                  : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {b.briefing_date}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {b.action_items?.length || 0} Aksi
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                                {b.executive_summary}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: SKILLS */}
            {activeSubView === 'skills' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                        Matriks Tren Keahlian Tenaga Kerja AI (Riwayat Nyata Sejak Pembelajaran Berkelanjutan)
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Menampilkan evaluasi berkelanjutan atas invocation volume, tingkat keberhasilan, dan degradasi waktu.
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      Total Keahlian Terlacak: {currentSkills.length}
                    </div>
                  </div>

                  {currentSkills.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">
                      Belum ada data riwayat keahlian yang disintesis dalam briefing ini.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                            <th className="py-2.5 px-3 font-semibold">Nama Keahlian & Kunci</th>
                            <th className="py-2.5 px-3 font-semibold">Skor Awal</th>
                            <th className="py-2.5 px-3 font-semibold">Skor Saat Ini</th>
                            <th className="py-2.5 px-3 font-semibold">Arah Tren</th>
                            <th className="py-2.5 px-3 font-semibold">Total Pemanggilan</th>
                            <th className="py-2.5 px-3 font-semibold">Tingkat Keberhasilan</th>
                            <th className="py-2.5 px-3 font-semibold">Status Decay</th>
                            <th className="py-2.5 px-3 font-semibold">Kalkulasi Terakhir</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {currentSkills.map((skill, idx) => {
                            const isDegrading = skill.trend_direction === 'DEGRADING';
                            const isImproving = skill.trend_direction === 'IMPROVING';

                            return (
                              <tr
                                key={idx}
                                className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition ${
                                  isDegrading ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                                }`}
                              >
                                <td className="py-3 px-3">
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {skill.skill_name}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {skill.skill_key}
                                  </div>
                                </td>
                                <td className="py-3 px-3 font-mono">
                                  {Math.round(skill.confidence_score * 100)}%
                                </td>
                                <td className="py-3 px-3 font-mono font-semibold">
                                  <span
                                    className={
                                      isDegrading
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : isImproving
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-slate-800 dark:text-slate-200'
                                    }
                                  >
                                    {Math.round(skill.current_confidence * 100)}%
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  {isDegrading ? (
                                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                                      <TrendingDown className="w-3.5 h-3.5" />
                                      Degradasi
                                    </span>
                                  ) : isImproving ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                                      <TrendingUp className="w-3.5 h-3.5" />
                                      Meningkat
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 flex items-center gap-1">
                                      Stabil
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 font-mono">
                                  <span>{skill.total_invocations}</span>{' '}
                                  <span className="text-[10px] text-slate-400">
                                    ({skill.successful_invocations} sukses / {skill.failed_invocations} gagal)
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-mono">
                                  <span
                                    className={
                                      skill.success_rate_pct < 70
                                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                        : 'text-slate-700 dark:text-slate-300'
                                    }
                                  >
                                    {skill.success_rate_pct}%
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-[11px]">
                                  {skill.decay_applied ? (
                                    <span className="text-amber-600 dark:text-amber-400">Aktif (Waktu)</span>
                                  ) : (
                                    <span className="text-slate-400">Nominal</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                                  {skill.last_calculated_at
                                    ? new Date(skill.last_calculated_at).toLocaleDateString('id-ID', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VIEW 3: SPECIALISTS */}
            {activeSubView === 'specialists' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {currentSpecialists.length === 0 ? (
                  <div className="col-span-2 p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
                    Belum ada data wawasan spesialis domain yang tercatat.
                  </div>
                ) : (
                  currentSpecialists.map((spec, idx) => (
                    <div
                      key={idx}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4"
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">Domain: {spec.domain}</div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {spec.specialist_name}
                          </h3>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white font-mono">
                            {spec.health_score}%
                          </div>
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            {spec.health_status}
                          </div>
                        </div>
                      </div>

                      <div className="text-xs space-y-2">
                        <div>
                          <span className="text-slate-500">Fokus Strategis:</span>{' '}
                          <span className="text-slate-800 dark:text-slate-200 font-medium">
                            {spec.focus_area}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          {spec.diagnostic_summary}
                        </p>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded text-xs space-y-1 border border-slate-100 dark:border-slate-800">
                        <div className="text-slate-500 font-medium text-[11px]">Panduan Strategis Eksekutif:</div>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                          {spec.strategic_guidance}
                        </p>
                      </div>

                      {spec.identified_risks && spec.identified_risks.length > 0 && (
                        <div className="space-y-1 text-xs">
                          <div className="text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                            Faktor Risiko Terdeteksi:
                          </div>
                          <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-0.5">
                            {spec.identified_risks.map((r, rIdx) => (
                              <li key={rIdx}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* VIEW 4: GOVERNANCE */}
            {activeSubView === 'governance' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Kerangka Tata Kelola & Batasan Otoritas AI Chief of Staff
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Pedoman kepatuhan dan batas kewenangan operasional AI Chief of Staff di tingkat korporat.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Otoritas Koordinasi Murni
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Arya TIDAK memiliki izin untuk mengeksekusi transaksi keuangan, mengubah kode sistem produksi, atau meluncurkan integrasi tanpa mandat formal.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      Persetujuan Manusia Wajib
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Setiap eskalasi intervensi model, perubahan kuota anggaran kredit, atau investigasi insiden tetap berstatus tertunda hingga divalidasi oleh pimpinan manusia.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                      <Layers className="w-4 h-4 text-blue-600" />
                      Agregasi Data Karyawan
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Sintesis hanya mengonsumsi metrik agregat departemen dan riwayat performa keahlian agen; tidak pernah memproses log percakapan privat personal staf.
                    </p>
                  </div>
                </div>

                <div className="text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span>Penegekan Skema Database: chief_of_staff_briefings · RLS Terisolasi Multi-Tenant</span>
                  <span className="font-mono">Versi Regulasi: Enterprise Compliance Standards</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
