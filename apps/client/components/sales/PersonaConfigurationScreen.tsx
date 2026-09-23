'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Sparkles,
  Sliders,
  ArrowRight,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  ShieldAlert,
  HelpCircle,
  Clock,
  Send,
  MessageSquare,
  Bot,
  Activity,
  Layers,
  ChevronRight,
  Settings,
} from 'lucide-react';

export interface PersonaConfig {
  tone?: string;
  qualification_questions?: string[];
  score_triggers?: {
    hot_lead_min?: number;
    handoff_min_score?: number;
  };
  target_criteria?: {
    industry?: string[];
    min_deal_value?: number;
  };
  max_budget_authority?: number;
  handoff_instruction?: string;
  [key: string]: any;
}

export interface AgentPersona {
  id: string;
  name: string;
  department_name?: string | null;
  status: string;
  persona_config: PersonaConfig;
  system_prompt?: string | null;
}

export interface PersonaHandoffRule {
  id: string;
  rule_name: string;
  source_agent_id?: string | null;
  target_agent_id?: string | null;
  source_agent_name?: string | null;
  target_agent_name?: string | null;
  condition_type: string; // LEAD_SCORE_THRESHOLD | STAGE_CHANGE | INTENT_MATCH
  condition_params: any;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface PersonaHandoverRecord {
  id: string;
  conversation_id: string;
  source_agent_id?: string | null;
  target_agent_id?: string | null;
  source_agent_name?: string | null;
  target_agent_name?: string | null;
  handover_reason: string;
  summary_context?: string | null;
  created_at: string;
}

export const PersonaConfigurationScreen: React.FC<{ tenantId: string; onBackToPipeline?: () => void }> = ({
  tenantId,
  onBackToPipeline,
}) => {
  const [activeTab, setActiveTab] = useState<'personas' | 'rules' | 'audit'>('personas');
  const [personas, setPersonas] = useState<AgentPersona[]>([]);
  const [rules, setRules] = useState<PersonaHandoffRule[]>([]);
  const [handovers, setHandovers] = useState<PersonaHandoverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected persona for config editing
  const [selectedAgent, setSelectedAgent] = useState<AgentPersona | null>(null);
  const [editingTone, setEditingTone] = useState('');
  const [editingQuestions, setEditingQuestions] = useState('');
  const [editingHandoffMinScore, setEditingHandoffMinScore] = useState(70);
  const [editingInstruction, setEditingInstruction] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Rule creation modal
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleSourceId, setNewRuleSourceId] = useState('');
  const [newRuleTargetId, setNewRuleTargetId] = useState('');
  const [newRuleConditionType, setNewRuleConditionType] = useState('LEAD_SCORE_THRESHOLD');
  const [newRuleMinScore, setNewRuleMinScore] = useState('70');
  const [newRuleTargetStage, setNewRuleTargetStage] = useState('QUALIFIED');
  const [newRulePriority, setNewRulePriority] = useState('10');
  const [savingRule, setSavingRule] = useState(false);

  // Test Handover Modal
  const [isTestHandoverOpen, setIsTestHandoverOpen] = useState(false);
  const [testSourceId, setTestSourceId] = useState('');
  const [testTargetId, setTestTargetId] = useState('');
  const [testReason, setTestReason] = useState('Kualifikasi BANT lengkap, skor melampaui ambang batas 70');
  const [testSummary, setTestSummary] = useState('Lead menunjukkan minat tinggi pada paket Enterprise dan memiliki otoritas anggaran.');
  const [testingHandover, setTestingHandover] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [personasRes, rulesRes, handoversRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/crm/personas`),
        fetch(`/api/v1/tenants/${tenantId}/crm/persona-rules`),
        fetch(`/api/v1/tenants/${tenantId}/crm/persona-handovers?limit=30`),
      ]);

      if (personasRes.ok) {
        const pJson = await personasRes.json();
        setPersonas(pJson.data || []);
        if (pJson.data?.length > 0 && !selectedAgent) {
          selectPersona(pJson.data[0]);
        }
      }

      if (rulesRes.ok) {
        const rJson = await rulesRes.json();
        setRules(rJson.data || []);
      }

      if (handoversRes.ok) {
        const hJson = await handoversRes.json();
        setHandovers(hJson.data || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectPersona = (agent: AgentPersona) => {
    setSelectedAgent(agent);
    const cfg = agent.persona_config || {};
    setEditingTone(cfg.tone || 'Profesional, hangat, dan solutif');
    setEditingQuestions(
      Array.isArray(cfg.qualification_questions) ? cfg.qualification_questions.join('\n') : ''
    );
    setEditingHandoffMinScore(cfg.score_triggers?.handoff_min_score || 70);
    setEditingInstruction(
      cfg.handoff_instruction || 'Serahkan ke Sales Specialist saat skor BANT >= 70'
    );
  };

  const handleSavePersonaConfig = async () => {
    if (!selectedAgent) return;
    setSavingConfig(true);
    try {
      const questionsArray = editingQuestions
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean);

      const payload: PersonaConfig = {
        ...selectedAgent.persona_config,
        tone: editingTone,
        qualification_questions: questionsArray,
        score_triggers: {
          ...selectedAgent.persona_config?.score_triggers,
          handoff_min_score: Number(editingHandoffMinScore),
        },
        handoff_instruction: editingInstruction,
      };

      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/personas/${selectedAgent.id}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Error saving persona config:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName) return;
    setSavingRule(true);
    try {
      let condParams: any = {};
      if (newRuleConditionType === 'LEAD_SCORE_THRESHOLD') {
        condParams = { min_score: parseFloat(newRuleMinScore) || 70 };
      } else if (newRuleConditionType === 'STAGE_CHANGE') {
        condParams = { target_stage: newRuleTargetStage };
      } else {
        condParams = { intent: 'PRICING_INQUIRY' };
      }

      const payload = {
        rule_name: newRuleName,
        source_agent_id: newRuleSourceId || null,
        target_agent_id: newRuleTargetId || null,
        condition_type: newRuleConditionType,
        condition_params: condParams,
        priority: parseInt(newRulePriority, 10) || 10,
        is_active: true,
      };

      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/persona-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsRuleModalOpen(false);
        setNewRuleName('');
        await fetchData();
      }
    } catch (err) {
      console.error('Save rule failed:', err);
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/persona-rules/${ruleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
      }
    } catch (err) {
      console.error('Delete rule failed:', err);
    }
  };

  const handleTestHandover = async () => {
    setTestingHandover(true);
    try {
      const threadConvId = crypto.randomUUID();
      const res = await fetch(`/api/v1/tenants/${tenantId}/crm/persona-handovers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: threadConvId,
          source_agent_id: testSourceId || (personas[0]?.id ?? null),
          target_agent_id: testTargetId || (personas[1]?.id ?? personas[0]?.id ?? null),
          handover_reason: testReason,
          summary_context: testSummary,
        }),
      });

      if (res.ok) {
        setIsTestHandoverOpen(false);
        await fetchData();
        setActiveTab('audit');
      }
    } catch (err) {
      console.error('Test handover failed:', err);
    } finally {
      setTestingHandover(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                Konfigurasi Persona AI & Transisi Handoff
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Atur persona agen AI spesialis (SDR, Account Executive, CS) dan orkestrasi serah-terima otomatis (PERSONA_HANDOFF).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {onBackToPipeline && (
            <button
              onClick={onBackToPipeline}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180 text-emerald-500" />
              <span>Kembali ke Pipeline</span>
            </button>
          )}

          <button
            onClick={() => setIsTestHandoverOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Uji Handoff</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('personas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'personas'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Daftar Persona Agen AI ({personas.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'rules'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Aturan Handoff Otomatis ({rules.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Audit Log Handover ({handovers.length})</span>
        </button>
      </div>

      {/* Tab 1: Daftar Persona Agen & Editor Konfigurasi */}
      {activeTab === 'personas' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List of Personas */}
          <div className="lg:col-span-1 space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Pilih Persona untuk Konfigurasi:
            </span>
            <div className="space-y-2">
              {personas.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => selectPersona(agent)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    selectedAgent?.id === agent.id
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                          {agent.name}
                        </h4>
                        <span className="text-[10px] text-slate-400">
                          {agent.department_name || 'Penjualan & Pemasaran'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      {agent.status}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Tone: {agent.persona_config?.tone || 'Profesional'}</span>
                    <span className="font-semibold text-indigo-500">
                      Ambang Handoff: {agent.persona_config?.score_triggers?.handoff_min_score || 70}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Persona Config Editor */}
          <div className="lg:col-span-2">
            {selectedAgent ? (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                      <Settings className="w-4 h-4 text-indigo-500" />
                      Editor Parameter Persona: {selectedAgent.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Sesuaikan gaya bicara, pertanyaan kualifikasi wajib, serta instruksi serah-terima percakapan.
                    </p>
                  </div>
                  <button
                    onClick={handleSavePersonaConfig}
                    disabled={savingConfig}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{savingConfig ? 'Menyimpan...' : 'Simpan Parameter'}</span>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Tone & Gaya Bahasa Komunikasi:
                    </label>
                    <input
                      type="text"
                      value={editingTone}
                      onChange={(e) => setEditingTone(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Pertanyaan Kualifikasi BANT Prioritas (1 per baris):
                    </label>
                    <textarea
                      rows={4}
                      value={editingQuestions}
                      onChange={(e) => setEditingQuestions(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-indigo-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Skor Ambang Batas Handoff (0-100):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editingHandoffMinScore}
                        onChange={(e) => setEditingHandoffMinScore(Number(e.target.value))}
                        className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-indigo-500"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Ketika skor prospek mencapai nilai ini, sistem mengarahkan sesi ke persona penutup deal.
                      </span>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Instruksi Handoff Khusus:
                      </label>
                      <input
                        type="text"
                        value={editingInstruction}
                        onChange={(e) => setEditingInstruction(e.target.value)}
                        className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-slate-400 italic border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                Pilih persona agen di sebelah kiri untuk melihat dan mengonfigurasi parameter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Aturan Handoff Otomatis (persona_handoff_rules) */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Daftar Aturan Transisi Handoff (Prioritas Tertinggi Dievaluasi Terlebih Dahulu)
            </span>
            <button
              onClick={() => setIsRuleModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Aturan Handoff</span>
            </button>
          </div>

          <div className="space-y-3">
            {rules.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 italic border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                Belum ada aturan handoff terdaftar. Buat aturan baru untuk mengotomasi alur antar-persona.
              </div>
            ) : (
              rules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                        Prioritas #{rule.priority}
                      </span>
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                        {rule.rule_name}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          rule.is_active
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {rule.is_active ? 'Aktif' : 'Non-aktif'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-indigo-400">
                        {rule.source_agent_name || 'Semua Persona Awal'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-emerald-400">
                        {rule.target_agent_name || 'Persona Spesialis Deal'}
                      </span>
                      <span className="text-slate-400">|</span>
                      <span className="text-slate-500 text-[11px]">
                        Kondisi: <strong className="text-slate-700 dark:text-slate-200">{rule.condition_type}</strong> (
                        {JSON.stringify(rule.condition_params)})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                      title="Hapus Aturan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Audit Log Handover (conversation_handovers) */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Log Serah-Terima Percakapan Antar-Agen (Terekam Real-Time dari Supabase Postgres)
            </span>
            <button
              onClick={fetchData}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {handovers.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 italic border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                Belum ada transaksi handover terekam. Gunakan tombol "Simulasi Handoff" untuk menguji alur.
              </div>
            ) : (
              handovers.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-indigo-500">
                        {item.source_agent_name || 'Agen Awal'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold text-emerald-500">
                        {item.target_agent_name || 'Agen Penerima'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleString('id-ID')}
                    </span>
                  </div>

                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <strong>Alasan Transisi:</strong> {item.handover_reason}
                  </div>

                  {item.summary_context && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                      {item.summary_context}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400">
                    Thread ID: <code>{item.conversation_id}</code>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal Tambah Aturan Handoff */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Tambah Aturan Handoff Persona
            </h3>

            <form onSubmit={handleCreateRule} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nama Aturan *
                </label>
                <input
                  type="text"
                  required
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Persona Asal (Source)
                  </label>
                  <select
                    value={newRuleSourceId}
                    onChange={(e) => setNewRuleSourceId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-indigo-500"
                  >
                    <option value="">Semua Persona</option>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Persona Target (Destination)
                  </label>
                  <select
                    value={newRuleTargetId}
                    onChange={(e) => setNewRuleTargetId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-indigo-500"
                  >
                    <option value="">Persona Rekomendasi</option>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Jenis Kondisi
                  </label>
                  <select
                    value={newRuleConditionType}
                    onChange={(e) => setNewRuleConditionType(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-indigo-500"
                  >
                    <option value="LEAD_SCORE_THRESHOLD">Skor Lead Melampaui Nilai</option>
                    <option value="STAGE_CHANGE">Perubahan Status Pipeline</option>
                    <option value="INTENT_MATCH">Pencocokan Intent Pelanggan</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Prioritas Evaluasi
                  </label>
                  <input
                    type="number"
                    value={newRulePriority}
                    onChange={(e) => setNewRulePriority(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-indigo-500"
                  />
                </div>
              </div>

              {newRuleConditionType === 'LEAD_SCORE_THRESHOLD' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Skor Minimal Pemicu (min_score)
                  </label>
                  <input
                    type="number"
                    value={newRuleMinScore}
                    onChange={(e) => setNewRuleMinScore(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-indigo-500"
                  />
                </div>
              )}

              {newRuleConditionType === 'STAGE_CHANGE' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Status Sasaran (target_stage)
                  </label>
                  <select
                    value={newRuleTargetStage}
                    onChange={(e) => setNewRuleTargetStage(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-indigo-500"
                  >
                    <option value="QUALIFIED">QUALIFIED</option>
                    <option value="PROPOSAL">PROPOSAL</option>
                    <option value="NEGOTIATION">NEGOTIATION</option>
                    <option value="WON">WON</option>
                  </select>
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingRule}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  {savingRule ? 'Menyimpan...' : 'Simpan Aturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Uji Coba Handover */}
      {isTestHandoverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Pengujian Handover Percakapan
            </h3>
            <p className="text-xs text-slate-400">
              Memicu transaksi perpindahan kepemilikan percakapan dari persona satu ke persona berikutnya dengan context injection.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Persona Asal
                  </label>
                  <select
                    value={testSourceId}
                    onChange={(e) => setTestSourceId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Persona Tujuan
                  </label>
                  <select
                    value={testTargetId}
                    onChange={(e) => setTestTargetId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Alasan Serah-Terima (Reason)
                </label>
                <input
                  type="text"
                  value={testReason}
                  onChange={(e) => setTestReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Rangkuman Konteks (Summary Context)
                </label>
                <textarea
                  rows={3}
                  value={testSummary}
                  onChange={(e) => setTestSummary(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTestHandoverOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleTestHandover}
                  disabled={testingHandover}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 cursor-pointer"
                >
                  {testingHandover ? 'Mengeksekusi...' : 'Jalankan Handover'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
