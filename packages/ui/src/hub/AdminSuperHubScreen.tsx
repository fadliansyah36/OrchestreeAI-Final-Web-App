'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Brain,
  Layers,
  TrendingUp,
  Briefcase,
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  RefreshCw,
  Plus,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Calendar,
  Lock,
  ArrowUpRight,
  Database,
  Cpu,
  BarChart3,
  DollarSign
} from 'lucide-react';
import { EmptyState } from '../feedback/EmptyState';
import { ErrorState } from '../feedback/ErrorState';
import { SkeletonLoader, HubAnalyticsSkeleton } from '../feedback/SkeletonLoader';

export type AdminHubTab =
  | 'overview'
  | 'tenants'
  | 'llm-routing'
  | 'mcp-governance'
  | 'usage-costs'
  | 'prospects-trial';

export interface AdminSuperHubScreenProps {
  initialTab?: AdminHubTab;
  apiBaseUrl?: string;
  onNavigate?: (tab: AdminHubTab) => void;
}

export function AdminSuperHubScreen({
  initialTab = 'overview',
  apiBaseUrl = '',
  onNavigate
}: AdminSuperHubScreenProps) {
  const [activeTab, setActiveTab] = useState<AdminHubTab>(initialTab);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [llmModels, setLlmModels] = useState<any[]>([]);
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [usageCosts, setUsageCosts] = useState<any>(null);
  const [prospects, setProspects] = useState<any[]>([]);
  const [trialSlots, setTrialSlots] = useState<any>(null);
  const [webIntegrityLogs, setWebIntegrityLogs] = useState<any[]>([]);

  // Filters & Action states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isAllocating, setIsAllocating] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal / Prompt State for Meeting & Activation
  const [selectedProspect, setSelectedProspect] = useState<any>(null);
  const [meetingDateInput, setMeetingDateInput] = useState('');
  const [meetingLinkInput, setMeetingLinkInput] = useState('');
  const [activationTenantInput, setActivationTenantInput] = useState('');

  const fetchOverview = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/admin/hub-overview`);
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch (e: any) {
      console.warn('Overview fetch error:', e);
    }
  };

  const fetchTabContent = async (tab: AdminHubTab) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (tab === 'overview') {
        await fetchOverview();
      } else if (tab === 'tenants') {
        const res = await fetch(`${apiBaseUrl}/api/v1/admin/tenants`);
        if (!res.ok) throw new Error('Gagal memuat data penyewa');
        const data = await res.json();
        setTenants(data.tenants || []);
      } else if (tab === 'llm-routing') {
        const res = await fetch(`${apiBaseUrl}/api/v1/admin/llm-models`);
        if (!res.ok) throw new Error('Gagal memuat aturan routing LLM');
        const data = await res.json();
        setLlmModels(data.models || []);
      } else if (tab === 'mcp-governance') {
        const res = await fetch(`${apiBaseUrl}/api/v1/admin/mcp-tools`);
        if (!res.ok) throw new Error('Gagal memuat alat MCP');
        const data = await res.json();
        setMcpTools(data.tools || []);
      } else if (tab === 'usage-costs') {
        const res = await fetch(`${apiBaseUrl}/api/v1/admin/usage-costs`);
        if (!res.ok) throw new Error('Gagal memuat metrik biaya');
        const data = await res.json();
        setUsageCosts(data);
      } else if (tab === 'prospects-trial') {
        const [pRes, sRes, lRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/v1/admin/prospects`),
          fetch(`${apiBaseUrl}/api/v1/admin/trial-slots`),
          fetch(`${apiBaseUrl}/api/v1/admin/web-integrity-logs?limit=10`)
        ]);
        if (pRes.ok) {
          const pData = await pRes.json();
          setProspects(pData.prospects || []);
        }
        if (sRes.ok) {
          const sData = await sRes.json();
          setTrialSlots(sData);
        }
        if (lRes.ok) {
          const lData = await lRes.json();
          setWebIntegrityLogs(lData || []);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTabContent(activeTab);
  }, [activeTab]);

  const handleTabChange = (tab: AdminHubTab) => {
    setActiveTab(tab);
    if (onNavigate) onNavigate(tab);
  };

  const handleAllocateSlot = async (prospectId: string) => {
    setIsAllocating(prospectId);
    setActionSuccess(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/admin/prospects/${prospectId}/select-trial`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengalokasikan slot');
      }
      setActionSuccess(`Slot #${data.allocation?.slotNumber} berhasil diamankan untuk prospek!`);
      fetchTabContent('prospects-trial');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsAllocating(null);
    }
  };

  const handleScheduleMeeting = async (prospectId: string) => {
    if (!meetingDateInput) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/admin/prospects/${prospectId}/schedule-meeting`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_date: meetingDateInput,
          meeting_link: meetingLinkInput || null
        })
      });
      if (!res.ok) throw new Error('Gagal menyimpan jadwal pertemuan');
      setActionSuccess('Pertemuan berhasil dijadwalkan.');
      setSelectedProspect(null);
      setMeetingDateInput('');
      setMeetingLinkInput('');
      fetchTabContent('prospects-trial');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleActivateTrial = async (prospectId: string) => {
    if (!activationTenantInput) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/admin/prospects/${prospectId}/activate-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: activationTenantInput,
          notes: 'Aktivasi resmi via Admin Super Hub'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal aktivasi');
      setActionSuccess('Uji coba resmi aktif! 1.000 kredit kerja ditambahkan ke tenant.');
      setSelectedProspect(null);
      setActivationTenantInput('');
      fetchTabContent('prospects-trial');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const navItems = [
    { key: 'overview', label: 'Ringkasan Platform', icon: Activity },
    { key: 'tenants', label: 'Manajemen Tenant', icon: Users },
    { key: 'llm-routing', label: 'LLM & Routing', icon: Brain },
    { key: 'mcp-governance', label: 'Governance MCP', icon: Layers },
    { key: 'usage-costs', label: 'Penggunaan & Biaya', icon: TrendingUp },
    { key: 'prospects-trial', label: 'Prospek & Slot Trial (36)', icon: Briefcase }
  ];

  return (
    <div id="admin-super-hub-root" className="w-full max-w-7xl mx-auto px-4 md:px-6 py-8">
      {/* Action Notification */}
      {actionSuccess && (
        <div id="admin-action-success-banner" className="mb-6 p-4 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium">{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-xs text-emerald-400 hover:text-white"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Hub Navigation Tabs */}
      <div id="admin-hub-nav" className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-8 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              id={`admin-tab-btn-${item.key}`}
              type="button"
              onClick={() => handleTabChange(item.key as AdminHubTab)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
        <a
          href="/admin/cognitive-monitoring"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap text-emerald-300 hover:text-white bg-emerald-950/50 hover:bg-emerald-900/50 border border-emerald-800/60 transition-colors ml-auto"
        >
          <Cpu className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>Monitoring Kognitif Live</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
        </a>
        <a
          href="/admin/analytics"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap text-blue-300 hover:text-white bg-blue-950/40 hover:bg-blue-900/40 border border-blue-800/50 transition-colors"
        >
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span>Analisis Platform</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
        </a>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-4">
          <HubAnalyticsSkeleton />
        </div>
      ) : errorMsg ? (
        <ErrorState
          id="admin-hub-error"
          message={errorMsg}
          onRetry={() => fetchTabContent(activeTab)}
        />
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div id="admin-overview-view" className="space-y-8">
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div id="stat-card-tenants" className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
                  <div className="flex items-center justify-between mb-3 text-slate-400">
                    <span className="text-xs font-semibold uppercase tracking-wider">Tenant Organisasi</span>
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {overview?.tenants?.total ?? 0}
                  </div>
                  <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
                    <span className="text-emerald-400 font-semibold">{overview?.tenants?.active ?? 0} Aktif</span>
                    <span>•</span>
                    <span className="text-amber-400">{overview?.tenants?.trial ?? 0} Masa Uji Coba</span>
                  </div>
                </div>

                <div id="stat-card-slots" className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
                  <div className="flex items-center justify-between mb-3 text-slate-400">
                    <span className="text-xs font-semibold uppercase tracking-wider">Slot Uji Coba (36)</span>
                    <Briefcase className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {overview?.trial_slots?.available ?? 36} / {overview?.trial_slots?.capacity ?? 36}
                  </div>
                  <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
                    <span className="text-emerald-400 font-semibold">{overview?.trial_slots?.available ?? 36} Tersedia</span>
                    <span>•</span>
                    <span className="text-purple-400">{overview?.trial_slots?.reserved ?? 0} Dipesan</span>
                  </div>
                </div>

                <div id="stat-card-llm" className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
                  <div className="flex items-center justify-between mb-3 text-slate-400">
                    <span className="text-xs font-semibold uppercase tracking-wider">Router Multi-LLM</span>
                    <Brain className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {overview?.llm?.providers_healthy ?? 4} / {overview?.llm?.providers_total ?? 4} Sehat
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    NVIDIA NIM → OpenRouter → Gemini
                  </div>
                </div>

                <div id="stat-card-mcp" className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
                  <div className="flex items-center justify-between mb-3 text-slate-400">
                    <span className="text-xs font-semibold uppercase tracking-wider">Alat MCP Aktif</span>
                    <Layers className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {overview?.mcp?.tools_total ?? 0}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    MemFlow, Scrape, File, HTTP
                  </div>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div id="admin-quick-actions" className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800">
                <h3 className="text-base font-semibold text-white mb-4">Navigasi Operasional Cepat</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <a
                    href="/admin/cognitive-monitoring"
                    className="p-4 rounded-xl bg-slate-900/60 border border-emerald-900/50 hover:border-emerald-500/70 text-left transition-all group"
                  >
                    <div className="flex items-center justify-between text-emerald-400 mb-2">
                      <Cpu className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      <ChevronRight className="w-4 h-4" />
                    </div>
                    <div className="font-semibold text-white text-sm flex items-center gap-1.5">
                      <span>Monitoring Kognitif Live</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Pantau aktivitas real-time seluruh staf AI lintas tenant 24 jam.</div>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleTabChange('prospects-trial')}
                    className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-blue-500/60 text-left transition-all"
                  >
                    <div className="flex items-center justify-between text-blue-400 mb-2">
                      <Briefcase className="w-5 h-5" />
                      <ChevronRight className="w-4 h-4" />
                    </div>
                    <div className="font-semibold text-white text-sm">Alokasi Slot Uji Coba</div>
                    <div className="text-xs text-slate-400 mt-1">Kelola 36 slot atomik dan jadwal demo eksekutif.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabChange('tenants')}
                    className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/60 text-left transition-all"
                  >
                    <div className="flex items-center justify-between text-emerald-400 mb-2">
                      <Users className="w-5 h-5" />
                      <ChevronRight className="w-4 h-4" />
                    </div>
                    <div className="font-semibold text-white text-sm">Manajemen Organisasi</div>
                    <div className="text-xs text-slate-400 mt-1">Audit saldo kredit dompet dan status langganan.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabChange('llm-routing')}
                    className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/60 text-left transition-all"
                  >
                    <div className="flex items-center justify-between text-purple-400 mb-2">
                      <Brain className="w-5 h-5" />
                      <ChevronRight className="w-4 h-4" />
                    </div>
                    <div className="font-semibold text-white text-sm">Model Router & AI Core</div>
                    <div className="text-xs text-slate-400 mt-1">Inspeksi cascade failover dan latensi model provider.</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TENANT MANAGEMENT */}
          {activeTab === 'tenants' && (
            <div id="admin-tenants-view" className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Daftar Tenant Organisasi</h2>
                  <p className="text-xs text-slate-400">Total {tenants.length} tenant terdaftar dalam sistem</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      aria-label="Cari nama atau slug tenant"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-3 py-2 pl-9 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>
                </div>
              </div>

              {tenants.length === 0 ? (
                <EmptyState
                  id="admin-tenants-empty"
                  icon={Users}
                  title="Belum Ada Tenant"
                  description="Tenant organisasi yang mendaftar akan tampil secara otomatis di tabel ini."
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0B1220]">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/80 text-xs uppercase text-slate-400 border-b border-slate-800 font-semibold tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Organisasi</th>
                        <th className="px-5 py-3.5">Slug</th>
                        <th className="px-5 py-3.5">Paket</th>
                        <th className="px-5 py-3.5">Saldo Kredit</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {tenants
                        .filter(
                          (t) =>
                            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            t.slug.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((t) => (
                          <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="px-5 py-4 font-semibold text-white">{t.name}</td>
                            <td className="px-5 py-4 font-mono text-xs text-slate-400">{t.slug}</td>
                            <td className="px-5 py-4">
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                                {t.subscription_tier}
                              </span>
                            </td>
                            <td className="px-5 py-4 font-mono font-medium text-emerald-400">
                              {t.credit_balance.toLocaleString()}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  t.status === 'ACTIVE'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                {t.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  const add = prompt(`Tambahkan kredit untuk ${t.name}:`, '500');
                                  if (add && Number(add) > 0) {
                                    fetch(`${apiBaseUrl}/api/v1/admin/tenants/${t.id}/credit-override`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ amount: Number(add) })
                                    }).then(() => fetchTabContent('tenants'));
                                  }
                                }}
                                className="text-xs text-blue-400 hover:text-white px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800/60"
                              >
                                + Topup Kredit
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LLM & ROUTING */}
          {activeTab === 'llm-routing' && (
            <div id="admin-llm-routing-view" className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">Hierarki Multi-LLM Model Router Terpadu</h2>
                <p className="text-xs text-slate-400">
                  Kebijakan Failover Tunggal: NVIDIA NIM → OpenRouter → Gemini → GPT-Image-2
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {llmModels.map((m, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-base">{m.provider}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {m.status}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      {m.model_name}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500">Tier: </span>
                        <span className="font-semibold text-blue-400">{m.tier}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Latensi: </span>
                        <span className="font-semibold">{m.avg_latency_ms} ms</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Input: </span>
                        <span>${m.input_cost_per_1k} / 1k</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Output: </span>
                        <span>${m.output_cost_per_1k} / 1k</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: MCP GOVERNANCE */}
          {activeTab === 'mcp-governance' && (
            <div id="admin-mcp-view" className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">Tata Kelola Alat MCP (Model Context Protocol)</h2>
                <p className="text-xs text-slate-400">Total {mcpTools.length} alat MCP terdaftar dan diautentikasi PDP</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mcpTools.map((t, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white text-sm">{t.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                          {t.tier || 'STANDARD'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">{t.description}</p>
                    </div>
                    <div className="text-xs text-slate-500 border-t border-slate-800/80 pt-3 flex items-center justify-between">
                      <span>Perizinan PDP</span>
                      <span className="text-emerald-400 font-mono">authorize()</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: USAGE & COST */}
          {activeTab === 'usage-costs' && (
            <div id="admin-usage-costs-view" className="space-y-8">
              <div>
                <h2 className="text-lg font-bold text-white">Analitik Penggunaan & Biaya Platform</h2>
                <p className="text-xs text-slate-400">Konsumsi kredit riil dan biaya pemanggilan API model</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
                  <div className="text-xs uppercase text-slate-400 font-semibold mb-2">Kredit Beredar</div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono">
                    {usageCosts?.credits?.circulating_balance?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Dari total {usageCosts?.credits?.lifetime_granted?.toLocaleString() ?? 0} kredit yang pernah diterbitkan
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
                  <div className="text-xs uppercase text-slate-400 font-semibold mb-2">Total Biaya Token LLM</div>
                  <div className="text-2xl font-bold text-white font-mono">
                    ${usageCosts?.tokens?.total_cost_usd?.toFixed(4) ?? '0.0000'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {usageCosts?.tokens?.total_invocations?.toLocaleString() ?? 0} pemanggilan model
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
                  <div className="text-xs uppercase text-slate-400 font-semibold mb-2">Total Token Diproses</div>
                  <div className="text-2xl font-bold text-blue-400 font-mono">
                    {((usageCosts?.tokens?.total_prompt ?? 0) + (usageCosts?.tokens?.total_completion ?? 0)).toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Prompt: {usageCosts?.tokens?.total_prompt?.toLocaleString() ?? 0} | Completion: {usageCosts?.tokens?.total_completion?.toLocaleString() ?? 0}
                  </div>
                </div>
              </div>

              {/* Top Spenders */}
              <div className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800">
                <h3 className="text-base font-semibold text-white mb-4">5 Organisasi Pengguna Terbesar</h3>
                {usageCosts?.top_spenders?.length > 0 ? (
                  <div className="space-y-3">
                    {usageCosts.top_spenders.map((s: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="font-medium text-white text-sm">{s.name}</span>
                        <div className="text-right">
                          <div className="font-mono text-sm text-emerald-400">${s.total_spent_usd.toFixed(4)}</div>
                          <div className="text-xs text-slate-500">{s.total_tokens.toLocaleString()} tokens</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Belum ada data konsumsi riil.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: PROSPECTS & TRIAL MANAGEMENT */}
          {activeTab === 'prospects-trial' && (
            <div id="admin-prospects-trial-view" className="space-y-8">
              {/* Slot Grid Overview Header */}
              <div className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>Status 36 Slot Uji Coba Eksklusif</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Atomik Concurrency
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Kapasitas dinamis: {trialSlots?.capacity ?? 36} slot | Durasi masa uji coba: {trialSlots?.durationDays ?? 7} hari kerja
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Tersedia: {trialSlots?.availableCount ?? 36}
                    </span>
                    <span className="flex items-center gap-1.5 text-purple-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                      Dipesan: {trialSlots?.counts?.RESERVED ?? 0}
                    </span>
                    <span className="flex items-center gap-1.5 text-blue-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Dialokasikan: {trialSlots?.counts?.ALLOCATED ?? 0}
                    </span>
                  </div>
                </div>

                {/* 36 Slots Visual Grid */}
                <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-12 gap-2 pt-2">
                  {(trialSlots?.slots || Array.from({ length: 36 }, (_, i) => ({ slot_number: i + 1, status: 'AVAILABLE' }))).map(
                    (slot: any) => {
                      const isAvail = slot.status === 'AVAILABLE';
                      const isReserved = slot.status === 'RESERVED';
                      const isAlloc = slot.status === 'ALLOCATED';
                      return (
                        <div
                          key={slot.slot_number}
                          title={`Slot #${slot.slot_number}: ${slot.status}${slot.company_name ? ` (${slot.company_name})` : ''}`}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-default ${
                            isAvail
                              ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                              : isReserved
                              ? 'bg-purple-950/40 border-purple-800/80 text-purple-200'
                              : isAlloc
                              ? 'bg-blue-950/40 border-blue-800/80 text-blue-200'
                              : 'bg-slate-900 border-slate-800 text-slate-500'
                          }`}
                        >
                          <span className="text-xs font-mono font-bold">#{slot.slot_number}</span>
                          <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                            {isAvail ? 'FREE' : isReserved ? 'RSV' : 'ACT'}
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Prospects Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <h3 className="text-base font-bold text-white">Daftar Pendaftaran Prospek Organisasi</h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label="Cari nama atau email prospek"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {prospects.length === 0 ? (
                  <EmptyState
                    id="admin-prospects-empty"
                    icon={Briefcase}
                    title="Belum Ada Pengajuan Prospek"
                    description="Pengajuan dari formulir publik akan tampil secara real-time di sini."
                  />
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0B1220]">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="bg-slate-900/80 text-xs uppercase text-slate-400 border-b border-slate-800 font-semibold tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Nama & Perusahaan</th>
                          <th className="px-4 py-3">Kontak Email</th>
                          <th className="px-4 py-3">Slot #</th>
                          <th className="px-4 py-3">Status Trial</th>
                          <th className="px-4 py-3">Pertemuan</th>
                          <th className="px-4 py-3">Web Integrity</th>
                          <th className="px-4 py-3 text-right">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-xs">
                        {prospects
                          .filter(
                            (p) =>
                              p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              p.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              p.work_email.toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .map((p) => (
                            <tr key={p.id} className="hover:bg-slate-900/40 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-white">{p.full_name}</div>
                                <div className="text-slate-400">{p.company_name}</div>
                              </td>
                              <td className="px-4 py-3 font-mono">{p.work_email}</td>
                              <td className="px-4 py-3">
                                {p.assigned_slot_number ? (
                                  <span className="px-2 py-0.5 rounded-full font-bold bg-purple-950 text-purple-300 border border-purple-800">
                                    Slot #{p.assigned_slot_number}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full font-semibold ${
                                    p.trial_status === 'ACTIVE'
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : p.trial_status === 'SELECTED'
                                      ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                                  }`}
                                >
                                  {p.trial_status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {p.meeting_status === 'SCHEDULED' ? (
                                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Terjadwal
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Belum</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {p.web_integrity_verified ? (
                                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Lolos Bot
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right space-x-2">
                                {!p.assigned_slot_number && (
                                  <button
                                    type="button"
                                    onClick={() => handleAllocateSlot(p.id)}
                                    disabled={isAllocating === p.id}
                                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
                                  >
                                    {isAllocating === p.id ? 'Mengamankan...' : 'Pesan Slot'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setSelectedProspect(p)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                                >
                                  Kelola
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Web Integrity Cloudflare Turnstile Audit Log Stream */}
              <div className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Log Audit Integritas Web Cloudflare Turnstile</span>
                    </h3>
                    <p className="text-xs text-slate-400">Verifikasi bot real-time pada endpoint publik</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {webIntegrityLogs.map((log: any) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            log.status === 'VERIFIED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {log.status}
                        </span>
                        <span className="text-white font-semibold">{log.endpoint}</span>
                        <span className="text-slate-400">{log.ip_address || 'IP n/a'}</span>
                      </div>
                      <div className="text-slate-500">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: KELOLA PROSPEK / JADWALKAN DEMO / AKTIVASI */}
      {selectedProspect && (
        <div id="prospect-management-modal" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#0B1220] border border-slate-800 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Kelola Prospek Organisasi</h3>
                <p className="text-xs text-slate-400">
                  {selectedProspect.full_name} ({selectedProspect.company_name})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProspect(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* 1. Jadwalkan Demo */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                1. Jadwalkan Pertemuan Solusi Enterprise
              </h4>
              <div className="space-y-2">
                <input
                  type="datetime-local"
                  aria-label="Waktu pertemuan"
                  value={meetingDateInput}
                  onChange={(e) => setMeetingDateInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs"
                />
                <input
                  type="text"
                  aria-label="Tautan ruang rapat (Google Meet / Zoom)"
                  value={meetingLinkInput}
                  onChange={(e) => setMeetingLinkInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleScheduleMeeting(selectedProspect.id)}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Simpan Jadwal Pertemuan
                </button>
              </div>
            </div>

            {/* 2. Aktivasi Uji Coba Resmi */}
            <div className="space-y-3 border-t border-slate-800 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                2. Aktivasi Uji Coba Resmi (1.000 Kredit Kerja)
              </h4>
              <div className="space-y-2">
                <input
                  type="text"
                  aria-label="Masukkan ID Tenant tujuan"
                  value={activationTenantInput}
                  onChange={(e) => setActivationTenantInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleActivateTrial(selectedProspect.id)}
                  className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  Aktifkan Uji Coba & Salurkan 1.000 Kredit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
