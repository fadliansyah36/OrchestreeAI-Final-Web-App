import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders,
  Plus,
  RefreshCw,
  Calculator,
  Trash2,
  Check,
  X,
  AlertCircle,
  HelpCircle,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  CreditMeteringRuleItem,
  CreditCostFactorItem,
  CreditCostContext,
  CreditCostResult,
} from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const CreditMeteringConfigurationScreen: React.FC = () => {
  const [rules, setRules] = useState<CreditMeteringRuleItem[]>([]);
  const [factors, setFactors] = useState<CreditCostFactorItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cost simulator state
  const [simContext, setSimContext] = useState<CreditCostContext>({
    activityType: 'chat_completion',
    complexityLevel: 'simple',
    modelUsed: 'meta/llama-3.1-70b-instruct',
    toolsInvoked: 0,
    executionType: 'sync',
  });
  const [simResult, setSimResult] = useState<CreditCostResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // New Rule Modal
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleFormData, setRuleFormData] = useState({
    activityType: '',
    baseWorkUnits: 1.0,
    description: '',
  });
  const [isSavingRule, setIsSavingRule] = useState(false);

  // New Factor Modal
  const [isFactorModalOpen, setIsFactorModalOpen] = useState(false);
  const [factorFormData, setFactorFormData] = useState({
    factorType: 'complexity' as 'complexity' | 'model' | 'tool' | 'execution',
    factorKey: '',
    multiplier: 1.2,
  });
  const [isSavingFactor, setIsSavingFactor] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const [rulesData, factorsData] = await Promise.all([
        api.getCreditMeteringRules(),
        api.getCreditCostFactors(),
      ]);
      setRules(rulesData || []);
      setFactors(factorsData || []);
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/commercial/metering-rules',
        status: err?.status || 502,
        message: err?.message || 'Gagal memuat aturan credit metering atau cost factors.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: 'Gagal memuat aturan metering dari backend (502/Down).' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSimulate = async () => {
    setIsSimulating(true);
    setMessage(null);
    try {
      const res = await api.simulateCreditCost(simContext);
      setSimResult(res);
      setMessage({ type: 'success', text: `Simulasi berhasil dihitung: ${res.estimatedCost} Kredit.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal melakukan simulasi biaya via backend API.' });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleFormData.activityType.trim()) {
      setMessage({ type: 'error', text: 'Activity Type wajib diisi.' });
      return;
    }
    setIsSavingRule(true);
    try {
      await api.saveCreditMeteringRule({
        activityType: ruleFormData.activityType.trim(),
        baseWorkUnits: Number(ruleFormData.baseWorkUnits),
        description: ruleFormData.description.trim(),
      });
      setMessage({ type: 'success', text: `Rule "${ruleFormData.activityType}" berhasil disimpan.` });
      setIsRuleModalOpen(false);
      setRuleFormData({ activityType: '', baseWorkUnits: 1.0, description: '' });
      await fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menyimpan metering rule.' });
    } finally {
      setIsSavingRule(false);
    }
  };

  const handleDeleteRule = async (activityType: string) => {
    if (!confirm(`Konfirmasi hapus Base Work Unit Rule "${activityType}"?`)) return;
    try {
      await api.deleteCreditMeteringRule(activityType);
      setMessage({ type: 'success', text: `Rule "${activityType}" berhasil dihapus.` });
      await fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menghapus metering rule.' });
    }
  };

  const handleCreateFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorFormData.factorKey.trim()) {
      setMessage({ type: 'error', text: 'Factor Key wajib diisi.' });
      return;
    }
    setIsSavingFactor(true);
    try {
      await api.saveCreditCostFactor({
        factorType: factorFormData.factorType,
        factorKey: factorFormData.factorKey.trim(),
        multiplier: Number(factorFormData.multiplier),
      });
      setMessage({ type: 'success', text: `Factor "${factorFormData.factorKey}" berhasil disimpan.` });
      setIsFactorModalOpen(false);
      setFactorFormData({ factorType: 'complexity', factorKey: '', multiplier: 1.2 });
      await fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menyimpan cost factor.' });
    } finally {
      setIsSavingFactor(false);
    }
  };

  const handleDeleteFactor = async (factorType: string, factorKey: string) => {
    if (!confirm(`Konfirmasi hapus Cost Multiplier Factor "${factorType}/${factorKey}"?`)) return;
    try {
      await api.deleteCreditCostFactor(factorType, factorKey);
      setMessage({ type: 'success', text: `Factor "${factorKey}" berhasil dihapus.` });
      await fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menghapus cost factor.' });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <span>Credit Metering & Multiplier Rules (Domain 16)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Konfigurasi SSOT Base Work Units, bobot pengali LLM/Tool, dan kalkulator simulasi presisi sebelum menyimpan aturan baru.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {backendError && (
        <HonestErrorBanner
          error={backendError}
          onRetry={fetchData}
          title="Layanan konfigurasi credit metering mengembalikan respon error atau tidak dapat dijangkau (502)."
        />
      )}

      {message && (
        <div
          className={`p-3 text-xs rounded-lg border flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Live Cost Simulator & Preview */}
      <div className="bg-slate-900/90 border border-indigo-900/40 rounded-xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-400" />
            <span>Kalkulator Preview Biaya Transaksi (POST /admin/commercial/simulate-cost)</span>
          </h3>
          <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded">
            Live Preview SSOT
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Uji skenario konsumsi kredit dengan memilih kombinasi tipe aktivitas, kompleksitas tugas, model foundation (NVIDIA NIM / OpenRouter), dan jumlah eksekusi tool.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs pt-1">
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Activity Type</label>
            <select
              value={simContext.activityType}
              onChange={(e) => setSimContext({ ...simContext, activityType: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:border-indigo-500"
            >
              <option value="chat_completion">Chat Completion (1.0)</option>
              <option value="tool_execution">Tool Execution (1.5)</option>
              <option value="workflow_step">Workflow Step (0.8)</option>
              <option value="document_analysis">Document Analysis (2.0)</option>
              <option value="autonomous_agent_cycle">Autonomous Agent Cycle (2.5)</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Complexity</label>
            <select
              value={simContext.complexityLevel}
              onChange={(e) => setSimContext({ ...simContext, complexityLevel: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:border-indigo-500"
            >
              <option value="simple">Simple (1.0x)</option>
              <option value="medium">Medium (1.5x)</option>
              <option value="complex">Complex (2.5x)</option>
              <option value="extreme">Extreme Autonomous (4.0x)</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Foundation Model</label>
            <select
              value={simContext.modelUsed}
              onChange={(e) => setSimContext({ ...simContext, modelUsed: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:border-indigo-500"
            >
              <option value="meta/llama-3.1-70b-instruct">NVIDIA NIM - Llama 3.1 70B (1.2x)</option>
              <option value="meta/llama-3.3-70b-instruct">NVIDIA NIM - Llama 3.3 70B (1.4x)</option>
              <option value="anthropic/claude-3.5-sonnet">OpenRouter - Claude 3.5 Sonnet (2.0x)</option>
              <option value="mistralai/mistral-large-2407">OpenRouter - Mistral Large (1.8x)</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Tools Invoked</label>
            <select
              value={simContext.toolsInvoked}
              onChange={(e) => setSimContext({ ...simContext, toolsInvoked: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:border-indigo-500"
            >
              <option value="0">Tanpa Tool (1.0x)</option>
              <option value="1">1 Tool Call (1.2x)</option>
              <option value="3">3 Tools / MCP (1.5x)</option>
              <option value="5">5+ Swarm Tools (2.0x)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSimulate}
              disabled={isSimulating}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-sm shadow-emerald-950"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSimulating ? 'Menghitung...' : 'Hitung Preview'}</span>
            </button>
          </div>
        </div>

        {simResult && (
          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <span className="text-xs text-slate-400">Estimasi Biaya Transaksi:</span>
              <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                {simResult.estimatedCost} <span className="text-sm font-normal text-emerald-500">Kredit</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 font-mono bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-indigo-400 font-semibold">Formula: </span>
              {simResult.breakdown.base} [Base] × {simResult.breakdown.complexity} [Complexity] × {simResult.breakdown.model} [Model] × {simResult.breakdown.tool} [Tools] × {simResult.breakdown.execution} [Exec]
            </div>
          </div>
        )}
      </div>

      {/* Tables of Rules & Factors with CRUD */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Base Work Units */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Base Work Unit Rules</span>
              </h3>
              <p className="text-[11px] text-slate-400">GET/POST/DELETE /admin/commercial/metering-rules</p>
            </div>
            <button
              onClick={() => setIsRuleModalOpen(true)}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Rule</span>
            </button>
          </div>
          <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
            {rules.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                {isLoading ? 'Memuat aturan...' : 'Belum ada aturan metering terdaftar.'}
              </div>
            ) : (
              rules.map((r, idx) => (
                <div key={idx} className="p-3.5 flex justify-between items-center text-xs hover:bg-slate-800/30 transition">
                  <div>
                    <span className="font-semibold text-white block">{r.activityType}</span>
                    <span className="text-slate-400 text-[11px]">{r.description || 'Base metering rule'}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/40">
                      {r.baseWorkUnits} Units
                    </span>
                    <button
                      onClick={() => handleDeleteRule(r.activityType)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                      title="Hapus Rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cost Multiplier Factors */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span>Cost Multiplier Factors</span>
              </h3>
              <p className="text-[11px] text-slate-400">GET/POST/DELETE /admin/commercial/cost-factors</p>
            </div>
            <button
              onClick={() => setIsFactorModalOpen(true)}
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Factor</span>
            </button>
          </div>
          <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
            {factors.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                {isLoading ? 'Memuat faktor...' : 'Belum ada cost factor terdaftar.'}
              </div>
            ) : (
              factors.map((f, idx) => (
                <div key={idx} className="p-3.5 flex justify-between items-center text-xs hover:bg-slate-800/30 transition">
                  <div>
                    <span className="font-semibold text-white block">{f.factorKey}</span>
                    <span className="text-indigo-400 text-[11px] uppercase font-mono">{f.factorType}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-indigo-400 font-bold bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/40">
                      {f.multiplier}x
                    </span>
                    <button
                      onClick={() => handleDeleteFactor(f.factorType, f.factorKey)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                      title="Hapus Factor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Tambah Metering Rule */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Tambah Base Work Unit Rule</h3>
              <button onClick={() => setIsRuleModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateRule} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Activity Type (cth: document_analysis)</label>
                <input
                  type="text"
                  required
                  value={ruleFormData.activityType}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, activityType: e.target.value })}
                  placeholder="e.g. document_analysis"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Base Work Units (Kredit Dasar)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={ruleFormData.baseWorkUnits}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, baseWorkUnits: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Deskripsi Rule</label>
                <textarea
                  rows={2}
                  value={ruleFormData.description}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, description: e.target.value })}
                  placeholder="Keterangan penagihan unit aktivitas..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingRule}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {isSavingRule ? 'Menyimpan...' : 'Simpan Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah Cost Factor */}
      {isFactorModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Tambah Cost Multiplier Factor</h3>
              <button onClick={() => setIsFactorModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateFactor} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Tipe Faktor</label>
                <select
                  value={factorFormData.factorType}
                  onChange={(e) => setFactorFormData({ ...factorFormData, factorType: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                >
                  <option value="complexity">Complexity (Kompleksitas)</option>
                  <option value="model">Foundation Model</option>
                  <option value="tool">Tool Invocations</option>
                  <option value="execution">Execution Type (Sync/Async)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Factor Key (cth: extreme, batch, meta/llama-3.3-70b-instruct)</label>
                <input
                  type="text"
                  required
                  value={factorFormData.factorKey}
                  onChange={(e) => setFactorFormData({ ...factorFormData, factorKey: e.target.value })}
                  placeholder="e.g. extreme"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Multiplier Pengali (cth: 1.5 = 1.5x)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  required
                  value={factorFormData.multiplier}
                  onChange={(e) => setFactorFormData({ ...factorFormData, multiplier: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFactorModalOpen(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingFactor}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {isSavingFactor ? 'Menyimpan...' : 'Simpan Factor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
