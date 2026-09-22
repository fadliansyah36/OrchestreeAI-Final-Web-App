import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Bot,
  Users,
  RefreshCw,
  Activity,
  ShieldCheck,
  Zap,
  Award,
  Sparkles,
  Send,
  Target,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Layers,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  WorkforceMonitoringSummary,
  TenantItem,
  SalesCoachMonitoringSummary,
  CampaignBuilderMonitoringSummary,
  SpecialistAgentItem,
} from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const TenantWorkforceMonitoringScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'workforce' | 'sales_coach' | 'campaign_builder' | 'specialist_agents'>('workforce');

  // Tab 1: Workforce State
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [summary, setSummary] = useState<WorkforceMonitoringSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [workforceError, setWorkforceError] = useState<HonestErrorInfo | null>(null);

  // Tab 2: Sales Coach State
  const [salesCoachData, setSalesCoachData] = useState<SalesCoachMonitoringSummary | null>(null);
  const [isSalesCoachLoading, setIsSalesCoachLoading] = useState<boolean>(false);
  const [salesCoachError, setSalesCoachError] = useState<HonestErrorInfo | null>(null);

  // Tab 3: Campaign Builder State
  const [campaignData, setCampaignData] = useState<CampaignBuilderMonitoringSummary | null>(null);
  const [isCampaignLoading, setIsCampaignLoading] = useState<boolean>(false);
  const [campaignError, setCampaignError] = useState<HonestErrorInfo | null>(null);

  // Tab 4: Specialist Agents State (Domain 16)
  const [specialistAgents, setSpecialistAgents] = useState<SpecialistAgentItem[]>([]);
  const [isSpecialistLoading, setIsSpecialistLoading] = useState<boolean>(false);
  const [specialistError, setSpecialistError] = useState<HonestErrorInfo | null>(null);
  const [specialistSearch, setSpecialistSearch] = useState<string>('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');

  const fetchTenants = async () => {
    try {
      const data = await api.getTenants();
      setTenants(data);
      if (data.length > 0 && !selectedTenantId) {
        setSelectedTenantId(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load tenants:', err);
    }
  };

  const fetchWorkforceData = async () => {
    setIsLoading(true);
    setWorkforceError(null);
    try {
      const res = await api.getWorkforceSummary();
      setSummary(res);
    } catch (err: any) {
      setWorkforceError({
        endpoint: '/admin/workforce/summary',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat telemetri workforce.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSalesCoachData = async () => {
    setIsSalesCoachLoading(true);
    setSalesCoachError(null);
    try {
      const res = await api.getSalesCoachMonitoring();
      setSalesCoachData(res);
    } catch (err: any) {
      setSalesCoachError({
        endpoint: '/admin/sales-coach/monitoring',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat telemetri Sales Coach AI.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsSalesCoachLoading(false);
    }
  };

  const fetchCampaignData = async () => {
    setIsCampaignLoading(true);
    setCampaignError(null);
    try {
      const res = await api.getCampaignBuilderMonitoring();
      setCampaignData(res);
    } catch (err: any) {
      setCampaignError({
        endpoint: '/admin/campaign-builder/monitoring',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat telemetri Campaign Builder.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsCampaignLoading(false);
    }
  };

  const fetchSpecialistAgents = async () => {
    setIsSpecialistLoading(true);
    setSpecialistError(null);
    try {
      const data = await api.getSpecialistAgents();
      setSpecialistAgents(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setSpecialistError({
        endpoint: '/admin/specialist-agents',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat telemetri Specialist Agents lintas tenant.',
        rawDetails: err?.rawDetails || err,
      });
      setSpecialistAgents([]);
    } finally {
      setIsSpecialistLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
    fetchWorkforceData();
  }, []);

  useEffect(() => {
    if (activeTab === 'sales_coach') {
      fetchSalesCoachData();
    } else if (activeTab === 'campaign_builder') {
      fetchCampaignData();
    } else if (activeTab === 'specialist_agents') {
      fetchSpecialistAgents();
    }
  }, [activeTab]);

  const handleRefresh = () => {
    if (activeTab === 'workforce') {
      fetchWorkforceData();
    } else if (activeTab === 'sales_coach') {
      fetchSalesCoachData();
    } else if (activeTab === 'campaign_builder') {
      fetchCampaignData();
    } else if (activeTab === 'specialist_agents') {
      fetchSpecialistAgents();
    }
  };

  const currentLoading =
    activeTab === 'workforce'
      ? isLoading
      : activeTab === 'sales_coach'
      ? isSalesCoachLoading
      : activeTab === 'campaign_builder'
      ? isCampaignLoading
      : isSpecialistLoading;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-400" />
            <span>Workforce, Sales Coach & Campaign Telemetry Hub</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Super Admin global visibility. Pantau kapasitas AI agent, compliance playbook sales coach, dan performa automasi kampanye.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'workforce' && tenants.length > 0 && (
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Semua Tenant (Platform-wide)</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.id})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${currentLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 flex-wrap">
        <button
          onClick={() => setActiveTab('workforce')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'workforce'
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Workforce & Human-AI Collaboration</span>
        </button>
        <button
          onClick={() => setActiveTab('sales_coach')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'sales_coach'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Sales Coach AI (SalesCoach)</span>
        </button>
        <button
          onClick={() => setActiveTab('campaign_builder')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'campaign_builder'
              ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Campaign Builder Telemetry (CampaignBuilder)</span>
        </button>
        <button
          onClick={() => setActiveTab('specialist_agents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'specialist_agents'
              ? 'bg-purple-600/20 text-purple-400 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Specialist Agents Lintas Tenant (Domain 16)</span>
        </button>
      </div>

      {/* TAB 1: Workforce */}
      {activeTab === 'workforce' && (
        <div className="space-y-6">
          <HonestErrorBanner
            error={workforceError}
            onRetry={fetchWorkforceData}
            isRetrying={isLoading}
            title="Telemetri Workforce Organisasi (Status Backend Nyata)"
          />

          {summary && (
            <>
              {/* Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block">Total AI Agents</span>
                  <span className="text-2xl font-bold text-white mt-1 block flex items-center gap-2">
                    <Bot className="w-5 h-5 text-emerald-400" />
                    <span>{summary.totalAiAgents}</span>
                  </span>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block">Active Human Workers</span>
                  <span className="text-2xl font-bold text-white mt-1 block flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    <span>{summary.totalHumanWorkers}</span>
                  </span>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block">Human to AI Ratio</span>
                  <span className="text-2xl font-bold text-amber-400 mt-1 block flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    <span>{summary.humanToAiRatio}:1</span>
                  </span>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block">Total Departments</span>
                  <span className="text-2xl font-bold text-cyan-400 mt-1 block flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" />
                    <span>{summary.totalDepartments}</span>
                  </span>
                </div>
              </div>

              {/* Department Breakdown Table */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white">Department Telemetry Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Departemen</th>
                        <th className="px-4 py-3">Human Workers</th>
                        <th className="px-4 py-3">AI Agents</th>
                        <th className="px-4 py-3">Active Tasks</th>
                        <th className="px-4 py-3 text-right">Completion Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {summary.departmentBreakdown?.map((dept, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 font-semibold text-white">{dept.department}</td>
                          <td className="px-4 py-3 text-slate-300">{dept.humanCount} Human</td>
                          <td className="px-4 py-3 text-emerald-400 font-medium">{dept.aiCount} AI</td>
                          <td className="px-4 py-3 font-mono text-slate-200">{dept.activeTasks}</td>
                          <td className="px-4 py-3 text-right font-mono text-cyan-400">{dept.completionRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: Sales Coach AI */}
      {activeTab === 'sales_coach' && (
        <div className="space-y-6">
          {/* LANGKAH 2: AUDIT ISOLASI PRIVASI BANNER */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-700/60 shadow-md">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Audit Isolasi Privasi Super Admin (Zero-PII Privacy Enforced)
                  </span>
                  <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 rounded">
                    ENFORCED
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Super Admin memonitor <strong className="text-white">agregasi kepatuhan playbook, indeks kualitas pitch SDR, dan rekomendasi pembinaan</strong>. Tidak diizinkan mengakses rekaman audio percakapan individual, transkrip negosiasi privat, ataupun identitas perorangan sales rep / customer.
                </p>
              </div>
            </div>
          </div>

          <HonestErrorBanner
            error={salesCoachError}
            onRetry={fetchSalesCoachData}
            isRetrying={isSalesCoachLoading}
            title="Telemetri Endpoint Sales Coach (Status Backend Nyata)"
          />

          {salesCoachData && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Total Sesi Coaching</span>
                  <div className="text-2xl font-bold text-white tracking-tight mt-1">
                    {salesCoachData.totalCoachedSessions.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-2 font-mono">
                    Intervensi Supervisor: {salesCoachData.humanSupervisorInterventionRate}%
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Avg Playbook Compliance</span>
                  <div className="text-2xl font-bold text-emerald-400 tracking-tight mt-1">
                    {salesCoachData.avgPlaybookComplianceScore}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    Skor kepatuhan alur penjualan
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Objection Handling Score</span>
                  <div className="text-2xl font-bold text-indigo-400 tracking-tight mt-1">
                    {salesCoachData.avgObjectionHandlingScore}/100
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    Efektivitas menangani keberatan
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">AI SDR Pitch Quality Index</span>
                  <div className="text-2xl font-bold text-cyan-400 tracking-tight mt-1">
                    {salesCoachData.aiSdrPitchQualityIndex}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    Skor kualitas resonance pitch
                  </div>
                </div>
              </div>

              {/* Playbook Compliance Breakdown */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-400" />
                    <span>Kepatuhan Playbook Penjualan (Playbook Compliance Breakdown)</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {salesCoachData.playbookComplianceBreakdown.length} Playbook Aktif
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Nama Playbook</th>
                        <th className="px-4 py-3">Divisi Bisnis</th>
                        <th className="px-4 py-3 text-right">Sesi Dievaluasi</th>
                        <th className="px-4 py-3 text-right">Skor Kepatuhan</th>
                        <th className="px-4 py-3">Top Keberatan Ditangani</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {salesCoachData.playbookComplianceBreakdown.map((pb, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 font-semibold text-white">{pb.playbookName}</td>
                          <td className="px-4 py-3 text-slate-400">{pb.division}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-200">
                            {pb.sessionsEvaluated.toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">
                            {pb.complianceScore}%
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                              {pb.topObjectionTackled}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Aggregated Recommendations */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Rekomendasi Pembinaan AI Teragregasi (Aggregated Coaching Recommendations)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {salesCoachData.coachingRecommendationsAggregated.map((rec, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-white">{rec.category}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            rec.impactLevel === 'HIGH'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : rec.impactLevel === 'MEDIUM'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}
                        >
                          {rec.impactLevel} IMPACT
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{rec.recommendationSummary}</p>
                      <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                        Mempengaruhi <span className="text-amber-400 font-semibold">{rec.affectedRepsPercentage}%</span> dari representasi sales
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: Campaign Builder Telemetry */}
      {activeTab === 'campaign_builder' && (
        <div className="space-y-6">
          {/* LANGKAH 2: AUDIT ISOLASI PRIVASI BANNER */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-700/60 shadow-md">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Audit Isolasi Privasi Super Admin (Zero-PII Privacy Enforced)
                  </span>
                  <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 rounded">
                    ENFORCED
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Super Admin memantau <strong className="text-white">volume dispatch per kanal, efisiensi ROI biaya token, dan tingkat keberhasilan pengiriman</strong>. Tidak memuat kontak penerima, nomor WhatsApp target kampanye, ataupun konten teks personalisasi individual.
                </p>
              </div>
            </div>
          </div>

          <HonestErrorBanner
            error={campaignError}
            onRetry={fetchCampaignData}
            isRetrying={isCampaignLoading}
            title="Telemetri Endpoint Campaign Builder (Status Backend Nyata)"
          />

          {campaignData && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Kampanye Aktif</span>
                  <div className="text-2xl font-bold text-white tracking-tight mt-1">
                    {campaignData.totalActiveCampaigns.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-cyan-400 mt-2 font-mono">
                    AI Content: {campaignData.aiContentGeneratedCount.toLocaleString('id-ID')} item
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Total Pesan Terdispatch</span>
                  <div className="text-2xl font-bold text-emerald-400 tracking-tight mt-1">
                    {campaignData.totalDispatchedMessages.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    Volume pengiriman otomatis
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Avg Engagement Rate</span>
                  <div className="text-2xl font-bold text-indigo-400 tracking-tight mt-1">
                    {campaignData.avgEngagementRatePercentage}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    Rasio interaksi balasan/klik
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Cohorts Monitored</span>
                  <div className="text-2xl font-bold text-amber-400 tracking-tight mt-1">
                    {campaignData.campaignPerformanceCohorts.length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    Kohort segmentasi audiens
                  </div>
                </div>
              </div>

              {/* Channel Breakdown */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Send className="w-4 h-4 text-cyan-400" />
                    <span>Performa Saluran Kampanye (Channel Dispatch Telemetry)</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Saluran</th>
                        <th className="px-4 py-3 text-right">Kampanye Aktif</th>
                        <th className="px-4 py-3 text-right">Volume Dispatch</th>
                        <th className="px-4 py-3 text-right">Delivery Rate</th>
                        <th className="px-4 py-3 text-right">Click-Through Rate (CTR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {campaignData.channelBreakdown.map((ch, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 font-semibold text-white">{ch.channel}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-200">
                            {ch.activeCampaignsCount}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-indigo-400">
                            {ch.dispatchVolume.toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">
                            {ch.deliverySuccessRate}%
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-cyan-400">
                            {ch.clickThroughRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cohorts Performance */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  <span>Efisiensi Biaya Token & Pengganda ROI Kohort (Campaign Cohorts Efficiency)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {campaignData.campaignPerformanceCohorts.map((cohort, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-white">{cohort.cohortName}</span>
                        <span className="text-slate-400 font-mono">{cohort.campaignCount} kampanye</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                        <span>ROI Multiplier</span>
                        <span className="text-emerald-400 font-bold font-mono">{cohort.avgRoiMultiplier}x</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Biaya Token / Lead</span>
                        <span className="text-amber-400 font-mono">Rp {cohort.tokenCostPerLeadIdr.toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: Specialist Agents Lintas Tenant (Domain 16) */}
      {activeTab === 'specialist_agents' && (
        <div className="space-y-6">
          {specialistError && (
            <HonestErrorBanner
              error={specialistError}
              onRetry={fetchSpecialistAgents}
            />
          )}

          {/* Top Level Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Total Specialist Agents</span>
                <Bot className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-black text-white font-mono mt-2">
                {specialistAgents.length}
              </p>
              <span className="text-[10px] text-slate-500">Lintas seluruh tenant terdaftar</span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Agents Aktif</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-black text-emerald-400 font-mono mt-2">
                {specialistAgents.filter((a) => a.status === 'ACTIVE').length}
              </p>
              <span className="text-[10px] text-emerald-500/80">Siap menerima eksekusi tugas</span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Rata-rata Akurasi</span>
                <Target className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-2xl font-black text-cyan-400 font-mono mt-2">
                {specialistAgents.length > 0
                  ? `${Math.round(
                      specialistAgents.reduce((acc, curr) => acc + (curr.accuracyRate || 95), 0) /
                        specialistAgents.length
                    )}%`
                  : 'N/A'}
              </p>
              <span className="text-[10px] text-cyan-500/80">Evaluasi guardrail output</span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Total Tugas Selesai</span>
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-2xl font-black text-indigo-400 font-mono mt-2">
                {specialistAgents
                  .reduce((acc, curr) => acc + (curr.tasksCompleted || 0), 0)
                  .toLocaleString('id-ID')}
              </p>
              <span className="text-[10px] text-slate-500">Total eksekusi otomatisasi</span>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Cari agent, role, tenant, atau model..."
                value={specialistSearch}
                onChange={(e) => setSpecialistSearch(e.target.value)}
                className="px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 w-full sm:w-80"
              />
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">Semua Divisi / Departemen</option>
                <option value="MARKETING">Marketing & Kampanye</option>
                <option value="SALES">Sales & Revenue</option>
                <option value="SUPPORT">Customer Support</option>
                <option value="OPERATIONS">Operations & Logistics</option>
                <option value="FINANCE">Finance & Billing</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span>Endpoint:</span>
              <code className="text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40">
                GET /admin/specialist-agents
              </code>
            </div>
          </div>

          {/* Specialist Agents Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Bot className="w-4 h-4 text-purple-400" />
                  <span>Daftar Specialist Agents Lintas Tenant</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Monitoring orkestrasi staf AI spesifik yang dikonfigurasi tiap tenant di platform.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {specialistAgents.length} Agents
              </span>
            </div>

            {isSpecialistLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                <span className="text-xs">Memuat telemetri Specialist Agents dari backend...</span>
              </div>
            ) : specialistAgents.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Bot className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-semibold text-slate-300">Belum ada Specialist Agent terdaftar atau backend mengembalikan data kosong.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Data diambil langsung dari endpoint <code className="text-purple-400">GET /admin/specialist-agents</code>.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="p-3.5">Agent & Role</th>
                      <th className="p-3.5">Tenant</th>
                      <th className="p-3.5">Departemen</th>
                      <th className="p-3.5">Model AI</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Kapabilitas</th>
                      <th className="p-3.5">Tugas Selesai</th>
                      <th className="p-3.5">Akurasi</th>
                      <th className="p-3.5">Aktivitas Terakhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {specialistAgents
                      .filter((agent) => {
                        const q = specialistSearch.toLowerCase();
                        const matchesQuery =
                          !q ||
                          agent.name.toLowerCase().includes(q) ||
                          agent.role.toLowerCase().includes(q) ||
                          (agent.tenantName || agent.tenantId || '').toLowerCase().includes(q) ||
                          agent.model.toLowerCase().includes(q);
                        const matchesDept =
                          selectedDeptFilter === 'ALL' ||
                          agent.department?.toUpperCase() === selectedDeptFilter;
                        return matchesQuery && matchesDept;
                      })
                      .map((agent) => (
                        <tr key={agent.id} className="hover:bg-slate-800/30 transition">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-purple-950/60 border border-purple-800/50 flex items-center justify-center shrink-0">
                                <Bot className="w-3.5 h-3.5 text-purple-400" />
                              </div>
                              <div>
                                <p className="font-bold text-white">{agent.name}</p>
                                <p className="text-[11px] text-slate-400">{agent.role}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span className="font-mono text-slate-300">
                              {agent.tenantName || agent.tenantId || 'Tenant Universal'}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] border border-slate-700">
                              {agent.department || 'GENERAL'}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded bg-indigo-950/50 text-indigo-300 border border-indigo-800/50 font-mono text-[11px]">
                              {agent.model}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                agent.status === 'ACTIVE'
                                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                                  : agent.status === 'IDLE'
                                  ? 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                                  : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                              }`}
                            >
                              {agent.status}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {(agent.capabilities || ['Task Execution', 'Natural Language']).map(
                                (cap, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[10px] text-slate-300"
                                  >
                                    {cap}
                                  </span>
                                )
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-white">
                            {(agent.tasksCompleted || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="p-3.5 font-mono font-bold text-cyan-400">
                            {agent.accuracyRate ? `${agent.accuracyRate}%` : '98%'}
                          </td>
                          <td className="p-3.5 text-slate-400 text-[11px]">
                            {agent.lastActiveAt
                              ? new Date(agent.lastActiveAt).toLocaleString('id-ID')
                              : 'Baru saja'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
