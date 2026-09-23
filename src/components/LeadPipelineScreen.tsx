'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Flame,
  ThermometerSnowflake,
  SunMedium,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building,
  User,
  Phone,
  Mail,
  DollarSign,
  History,
  Sparkles,
  RefreshCw,
  Sliders,
  ChevronRight,
  X,
  Target,
  FileText,
  Activity,
} from 'lucide-react';

export interface Lead {
  id: string;
  title: string;
  company_name?: string | null;
  contact_name: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  stage: string;
  funnel_stage: string;
  lead_score: number;
  temperature: 'COLD' | 'WARM' | 'HOT';
  deal_value: number;
  source: string;
  channel_type: string;
  assigned_agent_name?: string | null;
  last_activity_at: string;
  created_at: string;
}

export interface PipelineStage {
  stage: string;
  total_leads: number;
  total_deal_value: number;
  leads: Lead[];
}

export interface LeadDetailData {
  lead: Lead;
  qualification_answers: Array<{
    id: string;
    question_key: string;
    question_text: string;
    answer_text: string;
    score_weight: number;
    verified: boolean;
    created_at: string;
  }>;
  score_history: Array<{
    id: string;
    previous_score: number;
    new_score: number;
    delta: number;
    trigger_event: string;
    trigger_details: any;
    created_at: string;
  }>;
  score_breakdown: {
    base_score: number;
    qualification_score: number;
    stage_score: number;
    engagement_score: number;
    deal_value_score: number;
    details: Array<{ component: string; points: number; reason: string }>;
  };
}

const STAGE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  NEW: { label: 'Peluang Baru', color: 'border-slate-300 dark:border-slate-700', desc: 'Kontak pertama' },
  CONTACTED: { label: 'Terkontak', color: 'border-blue-400 dark:border-blue-600', desc: 'Respon diterima' },
  QUALIFYING: { label: 'Kualifikasi', color: 'border-amber-400 dark:border-amber-600', desc: 'Evaluasi BANT' },
  QUALIFIED: { label: 'Terkualifikasi', color: 'border-emerald-400 dark:border-emerald-600', desc: 'Kebutuhan jelas' },
  PROPOSAL: { label: 'Penawaran', color: 'border-purple-400 dark:border-purple-600', desc: 'Draft proposal' },
  NEGOTIATION: { label: 'Negosiasi', color: 'border-rose-400 dark:border-rose-600', desc: 'Diskusi komersial' },
  WON: { label: 'Deal Sukses', color: 'border-teal-500 dark:border-teal-600', desc: 'Penjualan berhasil' },
  LOST: { label: 'Gugur', color: 'border-gray-400 dark:border-gray-600', desc: 'Tidak lanjut' },
};

const BANT_QUESTIONS = [
  { key: 'need', label: 'Need (Kebutuhan Bisnis)', prompt: 'Apa tantangan utama bisnis yang ingin diselesaikan dengan AI?' },
  { key: 'budget', label: 'Budget (Alokasi Dana)', prompt: 'Berapa estimasi alokasi anggaran investasi teknologi per kuartal?' },
  { key: 'authority', label: 'Authority (Wewenang)', prompt: 'Siapa pembuat keputusan final untuk implementasi sistem ini?' },
  { key: 'timeline', label: 'Timeline (Target Implementasi)', prompt: 'Kapan solusi diharapkan mulai beroperasi (go-live)?' },
];

export const LeadPipelineScreen: React.FC<{ tenantId: string; onOpenPersonas?: () => void }> = ({
  tenantId,
  onOpenPersonas,
}) => {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState<'qualification' | 'score' | 'timeline'>('qualification');

  // New Lead Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newLeadTitle, setNewLeadTitle] = useState('');
  const [newLeadContact, setNewLeadContact] = useState('');
  const [newLeadCompany, setNewLeadCompany] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadDealValue, setNewLeadDealValue] = useState('15000000');
  const [creatingLead, setCreatingLead] = useState(false);

  // New Qualification Answer Input State
  const [answeringKey, setAnsweringKey] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  // Metrics
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [hotLeadsCount, setHotLeadsCount] = useState(0);
  const [avgScore, setAvgScore] = useState(0);

  const fetchPipeline = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/pipeline`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal memuat pipeline.`);
      const json = await res.json();
      if (json.data) {
        setStages(json.data.stages || []);
        setTotalLeads(json.data.total_leads || 0);
        setTotalValue(json.data.total_pipeline_value || 0);
        setHotLeadsCount(json.data.hot_leads_count || 0);
        setAvgScore(json.data.average_score || 0);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const openLeadDetail = async (leadId: string) => {
    setSelectedLeadId(leadId);
    setLoadingDetail(true);
    try {
      const [detailRes, timelineRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/crm/leads/${leadId}`),
        fetch(`/api/v1/tenants/${tenantId}/crm/leads/${leadId}/timeline`),
      ]);
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        setLeadDetail(detailJson.data);
      }
      if (timelineRes.ok) {
        const timelineJson = await timelineRes.json();
        setTimelineEvents(timelineJson.data || []);
      }
    } catch (err: any) {
      console.error('Error fetching lead detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleStageChange = async (leadId: string, newStage: string) => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.ok) {
        await fetchPipeline();
        if (selectedLeadId === leadId) {
          await openLeadDetail(leadId);
        }
      }
    } catch (err) {
      console.error('Failed to change stage:', err);
    }
  };

  const handleRecordQualification = async (leadId: string, questionKey: string, questionText: string) => {
    if (!answerText.trim()) return;
    setSubmittingAnswer(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/leads/${leadId}/qualification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_key: questionKey,
          question_text: questionText,
          answer_text: answerText,
          score_weight: 12.5,
        }),
      });
      if (res.ok) {
        setAnsweringKey(null);
        setAnswerText('');
        await fetchPipeline();
        await openLeadDetail(leadId);
      }
    } catch (err) {
      console.error('Failed to record qualification:', err);
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleManualRecalculate = async (leadId: string) => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/leads/${leadId}/recalculate`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchPipeline();
        await openLeadDetail(leadId);
      }
    } catch (err) {
      console.error('Recalculate failed:', err);
    }
  };

  const handleCreateLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadTitle || !newLeadContact) return;
    setCreatingLead(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newLeadTitle,
          contact_name: newLeadContact,
          company_name: newLeadCompany || null,
          contact_phone: newLeadPhone || null,
          contact_email: newLeadEmail || null,
          deal_value: parseFloat(newLeadDealValue) || 0,
          channel_type: 'whatsapp',
          source: 'INBOUND_CHAT',
        }),
      });
      if (res.ok) {
        setIsCreateModalOpen(false);
        setNewLeadTitle('');
        setNewLeadContact('');
        setNewLeadCompany('');
        setNewLeadPhone('');
        setNewLeadEmail('');
        await fetchPipeline();
      }
    } catch (err) {
      console.error('Create lead failed:', err);
    } finally {
      setCreatingLead(false);
    }
  };

  const renderTemperatureBadge = (temp: 'COLD' | 'WARM' | 'HOT', score: number) => {
    if (temp === 'HOT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
          <Flame className="w-3 h-3 fill-rose-500 animate-pulse" />
          HOT ({score.toFixed(1)})
        </span>
      );
    }
    if (temp === 'WARM') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
          <SunMedium className="w-3 h-3 text-amber-500" />
          WARM ({score.toFixed(1)})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-500 border border-sky-500/20">
        <ThermometerSnowflake className="w-3 h-3 text-sky-500" />
        COLD ({score.toFixed(1)})
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Metrics Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                Pipeline CRM & Penilaian Lead Dinamis
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kanban 8 Kolom Penjualan terintegrasi Kualifikasi BANT & Dynamic Lead Scoring (0-100).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenPersonas && (
            <button
              onClick={onOpenPersonas}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-500" />
              <span>Aturan Persona AI</span>
            </button>
          )}

          <button
            onClick={fetchPipeline}
            title="Refresh Data Pipeline"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Peluang Baru</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Peluang</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{totalLeads} Lead</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Nilai Pipeline</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            Rp {(totalValue / 1000000).toFixed(1)} Jt
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> Hot Leads
          </span>
          <span className="text-2xl font-black text-rose-500 mt-1 block">{hotLeadsCount} Lead</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Rata-rata Skor</span>
          <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
            {avgScore.toFixed(1)} / 100
          </span>
        </div>
      </div>

      {/* Kanban Board Container */}
      <div className="w-full max-w-full overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {stages.map((col) => {
            const cfg = STAGE_LABELS[col.stage] || { label: col.stage, color: 'border-slate-300', desc: '' };
            return (
              <div
                key={col.stage}
                className="w-72 shrink-0 flex flex-col bg-slate-100/80 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-3"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full border ${cfg.color} bg-current`} />
                      {cfg.label}
                    </h3>
                    <span className="text-[10px] text-slate-400">{cfg.desc}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {col.total_leads}
                    </span>
                  </div>
                </div>

                {/* Deal Value Sum */}
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-3">
                  Rp {(col.total_deal_value / 1000000).toFixed(1)} Jt
                </div>

                {/* Lead Cards List */}
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[620px] pr-1">
                  {col.leads.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-slate-400 italic border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      Kosong
                    </div>
                  ) : (
                    col.leads.map((lead) => (
                      <div
                        key={lead.id}
                        onClick={() => openLeadDetail(lead.id)}
                        className={`p-3.5 rounded-xl bg-white dark:bg-slate-800/90 border transition-all cursor-pointer hover:shadow-md hover:border-emerald-500/50 ${
                          selectedLeadId === lead.id
                            ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 dark:border-slate-700/60'
                        }`}
                      >
                        {/* Title & Score */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2">
                            {lead.title}
                          </h4>
                          {renderTemperatureBadge(lead.temperature, lead.lead_score)}
                        </div>

                        {/* Company & Contact */}
                        <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                          {lead.company_name && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Building className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{lead.company_name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{lead.contact_name}</span>
                          </div>
                        </div>

                        {/* Deal Value & Funnel Stage */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            Rp {(lead.deal_value / 1000000).toFixed(1)} Jt
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                            {lead.funnel_stage}
                          </span>
                        </div>

                        {/* Assigned Persona */}
                        {lead.assigned_agent_name && (
                          <div className="mt-2 text-[10px] text-indigo-500 font-medium flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Persona: {lead.assigned_agent_name}</span>
                          </div>
                        )}

                        {/* Fast Action Stage Buttons */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Pindah Kolom:</span>
                          <div className="flex items-center gap-1">
                            {col.stage !== 'WON' && col.stage !== 'LOST' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const idx = Object.keys(STAGE_LABELS).indexOf(col.stage);
                                  const nextSt = Object.keys(STAGE_LABELS)[idx + 1];
                                  if (nextSt) handleStageChange(lead.id, nextSt);
                                }}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-semibold cursor-pointer"
                              >
                                Maju ➔
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lead Detail Drawer */}
      {selectedLeadId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Detail Peluang & Kualifikasi BANT
                  </h3>
                  <p className="text-xs text-slate-500">ID: {selectedLeadId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLeadId(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            {loadingDetail || !leadDetail ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Memuat data lead...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* Lead Headline Card */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-base text-slate-900 dark:text-white">
                        {leadDetail.lead.title}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {leadDetail.lead.company_name || 'Individual Prospect'}
                      </p>
                    </div>
                    {renderTemperatureBadge(leadDetail.lead.temperature, leadDetail.lead.lead_score)}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-200 dark:border-slate-700/60">
                    <div>
                      <span className="text-slate-400 block">Kontak Utama:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {leadDetail.lead.contact_name}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Nilai Peluang:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        Rp {leadDetail.lead.deal_value.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Funnel Stage:</span>
                      <span className="font-semibold text-indigo-500">
                        {leadDetail.lead.funnel_stage}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Status Kolom Saat Ini:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {STAGE_LABELS[leadDetail.lead.stage]?.label || leadDetail.lead.stage}
                      </span>
                    </div>
                  </div>

                  {/* Stage Switcher Controls */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                      Ubah Kolom Pipeline:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(STAGE_LABELS).map((st) => (
                        <button
                          key={st}
                          onClick={() => handleStageChange(leadDetail.lead.id, st)}
                          className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                            leadDetail.lead.stage === st
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          {STAGE_LABELS[st].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Detail Tabs */}
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <button
                    onClick={() => setActiveDetailTab('qualification')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeDetailTab === 'qualification'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    Kualifikasi BANT
                  </button>
                  <button
                    onClick={() => setActiveDetailTab('score')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeDetailTab === 'score'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    Rincian Skor ({leadDetail.lead.lead_score.toFixed(1)})
                  </button>
                  <button
                    onClick={() => setActiveDetailTab('timeline')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeDetailTab === 'timeline'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    Linimasa Aktivitas
                  </button>
                </div>

                {/* Tab 1: Kualifikasi BANT */}
                {activeDetailTab === 'qualification' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">
                        Kualifikasi BANT (Budget, Authority, Need, Timeline)
                      </span>
                      <button
                        onClick={() => handleManualRecalculate(leadDetail.lead.id)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-indigo-400 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Hitung Ulang Skor</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {BANT_QUESTIONS.map((bq) => {
                        const existingAnswer = leadDetail.qualification_answers.find(
                          (a) => a.question_key.toLowerCase() === bq.key
                        );
                        const isAnswering = answeringKey === bq.key;

                        return (
                          <div
                            key={bq.key}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {bq.label}
                              </span>
                              {existingAnswer ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                                  <CheckCircle2 className="w-3 h-3" /> Terverifikasi
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                                  <AlertCircle className="w-3 h-3" /> Belum Terjawab
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-400 italic">{bq.prompt}</p>

                            {existingAnswer ? (
                              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300">
                                {existingAnswer.answer_text}
                              </div>
                            ) : null}

                            {isAnswering ? (
                              <div className="pt-2 space-y-2">
                                <textarea
                                  value={answerText}
                                  onChange={(e) => setAnswerText(e.target.value)}
                                  rows={2}
                                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-emerald-500"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setAnsweringKey(null);
                                      setAnswerText('');
                                    }}
                                    className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-600"
                                  >
                                    Batal
                                  </button>
                                  <button
                                    onClick={() => handleRecordQualification(leadDetail.lead.id, bq.key, bq.prompt)}
                                    disabled={submittingAnswer || !answerText.trim()}
                                    className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                                  >
                                    {submittingAnswer ? 'Menyimpan...' : 'Simpan & Evaluasi'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-1 flex justify-end">
                                <button
                                  onClick={() => {
                                    setAnsweringKey(bq.key);
                                    setAnswerText(existingAnswer ? existingAnswer.answer_text : '');
                                  }}
                                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                                >
                                  {existingAnswer ? 'Perbarui Jawaban' : '+ Catat Jawaban'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tab 2: Rincian Skor & Breakdown */}
                {activeDetailTab === 'score' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 border border-emerald-500/20 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase">Skor Saat Ini</span>
                        <div className="text-3xl font-black text-slate-900 dark:text-white mt-0.5">
                          {leadDetail.lead.lead_score.toFixed(1)} <span className="text-sm font-normal text-slate-400">/ 100</span>
                        </div>
                      </div>
                      {renderTemperatureBadge(leadDetail.lead.temperature, leadDetail.lead.lead_score)}
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                        Komposisi Penilaian Terstandarisasi:
                      </span>
                      {leadDetail.score_breakdown.details.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{item.component}</span>
                            <span className="text-[11px] text-slate-400 block">{item.reason}</span>
                          </div>
                          <span className={`font-bold ${item.points >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {item.points >= 0 ? `+${item.points.toFixed(1)}` : `${item.points.toFixed(1)}`} pt
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Riwayat Skor (lead_score_history) */}
                    <div className="pt-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                        Riwayat Perubahan Skor (lead_score_history):
                      </span>
                      <div className="space-y-2">
                        {leadDetail.score_history.map((hist) => (
                          <div
                            key={hist.id}
                            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between"
                          >
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {hist.trigger_event}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {new Date(hist.created_at).toLocaleString('id-ID')}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {hist.previous_score.toFixed(1)} ➔ {hist.new_score.toFixed(1)}
                              </span>
                              <span
                                className={`text-[10px] font-bold block ${
                                  hist.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                }`}
                              >
                                {hist.delta >= 0 ? `+${hist.delta.toFixed(1)}` : `${hist.delta.toFixed(1)}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Linimasa Aktivitas Terpadu */}
                {activeDetailTab === 'timeline' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      Linimasa Aktivitas Terpadu (Pesan, Kualifikasi, Skor & Handover):
                    </span>
                    {timelineEvents.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400 italic">
                        Belum ada riwayat aktivitas.
                      </div>
                    ) : (
                      <div className="relative pl-4 space-y-4 border-l border-slate-200 dark:border-slate-800">
                        {timelineEvents.map((ev, i) => (
                          <div key={ev.id || i} className="relative">
                            <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">
                                  {ev.title}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(ev.timestamp).toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line">
                                {ev.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Buat Peluang Baru */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Daftarkan Peluang Lead Baru
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLeadSubmit} className="p-5 space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Judul Peluang *
                </label>
                <input
                  type="text"
                  required
                  value={newLeadTitle}
                  onChange={(e) => setNewLeadTitle(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Nama Kontak *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLeadContact}
                    onChange={(e) => setNewLeadContact(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Perusahaan
                  </label>
                  <input
                    type="text"
                    value={newLeadCompany}
                    onChange={(e) => setNewLeadCompany(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Nomor WhatsApp/HP
                  </label>
                  <input
                    type="text"
                    value={newLeadPhone}
                    onChange={(e) => setNewLeadPhone(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Email Kontak
                  </label>
                  <input
                    type="email"
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Estimasi Nilai Transaksi (IDR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="500000"
                  value={newLeadDealValue}
                  onChange={(e) => setNewLeadDealValue(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-emerald-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingLead}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {creatingLead ? 'Mendaftarkan...' : 'Daftarkan Peluang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
