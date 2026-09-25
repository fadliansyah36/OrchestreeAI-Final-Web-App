import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Key,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Database,
  Users,
  Eye,
  LogOut,
  Brain,
  Layers,
  Play,
  Activity,
  Server,
  Zap,
  Check,
  Clock,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Award,
  BookOpen,
  History,
  XCircle,
  DollarSign,
  Share2,
  Boxes,
} from 'lucide-react';
import { FinancialCommandCenter } from './FinancialCommandCenter';
import { IntegrationsHubScreen } from './IntegrationsHubScreen';
import { AgentBlueprintCatalogScreen } from './AgentBlueprintCatalogScreen';
import { TokenOptimizationScreen } from './TokenOptimizationScreen';

interface LLMProvider {
  id: string;
  display_name: string;
  base_url: string;
  is_active: boolean;
  health_status: 'healthy' | 'degraded' | 'down';
  latency_ms: number;
  error_message?: string;
}

interface MCPTool {
  id: string;
  tool_name: string;
  risk_tier: string;
  category: string;
  description: string;
  input_schema: any;
  output_schema: any;
  is_active: boolean;
}

interface TenantItem {
  id: string;
  legal_name: string;
  display_name: string;
  status: string;
  created_at: string;
}

interface WorkflowExecution {
  id: string;
  tenant_id: string;
  intent_text: string;
  status: string;
  current_node_id: string | null;
  output_payload: any;
  created_at: string;
}

interface DecisionOutcome {
  id: string;
  tenant_id: string;
  workflow_execution_id: string;
  node_key: string;
  decision_type: string;
  objective_outcome: string;
  objective_success: boolean;
  confidence_score: number;
  verification_source: string;
  evaluation_metrics: any;
  created_at: string;
}

interface SkillConfidence {
  id: string;
  tenant_id: string;
  skill_name: string;
  skill_key: string;
  confidence_score: number;
  total_invocations: number;
  successful_invocations: number;
  failed_invocations: number;
  last_updated_at: string;
}

interface LessonLearned {
  id: string;
  tenant_id: string;
  skill_name: string;
  skill_key: string;
  context_pattern: string;
  lesson_summary: string;
  lesson_type: 'BEST_PRACTICE' | 'PITFALL_AVOIDANCE' | 'OBSERVATION';
  sample_size: number;
  min_sample_threshold: number;
  is_validated: boolean;
  success_rate: number;
  confidence_score: number;
  updated_at: string;
}

interface GrowthLog {
  id: string;
  tenant_id: string;
  skill_name: string;
  previous_confidence: number;
  new_confidence: number;
  trigger_event: string;
  reason: string;
  delta: number;
  delta_confidence: number;
  outcome_id?: string;
  created_at: string;
}

export function AdminConsoleMfa() {
  const [mfaStatus, setMfaStatus] = useState<'locked' | 'awaiting_totp' | 'authenticated'>('locked');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Admin Dashboard Tabs
  const [activeTab, setActiveTab] = useState<'providers' | 'mcp' | 'tenants' | 'orchestration' | 'learning' | 'financial' | 'integrations' | 'blueprints' | 'tokenopt'>('providers');

  // Continuous Learning States
  const [outcomes, setOutcomes] = useState<DecisionOutcome[]>([]);
  const [confidences, setConfidences] = useState<SkillConfidence[]>([]);
  const [lessons, setLessons] = useState<LessonLearned[]>([]);
  const [growthLogs, setGrowthLogs] = useState<GrowthLog[]>([]);
  const [loadingLearning, setLoadingLearning] = useState(false);
  const [learningSubTab, setLearningSubTab] = useState<'skills' | 'lessons' | 'outcomes' | 'growth'>('skills');

  // Live Data States
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Workflow Dispatcher State
  const [testIntent, setTestIntent] = useState('Tolong buatkan tugas follow up klien Bapak Budi Santoso via WhatsApp');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<any>(null);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);

  // Fetch Providers
  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch('/api/v1/admin/llm-providers', {
        headers: { 'X-User-Roles': 'SUPER_ADMIN', 'X-MFA-Verified': 'true' }
      });
      const data = await res.json();
      if (data.providers) setProviders(data.providers);
    } catch (e) {
      console.error('Fetch providers error:', e);
    } finally {
      setLoadingProviders(false);
    }
  };

  // Fetch Tools
  const fetchTools = async () => {
    setLoadingTools(true);
    try {
      const res = await fetch('/api/v1/admin/mcp-tools');
      const data = await res.json();
      if (data.tools) setTools(data.tools);
    } catch (e) {
      console.error('Fetch tools error:', e);
    } finally {
      setLoadingTools(false);
    }
  };

  // Fetch Tenants
  const fetchTenants = async () => {
    setLoadingTenants(true);
    try {
      const res = await fetch('/api/v1/admin/tenants');
      const data = await res.json();
      if (Array.isArray(data)) {
        setTenants(data);
        if (data.length > 0 && !selectedTenantId) {
          setSelectedTenantId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Fetch tenants error:', e);
    } finally {
      setLoadingTenants(false);
    }
  };

  // Fetch Executions
  const fetchExecutions = async (tid: string) => {
    try {
      const res = await fetch(`/api/v1/orchestration/executions?tenant_id=${tid}`);
      const data = await res.json();
      if (Array.isArray(data)) setExecutions(data);
    } catch (e) {
      console.error('Fetch executions error:', e);
    }
  };

  // Fetch Continuous Learning
  const fetchLearningData = async (tid: string) => {
    setLoadingLearning(true);
    try {
      const [resOutcomes, resConf, resLessons, resGrowth] = await Promise.all([
        fetch(`/api/v1/learning/outcomes?tenant_id=${tid}`),
        fetch(`/api/v1/learning/confidence?tenant_id=${tid}`),
        fetch(`/api/v1/learning/lessons?tenant_id=${tid}`),
        fetch(`/api/v1/learning/growth?tenant_id=${tid}`),
      ]);
      const [dataOutcomes, dataConf, dataLessons, dataGrowth] = await Promise.all([
        resOutcomes.json(),
        resConf.json(),
        resLessons.json(),
        resGrowth.json(),
      ]);
      if (Array.isArray(dataOutcomes)) setOutcomes(dataOutcomes);
      if (Array.isArray(dataConf)) setConfidences(dataConf);
      if (Array.isArray(dataLessons)) setLessons(dataLessons);
      if (Array.isArray(dataGrowth)) setGrowthLogs(dataGrowth);
    } catch (e) {
      console.error('Fetch learning data error:', e);
    } finally {
      setLoadingLearning(false);
    }
  };

  // Dispatch Test Workflow
  const handleDispatchTest = async () => {
    if (!testIntent.trim()) return;
    setDispatchLoading(true);
    setDispatchResult(null);
    try {
      const res = await fetch('/api/v1/orchestration/workflows/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Roles': 'SUPER_ADMIN',
          'X-User-Capabilities': 'workflow.dispatch,workflow.node.execute,mcp.tool.invoke',
          'X-MFA-Verified': 'true',
        },
        body: JSON.stringify({
          tenant_id: selectedTenantId,
          intent_text: testIntent.trim(),
        }),
      });
      const data = await res.json();
      setDispatchResult(data);
      await fetchExecutions(selectedTenantId);
      await fetchLearningData(selectedTenantId);
    } catch (e: any) {
      setDispatchResult({ status: 'failed', error_message: e.message || String(e) });
    } finally {
      setDispatchLoading(false);
    }
  };

  useEffect(() => {
    if (mfaStatus === 'authenticated') {
      fetchProviders();
      fetchTools();
      fetchTenants();
      fetchExecutions(selectedTenantId);
      fetchLearningData(selectedTenantId);
    }
  }, [mfaStatus, selectedTenantId]);

  const handleInitialLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword.trim()) {
      setErrorMessage('Email dan kata sandi wajib diisi.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    setTimeout(() => {
      setIsLoading(false);
      setMfaStatus('awaiting_totp');
    }, 400);
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.trim().length !== 6) {
      setErrorMessage('Kode verifikasi TOTP harus terdiri dari 6 angka.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const mfaEndpoint = '/api/v1/console-sec-auth/mfa-verify';
      const response = await fetch(mfaEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: totpCode.trim(),
          user_id: 'sec-admin-' + crypto.randomUUID().slice(0, 8),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verifikasi MFA gagal.');
      }

      setSessionToken(data.session_token);
      setMfaStatus('authenticated');
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setMfaStatus('locked');
    setAdminEmail('');
    setAdminPassword('');
    setTotpCode('');
    setSessionToken(null);
    setErrorMessage(null);
  };

  return (
    <div id="admin-mfa-container" className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Keadaan 1: Formulir Masuk Super Admin */}
      {mfaStatus === 'locked' && (
        <div id="admin-login-card" className="max-w-md mx-auto py-8">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Konsol Super Admin
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Akses level sistem dengan kontrol PDP terpadu & MFA AAL2.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleInitialLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Super Administrator
                </label>
                <input
                  type="email"
                  id="admin-input-email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kata Sandi Kunci Master
                </label>
                <input
                  type="password"
                  id="admin-input-password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  id="btn-admin-login-step1"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  <span>Lanjutkan ke Verifikasi Dua Faktor</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Keadaan 2: Verifikasi Wajib MFA (TOTP) */}
      {mfaStatus === 'awaiting_totp' && (
        <div id="admin-totp-card" className="max-w-md mx-auto py-8">
          <div className="p-6 rounded-2xl border border-blue-500/30 bg-white dark:bg-slate-900/60 shadow-lg space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-500 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Verifikasi Autentikasi Dua Faktor
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Masukkan 6 digit kode dari aplikasi autentikator terdaftar (AAL2).
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleVerifyTotp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 text-center">
                  Kode TOTP (6 Digit)
                </label>
                <input
                  type="text"
                  id="admin-input-totp"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center font-mono text-2xl font-extrabold tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  required
                />
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  id="btn-admin-verify-totp"
                  disabled={isLoading || totpCode.length !== 6}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Verifikasi & Buka Konsol</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMfaStatus('locked')}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Keadaan 3: Konsol Terautentikasi (Super Admin Aktif) */}
      {mfaStatus === 'authenticated' && (
        <div id="admin-authenticated-console" className="space-y-6">
          {/* Header Bar */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Sesi Super Admin Aktif
                  </h2>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    MFA Lolos (AAL2)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  Sesi Kriptografis: {sessionToken?.slice(0, 24)}...
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLogout}
                className="px-3.5 py-2 rounded-xl border border-red-500/20 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Sesi Aman</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto">
            <button
              onClick={() => setActiveTab('providers')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'providers'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <Brain className="w-4 h-4" />
              <span>Kesehatan & Perutean Model AI</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {providers.filter((p) => p.health_status === 'healthy').length}/4
              </span>
            </button>

            <button
              onClick={() => setActiveTab('mcp')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'mcp'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Katalog F.01-MCP Tools</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {tools.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('orchestration')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'orchestration'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Dispatcher & Eksekusi Otonom</span>
            </button>

            <button
              onClick={() => setActiveTab('tenants')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'tenants'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Direktori Tenant ({tenants.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('learning');
                fetchLearningData(selectedTenantId);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'learning'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Continuous Learning Engine</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {confidences.length} Skills
              </span>
            </button>

            <button
              onClick={() => setActiveTab('financial')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'financial'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Financial Command Center</span>
            </button>

            <button
              onClick={() => setActiveTab('integrations')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'integrations'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <Share2 className="w-4 h-4" />
              <span>Integrasi & Observasi</span>
            </button>

            <button
              onClick={() => setActiveTab('blueprints')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'blueprints'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Katalog Blueprint Agen (F.01-AGENTCAT)</span>
            </button>

            <button
              onClick={() => setActiveTab('tokenopt')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'tokenopt'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Optimasi Token (F.01-TOKENOPT)</span>
            </button>
          </div>

          {/* TAB 1: Multi-LLM Provider Health */}
          {activeTab === 'providers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Pemantauan Adapter Model Router & Health
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Routing otomatis dengan fallback chain: NVIDIA NIM → OpenRouter → Gemini.
                  </p>
                </div>
                <button
                  onClick={fetchProviders}
                  disabled={loadingProviders}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingProviders ? 'animate-spin' : ''}`} />
                  <span>Cek Kesehatan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                          <Server className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900 dark:text-white">
                            {p.display_name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            ID: {p.id}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          p.health_status === 'healthy'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-500 border border-red-500/20'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            p.health_status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        />
                        {p.health_status.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Latensi Probe</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          {p.latency_ms} ms
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Status Endpoint</span>
                        <span className="text-emerald-500 font-medium">Terhubung</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: F.01-MCP Tools */}
          {activeTab === 'mcp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Tata Kelola Katalog Alat F.01-MCP Terverifikasi
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Setiap pemanggilan perkakas diautentikasi oleh PDP authorize() dan dicatat di tabel tool_invocations.
                  </p>
                </div>
                <button
                  onClick={fetchTools}
                  disabled={loadingTools}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTools ? 'animate-spin' : ''}`} />
                  <span>Segarkan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tools.map((t) => (
                  <div
                    key={t.id}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20">
                          {t.category}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${
                            t.risk_tier === 'low'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          Risk: {t.risk_tier}
                        </span>
                      </div>
                      <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {t.tool_name}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {t.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-1 text-[11px]">
                      <div className="text-slate-400 font-mono text-[10px]">
                        PDP Action: mcp.tool.invoke
                      </div>
                      <div className="text-emerald-500 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Audit Log Diaktifkan</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Workflow Dispatcher & Executions */}
          {activeTab === 'orchestration' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Uji Pemicuan Alur Kerja Otonom Realtime
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Menjalankan graf node (CLASSIFY → PLAN → TOOL_CALL → DELIVER) dengan durable checkpointing di PostgreSQL.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Teks Intent Pengguna / Perintah Bisnis
                    </label>
                    <input
                      type="text"
                      value={testIntent}
                      onChange={(e) => setTestIntent(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Target Tenant ID
                    </label>
                    <input
                      type="text"
                      value={selectedTenantId}
                      onChange={(e) => setSelectedTenantId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={handleDispatchTest}
                  disabled={dispatchLoading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {dispatchLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  <span>Jalankan Dispatch Workflow</span>
                </button>
              </div>

              {/* Dispatch Live Output */}
              {dispatchResult && (
                <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Eksekusi Berhasil Selesai (Durable Checkpoint Tersimpan)</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      ID: {dispatchResult.execution_id}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs py-2 overflow-x-auto">
                    {dispatchResult.nodes_executed?.map((nodeKey: string, i: number) => (
                      <React.Fragment key={nodeKey}>
                        <div className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono text-[11px] border border-emerald-500/30 flex items-center gap-1.5">
                          <Check className="w-3 h-3" />
                          <span>{nodeKey}</span>
                        </div>
                        {i < dispatchResult.nodes_executed.length - 1 && (
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto">
                    <pre>{JSON.stringify(dispatchResult.output_payload, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* History Executions */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Riwayat Eksekusi Workflow di Database ({executions.length})
                </h4>
                <div className="space-y-2">
                  {executions.map((ex) => (
                    <div
                      key={ex.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {ex.intent_text}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {ex.id} • Dibuat: {new Date(ex.created_at).toLocaleString('id-ID')}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {ex.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Tenant Directory */}
          {activeTab === 'tenants' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Direktori Seluruh Penyewa (Multi-Tenant Isolation)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Setiap entitas terisolasi secara ketat oleh skema RLS ENABLE + FORCE.
                  </p>
                </div>
                <button
                  onClick={fetchTenants}
                  disabled={loadingTenants}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTenants ? 'animate-spin' : ''}`} />
                  <span>Segarkan</span>
                </button>
              </div>

              <div className="space-y-2">
                {tenants.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {t.legal_name || t.display_name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Tenant ID: {t.id}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded-md text-[10px] uppercase font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {t.status || 'Active'}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedTenantId(t.id);
                          setActiveTab('orchestration');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white transition-colors text-[11px] font-semibold"
                      >
                        Uji Dispatch
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: Continuous Learning */}
          {activeTab === 'learning' && (
            <div className="space-y-6">
              {/* Header Info & Actions */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-500" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Mesin Pembelajaran Berkelanjutan Berbasis Evaluasi
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      Aktif di Setiap Node Run
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Verifikasi objektif runtime tanpa halusinasi, model keyakinan (confidence) time-decay (half-life 14 hari), dan sintesis lesson learned tervalidasi.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedTenantId}
                    onChange={(e) => {
                      setSelectedTenantId(e.target.value);
                      fetchLearningData(e.target.value);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-700 dark:text-slate-300"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.display_name || t.legal_name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => fetchLearningData(selectedTenantId)}
                    disabled={loadingLearning}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLearning ? 'animate-spin' : ''}`} />
                    <span>Segarkan</span>
                  </button>
                </div>
              </div>

              {/* Bento Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-medium">Outcome Objektif</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">
                    {outcomes.length}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {outcomes.filter((o) => o.objective_success).length} Terverifikasi Sukses ({outcomes.length > 0 ? Math.round((outcomes.filter((o) => o.objective_success).length / outcomes.length) * 100) : 0}%)
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-medium">Model Keyakinan Skill</span>
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">
                    {confidences.length}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Rata-rata: {confidences.length > 0 ? (confidences.reduce((acc, c) => acc + Number(c.confidence_score), 0) / confidences.length * 100).toFixed(1) : 0}% (Half-Life 14d)
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-medium">Lesson Learned</span>
                    <Award className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">
                    {lessons.length}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {lessons.filter((l) => l.is_validated).length} Tervalidasi (≥3 Sampel)
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-medium">Ledger Pertumbuhan</span>
                    <History className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">
                    {growthLogs.length}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Audit log delta kepercayaan
                  </div>
                </div>
              </div>

              {/* Sub-tab Navigation */}
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                <button
                  onClick={() => setLearningSubTab('skills')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    learningSubTab === 'skills'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Keyakinan Skill ({confidences.length})</span>
                </button>

                <button
                  onClick={() => setLearningSubTab('lessons')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    learningSubTab === 'lessons'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Lesson Learned ({lessons.length})</span>
                </button>

                <button
                  onClick={() => setLearningSubTab('outcomes')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    learningSubTab === 'outcomes'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Riwayat Outcome Objektif ({outcomes.length})</span>
                </button>

                <button
                  onClick={() => setLearningSubTab('growth')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    learningSubTab === 'growth'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Audit Pertumbuhan ({growthLogs.length})</span>
                </button>
              </div>

              {/* Sub-tab 1: Skill Confidence */}
              {learningSubTab === 'skills' && (
                <div className="space-y-3">
                  {confidences.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                      Belum ada data keyakinan skill untuk tenant ini. Jalankan workflow di tab "Dispatcher & Eksekusi Otonom" untuk memicu pembelajaran otomatis.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {confidences.map((c) => {
                        const score = Number(c.confidence_score);
                        const pct = Math.round(score * 100);
                        const total = Number(c.total_invocations || 0);
                        const succ = Number(c.successful_invocations || 0);
                        const succPct = total > 0 ? Math.round((succ / total) * 100) : 0;
                        return (
                          <div
                            key={c.id || c.skill_name}
                            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                                  {c.skill_name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Key: {c.skill_key || c.skill_name}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                {pct}% Keyakinan
                              </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="space-y-1">
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    score >= 0.8
                                      ? 'bg-emerald-500'
                                      : score >= 0.6
                                      ? 'bg-blue-500'
                                      : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(5, pct))}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>Tingkat Sukses: {succPct}% ({succ}/{total} invokasi)</span>
                                <span>Half-life: 14 hari</span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                              <span>Gagal: {c.failed_invocations || 0}</span>
                              <span>Pembaruan: {new Date(c.last_updated_at).toLocaleTimeString('id-ID')}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 2: Lessons Learned */}
              {learningSubTab === 'lessons' && (
                <div className="space-y-3">
                  {lessons.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                      Belum ada pelajaran yang disintesis. Dibutuhkan minimal 3 sampel eksekusi untuk setiap skill agar validasi empiris terpenuhi.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lessons.map((l) => (
                        <div
                          key={l.id}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                {l.skill_name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  l.lesson_type === 'BEST_PRACTICE'
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    : l.lesson_type === 'PITFALL_AVOIDANCE'
                                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                    : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                }`}
                              >
                                {l.lesson_type}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {l.is_validated ? (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Tervalidasi ({l.sample_size} sampel)</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Observasi ({l.sample_size}/{l.min_sample_threshold || 3} sampel)</span>
                                </span>
                              )}
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                Sukses: {Math.round(Number(l.success_rate || 0) * 100)}%
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80 font-sans">
                            {l.lesson_summary}
                          </p>

                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Konteks Pattern: {l.context_pattern}</span>
                            <span>Diperbarui: {new Date(l.updated_at).toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 3: Decision Outcomes */}
              {learningSubTab === 'outcomes' && (
                <div className="space-y-3">
                  {outcomes.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                      Belum ada outcome tercatat. Jalankan workflow di tab "Dispatcher & Eksekusi Otonom" untuk merekam keputusan.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px] font-semibold">
                          <tr>
                            <th className="p-3">Waktu</th>
                            <th className="p-3">Node / Decision</th>
                            <th className="p-3">Status Objektif</th>
                            <th className="p-3">Verifikasi Sistem</th>
                            <th className="p-3">Keyakinan</th>
                            <th className="p-3">Latensi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900/60">
                          {outcomes.map((o) => (
                            <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                              <td className="p-3 text-[11px] text-slate-400 font-mono whitespace-nowrap">
                                {new Date(o.created_at).toLocaleTimeString('id-ID')}
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">
                                  {o.node_key}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {o.decision_type}
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                    o.objective_success
                                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                      : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                  }`}
                                >
                                  {o.objective_success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                  <span>{o.objective_outcome}</span>
                                </span>
                              </td>
                              <td className="p-3 text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                                {o.verification_source || 'system_check'}
                              </td>
                              <td className="p-3 font-mono text-[11px]">
                                {Math.round(Number(o.confidence_score) * 100)}%
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-400">
                                {o.evaluation_metrics?.latency_ms ? `${o.evaluation_metrics.latency_ms} ms` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 4: Growth Logs */}
              {learningSubTab === 'growth' && (
                <div className="space-y-3">
                  {growthLogs.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                      Belum ada mutasi keyakinan yang tercatat di audit ledger.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {growthLogs.map((g) => {
                        const delta = Number(g.delta || g.delta_confidence || 0);
                        const isPositive = delta >= 0;
                        return (
                          <div
                            key={g.id}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 dark:text-white">
                                  {g.skill_name}
                                </span>
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  {g.trigger_event}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {g.reason}
                              </div>
                            </div>

                            <div className="text-right space-y-0.5">
                              <span
                                className={`inline-block font-mono font-bold text-xs px-2 py-0.5 rounded ${
                                  isPositive
                                    ? 'bg-emerald-500/10 text-emerald-500'
                                    : 'bg-rose-500/10 text-rose-500'
                                }`}
                              >
                                {isPositive ? `+${delta.toFixed(4)}` : delta.toFixed(4)}
                              </span>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {(Number(g.previous_confidence) * 100).toFixed(1)}% → {(Number(g.new_confidence) * 100).toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: Financial Command Center */}
          {activeTab === 'financial' && (
            <FinancialCommandCenter />
          )}

          {/* TAB 7: Third-Party Integrations & Observability */}
          {activeTab === 'integrations' && (
            <div className="pt-2">
              <IntegrationsHubScreen
                tenant={{
                  tenant_id: selectedTenantId,
                  legal_name: 'PT Orchestree Enterprise Multi-Tenant',
                  display_name: 'Super Admin Console',
                  role: 'SUPER_ADMIN',
                } as any}
                defaultCategory="all"
              />
            </div>
          )}

          {/* TAB 8: F.01-AGENTCAT Managed Blueprint Catalog */}
          {activeTab === 'blueprints' && (
            <div className="pt-2">
              <AgentBlueprintCatalogScreen
                tenantId={selectedTenantId}
                isSuperAdmin={true}
              />
            </div>
          )}

          {/* TAB 9: F.01-TOKENOPT Token Optimization & Semantic Cache */}
          {activeTab === 'tokenopt' && (
            <div className="pt-2">
              <TokenOptimizationScreen
                tenantId={selectedTenantId}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
