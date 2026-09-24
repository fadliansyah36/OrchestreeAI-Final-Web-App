import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Brain,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Save,
  X,
  Play,
  Calculator,
  Activity,
  Layers,
  Wrench,
  Workflow
} from 'lucide-react';

interface ActivityType {
  id: string;
  activity_code: string;
  display_name: string;
  base_work_unit_min: number;
  base_work_unit_max: number;
}

interface ComplexityFactor {
  id: string;
  complexity_code: string;
  multiplier: number;
}

interface ModelCostFactor {
  id: string;
  model_code: string;
  llm_model_id: string | null;
  multiplier: number;
}

interface ToolFactor {
  id: string;
  risk_tier: string;
  multiplier: number;
}

interface ExecutionFactor {
  id: string;
  execution_mode: string;
  multiplier: number;
}

export function CreditFormulaConfigScreen() {
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [complexityFactors, setComplexityFactors] = useState<ComplexityFactor[]>([]);
  const [modelFactors, setModelFactors] = useState<ModelCostFactor[]>([]);
  const [toolFactors, setToolFactors] = useState<ToolFactor[]>([]);
  const [executionFactors, setExecutionFactors] = useState<ExecutionFactor[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'activities' | 'complexity' | 'models' | 'tools' | 'execution' | 'simulator'>('activities');

  // Edit State
  const [editingTarget, setEditingTarget] = useState<{
    type: 'activity' | 'complexity' | 'model' | 'tool' | 'execution';
    id: string;
    label: string;
    val1?: number;
    val2?: number;
    displayName?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Simulator / Real Estimate Test State
  const [simActivity, setSimActivity] = useState<string>('text_generation');
  const [simComplexity, setSimComplexity] = useState<string>('medium');
  const [simModel, setSimModel] = useState<string>('gemini-1.5-flash');
  const [simTool, setSimTool] = useState<string>('medium');
  const [simExecution, setSimExecution] = useState<string>('single_step');
  const [simTesting, setSimTesting] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  const fetchFormulaFactors = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/formula-factors', {
        headers: {
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal memuat faktor formula kredit.');
      }

      const data = await res.json();
      setActivityTypes(data.activity_types || []);
      setComplexityFactors(data.complexity_factors || []);
      setModelFactors(data.model_cost_factors || []);
      setToolFactors(data.tool_factors || []);
      setExecutionFactors(data.execution_factors || []);

      if (data.activity_types?.length > 0 && !simActivity) {
        setSimActivity(data.activity_types[0].activity_code);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat memuat konfigurasi formula.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFormulaFactors();
  }, []);

  const handleOpenEdit = (
    type: 'activity' | 'complexity' | 'model' | 'tool' | 'execution',
    item: any
  ) => {
    if (type === 'activity') {
      setEditingTarget({
        type,
        id: item.id,
        label: item.activity_code,
        displayName: item.display_name,
        val1: item.base_work_unit_min,
        val2: item.base_work_unit_max,
      });
    } else {
      setEditingTarget({
        type,
        id: item.id,
        label: item.complexity_code || item.model_code || item.risk_tier || item.execution_mode,
        val1: item.multiplier,
      });
    }
    setErrorMessage(null);
  };

  const handleSaveFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      let endpoint = '';
      let bodyData: any = {};

      if (editingTarget.type === 'activity') {
        endpoint = `/api/v1/billing/admin/formula-factors/activity-type/${editingTarget.id}`;
        bodyData = {
          display_name: editingTarget.displayName,
          base_work_unit_min: Number(editingTarget.val1),
          base_work_unit_max: Number(editingTarget.val2),
        };
      } else {
        endpoint = `/api/v1/billing/admin/formula-factors/${editingTarget.type === 'complexity' ? 'complexity' : editingTarget.type === 'model' ? 'model' : editingTarget.type === 'tool' ? 'tool' : 'execution'}/${editingTarget.id}`;
        bodyData = {
          multiplier: Number(editingTarget.val1),
        };
      }

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify(bodyData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal menyimpan perubahan formula.');
      }

      setSuccessFeedback(`Faktor ${editingTarget.label} berhasil diperbarui dan tercatat di Audit Ledger.`);
      setEditingTarget(null);
      fetchFormulaFactors();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan faktor formula.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunRealEstimateTest = async () => {
    setSimTesting(true);
    setErrorMessage(null);
    setSimResult(null);
    try {
      const res = await fetch('/api/v1/billing/admin/formula-factors/test-estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify({
          activity_code: simActivity,
          complexity_code: simComplexity,
          model_identifier: simModel,
          tool_risk_tier: simTool === 'none' ? null : simTool,
          execution_mode: simExecution,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Gagal menjalankan estimasi kredit.');
      }

      const data = await res.json();
      setSimResult(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghitung estimasi biaya kredit.');
    } finally {
      setSimTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <span>Konfigurasi Formula Biaya Kredit AI</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Pengaturan baseline metering aktivitas AI & pengali biaya. Perubahan nilai langsung memengaruhi kalkulasi biaya kredit seluruh organisasi secara instan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchFormulaFactors}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {errorMessage && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-sm">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">{errorMessage}</div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successFeedback && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="flex-1">{successFeedback}</div>
          <button onClick={() => setSuccessFeedback(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/60 border border-slate-800 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab('activities')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'activities' ? 'bg-emerald-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Baseline Aktivitas ({activityTypes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('complexity')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'complexity' ? 'bg-emerald-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Kompleksitas ({complexityFactors.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'models' ? 'bg-emerald-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Model AI ({modelFactors.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'tools' ? 'bg-emerald-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Alat MCP ({toolFactors.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('execution')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'execution' ? 'bg-emerald-600 text-white font-semibold shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Workflow className="w-3.5 h-3.5" />
          <span>Mode Eksekusi ({executionFactors.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all cursor-pointer ml-auto ${
            activeTab === 'simulator' ? 'bg-purple-600 text-white font-semibold shadow-md' : 'text-purple-300 hover:text-white bg-purple-950/30 border border-purple-800/40'
          }`}
        >
          <Calculator className="w-3.5 h-3.5 text-purple-300" />
          <span>Uji Nyata Formula</span>
        </button>
      </div>

      {/* TAB CONTENT: ACTIVITIES */}
      {activeTab === 'activities' && (
        <div className="rounded-2xl bg-[#0B1220] border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              18 Tipe Aktivitas AI (Baseline Metering Unit Kerja)
            </span>
            <span className="text-[11px] text-slate-500 font-mono">Nilai unit kerja kredit riil</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-800/60">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kode Aktivitas</th>
                  <th className="py-3 px-4 font-semibold">Nama Tampilan</th>
                  <th className="py-3 px-4 font-semibold text-right">Min Unit Kerja</th>
                  <th className="py-3 px-4 font-semibold text-right">Maks Unit Kerja</th>
                  <th className="py-3 px-4 text-center font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {activityTypes.map((act) => (
                  <tr key={act.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">{act.activity_code}</td>
                    <td className="py-3 px-4 text-slate-200">{act.display_name}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-white">{act.base_work_unit_min}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-white">{act.base_work_unit_max}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleOpenEdit('activity', act)}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-emerald-400 hover:border-emerald-600 transition-all cursor-pointer"
                        title="Ubah Parameter"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: COMPLEXITY */}
      {activeTab === 'complexity' && (
        <div className="rounded-2xl bg-[#0B1220] border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800/80 bg-slate-900/40">
            <span className="text-xs font-semibold text-slate-300">
              Faktor Pengali Kompleksitas Tugas (Complexity Factors)
            </span>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {complexityFactors.map((c) => (
              <div key={c.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-xs uppercase font-mono font-bold text-slate-400 tracking-wider">
                    {c.complexity_code}
                  </span>
                  <div className="text-2xl font-mono font-extrabold text-emerald-400 mt-2">
                    {c.multiplier}x
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleOpenEdit('complexity', c)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-xs text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Ubah</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: MODELS */}
      {activeTab === 'models' && (
        <div className="rounded-2xl bg-[#0B1220] border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800/80 bg-slate-900/40">
            <span className="text-xs font-semibold text-slate-300">
              Faktor Pengali Biaya Model LLM (Model Cost Factors)
            </span>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {modelFactors.map((m) => (
              <div key={m.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-mono font-bold text-white tracking-wide">
                      {m.model_code}
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-extrabold text-emerald-400 mt-2">
                    {m.multiplier}x
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {m.multiplier < 1.0 ? 'Ekonomis / Ringan' : m.multiplier === 1.0 ? 'Standar Netral' : 'Kemampuan Lanjutan / Pemikiran Dalam'}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleOpenEdit('model', m)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-xs text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Ubah Multiplier</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: TOOLS */}
      {activeTab === 'tools' && (
        <div className="rounded-2xl bg-[#0B1220] border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800/80 bg-slate-900/40">
            <span className="text-xs font-semibold text-slate-300">
              Faktor Pengali Risiko Alat MCP (MCP Tool Risk Tier Factors)
            </span>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {toolFactors.map((t) => (
              <div key={t.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-xs uppercase font-mono font-bold text-slate-400 tracking-wider">
                    Tingkat Risiko: {t.risk_tier}
                  </span>
                  <div className="text-2xl font-mono font-extrabold text-emerald-400 mt-2">
                    {t.multiplier}x
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleOpenEdit('tool', t)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-xs text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Ubah</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: EXECUTION */}
      {activeTab === 'execution' && (
        <div className="rounded-2xl bg-[#0B1220] border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800/80 bg-slate-900/40">
            <span className="text-xs font-semibold text-slate-300">
              Faktor Mode Eksekusi (Execution Mode Factors)
            </span>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {executionFactors.map((e) => (
              <div key={e.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div>
                  <span className="text-xs uppercase font-mono font-bold text-slate-400 tracking-wider">
                    {e.execution_mode}
                  </span>
                  <div className="text-2xl font-mono font-extrabold text-emerald-400 mt-2">
                    {e.multiplier}x
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => handleOpenEdit('execution', e)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-xs text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Ubah</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: SIMULATOR / TEST ESTIMATE */}
      {activeTab === 'simulator' && (
        <div className="p-6 rounded-2xl bg-[#0B1220] border border-purple-800/40 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calculator className="w-5 h-5 text-purple-400" />
                <span>Uji Nyata Formula Kredit AI (Live Engine Test)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Kalkulasi diverifikasi langsung oleh PostgreSQL Credit Engine di backend. Membuktikan secara nyata bahwa setiap perubahan multiplier langsung memengaruhi estimasi berikutnya.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Aktivitas AI
              </label>
              <select
                value={simActivity}
                onChange={(e) => setSimActivity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-purple-500 focus:outline-hidden"
              >
                {activityTypes.map((a) => (
                  <option key={a.id} value={a.activity_code}>
                    {a.activity_code} ({a.display_name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Tingkat Kompleksitas
              </label>
              <select
                value={simComplexity}
                onChange={(e) => setSimComplexity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-purple-500 focus:outline-hidden"
              >
                {complexityFactors.map((c) => (
                  <option key={c.id} value={c.complexity_code}>
                    {c.complexity_code} ({c.multiplier}x)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Model LLM AI
              </label>
              <select
                value={simModel}
                onChange={(e) => setSimModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-purple-500 focus:outline-hidden"
              >
                {modelFactors.map((m) => (
                  <option key={m.id} value={m.model_code}>
                    {m.model_code} ({m.multiplier}x)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Tingkat Risiko Alat MCP
              </label>
              <select
                value={simTool}
                onChange={(e) => setSimTool(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-purple-500 focus:outline-hidden"
              >
                <option value="none">Tanpa Alat (1.0x)</option>
                {toolFactors.map((t) => (
                  <option key={t.id} value={t.risk_tier}>
                    {t.risk_tier} ({t.multiplier}x)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mode Eksekusi
              </label>
              <select
                value={simExecution}
                onChange={(e) => setSimExecution(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-purple-500 focus:outline-hidden"
              >
                {executionFactors.map((e) => (
                  <option key={e.id} value={e.execution_mode}>
                    {e.execution_mode} ({e.multiplier}x)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleRunRealEstimateTest}
                disabled={simTesting}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-950/40 cursor-pointer disabled:opacity-50"
              >
                {simTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghitung...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Uji Estimasi Nyata</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Result Display */}
          {simResult && (
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Hasil Estimasi Biaya Kredit AI</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  {simResult.estimated_cost} Kredit
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-black/40 border border-slate-800">
                  <div className="text-slate-400">Unit Kerja Baseline</div>
                  <div className="text-base font-mono font-bold text-white mt-1">
                    {simResult.breakdown?.base_work_units ?? '-'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/40 border border-slate-800">
                  <div className="text-slate-400">Pengali Kompleksitas</div>
                  <div className="text-base font-mono font-bold text-white mt-1">
                    {simResult.breakdown?.complexity_multiplier ?? '-'}x
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/40 border border-slate-800">
                  <div className="text-slate-400">Pengali Model LLM</div>
                  <div className="text-base font-mono font-bold text-white mt-1">
                    {simResult.breakdown?.model_multiplier ?? '-'}x
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-black/40 border border-slate-800">
                  <div className="text-slate-400">Pengali Eksekusi / Alat</div>
                  <div className="text-base font-mono font-bold text-white mt-1">
                    {simResult.breakdown?.execution_multiplier ?? 1.0}x
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-[#0B1220] border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
              <h3 className="font-bold text-white text-base">
                Ubah Faktor: <span className="font-mono text-emerald-400">{editingTarget.label}</span>
              </h3>
              <button
                onClick={() => setEditingTarget(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFactor} className="p-6 space-y-4">
              {editingTarget.type === 'activity' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Tampilan
                    </label>
                    <input
                      type="text"
                      value={editingTarget.displayName || ''}
                      onChange={(e) => setEditingTarget({ ...editingTarget, displayName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Min Unit Kerja
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editingTarget.val1 ?? ''}
                        onChange={(e) => setEditingTarget({ ...editingTarget, val1: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Maks Unit Kerja
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editingTarget.val2 ?? ''}
                        onChange={(e) => setEditingTarget({ ...editingTarget, val2: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nilai Multiplier (Pengali)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.01"
                    required
                    value={editingTarget.val1 ?? ''}
                    onChange={(e) => setEditingTarget({ ...editingTarget, val1: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-mono focus:border-emerald-500 focus:outline-hidden"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Contoh: 1.0 (standar), 1.5 (naik 50%), 0.5 (turun 50%).
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTarget(null)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
