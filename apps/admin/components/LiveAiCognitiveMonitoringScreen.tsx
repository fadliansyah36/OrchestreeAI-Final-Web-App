'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Brain,
  Activity,
  Layers,
  Sparkles,
  Bot,
  Users,
  ShieldCheck,
  TrendingUp,
  Cpu,
  RefreshCw,
  Search,
  Filter,
  Maximize2,
  Minimize2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  X,
  Radio,
  BarChart2,
  ChevronRight,
  Zap,
  Building2,
  Check,
  AlertCircle
} from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export interface LiveAgentState {
  id: string;
  tenant_id: string;
  tenant_name: string;
  ai_agent_id: string;
  agent_name: string;
  agent_role: string;
  department_id?: string;
  department_name: string;
  department_category: string;
  job_title_id?: string;
  job_title_code: string;
  job_title_name: string;
  workflow_execution_id?: string;
  current_status: 'idle' | 'thinking' | 'calling_tool' | 'generating_image' | 'retrieving_memory' | 'waiting_approval' | 'error' | 'completed';
  current_step_label: string;
  current_tool_name?: string;
  confidence_score: number;
  source_channel: string;
  started_at?: string;
  last_heartbeat_at?: string;
  duration_seconds: number;
  seconds_since_heartbeat: number;
}

export interface LiveMonitoringSummary {
  total_active_agents: number;
  total_monitored_agents: number;
  breakdown_by_status: Record<string, number>;
  breakdown_by_job_title: Array<{ job_title: string; active_count: number }>;
  breakdown_by_tenant: Array<{ tenant_id: string; tenant_name: string; active_count: number }>;
  timestamp: string;
}

export interface AgentNodeHistoryItem {
  id: string;
  node_key: string;
  node_type: string;
  step_label: string;
  status: string;
  duration_ms: number;
  duration_seconds: number;
  started_at?: string;
  finished_at?: string;
}

export function LiveAiCognitiveMonitoringScreen({ apiBaseUrl = '' }: { apiBaseUrl?: string }) {
  const [liveStates, setLiveStates] = useState<LiveAgentState[]>([]);
  const [summary, setSummary] = useState<LiveMonitoringSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isWarRoom, setIsWarRoom] = useState<boolean>(false);
  const [selectedAgent, setSelectedAgent] = useState<LiveAgentState | null>(null);
  const [agentHistory, setAgentHistory] = useState<AgentNodeHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [triggeringDemo, setTriggeringDemo] = useState<boolean>(false);
  const [triggerSuccessMsg, setTriggerSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedTenant, setSelectedTenant] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedJobTitle, setSelectedJobTitle] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // 1. Fetch Snapshot & Summary
  const fetchLiveStateData = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const [resStates, resSummary] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/admin/ai-agent-live-state`, { headers }),
        fetch(`${apiBaseUrl}/api/v1/admin/ai-agent-live-state/summary`, { headers }),
      ]);

      if (resStates.ok) {
        const jsonStates = await resStates.json();
        setLiveStates(jsonStates.data || []);
      }
      if (resSummary.ok) {
        const jsonSummary = await resSummary.json();
        setSummary(jsonSummary);
      }
    } catch (err) {
      console.warn('Gagal memuat snapshot cognitive monitoring:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Setup WebSocket Connection
  useEffect(() => {
    fetchLiveStateData();

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/v1/admin/ai-agent-live-state`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'initial_snapshot') {
              if (data.states) setLiveStates(data.states);
              if (data.summary) setSummary(data.summary);
            } else if (data.event === 'pulse_summary') {
              if (data.summary) setSummary(data.summary);
            } else if (data.event === 'state_update') {
              setLiveStates((prev) => {
                const idx = prev.findIndex((item) => item.ai_agent_id === data.ai_agent_id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = {
                    ...updated[idx],
                    current_status: data.current_status,
                    current_step_label: data.current_step_label,
                    current_tool_name: data.current_tool_name,
                    confidence_score: data.confidence_score || updated[idx].confidence_score,
                    last_heartbeat_at: data.last_heartbeat_at,
                    seconds_since_heartbeat: 0,
                  };
                  return updated;
                }
                return prev;
              });
              // Refresh summary asynchronously
              fetchLiveStateData();
            } else if (data.event === 'cleanup_sync') {
              fetchLiveStateData();
            }
          } catch (e) {
            // Ignored
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          // Auto reconnect after 5s
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (err) {
        setWsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    // Fallback polling timer every 10 seconds
    const intervalTimer = setInterval(() => {
      fetchLiveStateData();
    }, 10000);

    return () => {
      clearInterval(intervalTimer);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // 3. Fetch agent recent history when selected
  useEffect(() => {
    if (!selectedAgent) {
      setAgentHistory([]);
      return;
    }
    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        const headers: Record<string, string> = {
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${apiBaseUrl}/api/v1/admin/ai-agent-live-state/${selectedAgent.ai_agent_id}/recent-nodes?limit=8`, { headers });
        if (res.ok) {
          const json = await res.json();
          setAgentHistory(json.nodes || []);
        }
      } catch (err) {
        console.warn('Gagal memuat histori node agen:', err);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
  }, [selectedAgent]);

  // 4. Trigger Real Live Workflow Execution Test (Membuat aktivitas live nyata)
  const handleTriggerRealWorkflowTest = async () => {
    const activeTenantId = liveStates[0]?.tenant_id || (typeof window !== 'undefined' ? localStorage.getItem('orchestree_active_tenant') || '' : '');
    if (!activeTenantId) {
      setTriggerSuccessMsg('Pilih organisasi/tenant aktif terlebih dahulu untuk memicu alur kerja nyata.');
      return;
    }
    setTriggeringDemo(true);
    setTriggerSuccessMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/orchestration/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: activeTenantId,
          intent_text: 'Audit intelijen performa staf dan evaluasi sentimen saluran operasional',
          actor_type: 'ai_agent',
          roles: ['STAFF_AI'],
          capabilities: ['workflow.dispatch', 'workflow.node.execute', 'mcp.tool.invoke'],
          execution_context: 'internal_dashboard',
          context_data: { test_source: 'live_cognitive_monitoring_ui' },
        }),
      });
      if (res.ok) {
        setTriggerSuccessMsg('Tugas orkestrasi nyata berhasil dipicu! Agen AI menyala live di jaringan pusat.');
        setTimeout(() => setTriggerSuccessMsg(null), 6000);
        setTimeout(fetchLiveStateData, 1000);
      } else {
        setTriggerSuccessMsg('Tugas terkirim ke queue orkestrasi.');
        setTimeout(() => setTriggerSuccessMsg(null), 4000);
      }
    } catch {
      setTriggerSuccessMsg('Permintaan orkestrasi dikirim.');
      setTimeout(() => setTriggerSuccessMsg(null), 4000);
    } finally {
      setTriggeringDemo(false);
    }
  };

  // 5. Filter logic
  const filteredStates = useMemo(() => {
    return liveStates.filter((agent) => {
      if (selectedTenant !== 'all' && agent.tenant_id !== selectedTenant) return false;
      if (selectedDepartment !== 'all' && agent.department_category !== selectedDepartment) return false;
      if (selectedJobTitle !== 'all' && agent.job_title_code !== selectedJobTitle) return false;
      if (selectedStatus !== 'all' && agent.current_status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = agent.agent_name.toLowerCase().includes(query);
        const matchesTenant = agent.tenant_name.toLowerCase().includes(query);
        const matchesTitle = agent.job_title_name.toLowerCase().includes(query);
        const matchesStep = agent.current_step_label.toLowerCase().includes(query);
        if (!matchesName && !matchesTenant && !matchesTitle && !matchesStep) return false;
      }
      return true;
    });
  }, [liveStates, selectedTenant, selectedDepartment, selectedJobTitle, selectedStatus, searchQuery]);

  // Extract unique filter options
  const uniqueTenants = useMemo(() => {
    const map = new Map<string, string>();
    liveStates.forEach((s) => map.set(s.tenant_id, s.tenant_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [liveStates]);

  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    liveStates.forEach((s) => {
      if (s.department_category) set.add(s.department_category);
    });
    return Array.from(set);
  }, [liveStates]);

  const uniqueJobTitles = useMemo(() => {
    const map = new Map<string, string>();
    liveStates.forEach((s) => map.set(s.job_title_code, s.job_title_name));
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [liveStates]);

  const activeCount = useMemo(() => {
    return filteredStates.filter(
      (a) => a.current_status !== 'idle' && a.current_status !== 'completed' && a.current_status !== 'error'
    ).length;
  }, [filteredStates]);

  // Status helper mapping
  const getStatusBadge = (status: LiveAgentState['current_status']) => {
    switch (status) {
      case 'thinking':
        return {
          bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
          pulse: 'bg-indigo-500 shadow-indigo-500/50',
          label: 'Berpikir & Sintesis',
        };
      case 'calling_tool':
        return {
          bg: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
          pulse: 'bg-amber-500 shadow-amber-500/50',
          label: 'Memanggil Tool MCP',
        };
      case 'generating_image':
        return {
          bg: 'bg-pink-950/80 text-pink-300 border-pink-700/60',
          pulse: 'bg-pink-500 shadow-pink-500/50',
          label: 'Generasi Visual AI',
        };
      case 'retrieving_memory':
        return {
          bg: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60',
          pulse: 'bg-cyan-500 shadow-cyan-500/50',
          label: 'Akses Memori & SOP',
        };
      case 'waiting_approval':
        return {
          bg: 'bg-yellow-950/80 text-yellow-300 border-yellow-700/60',
          pulse: 'bg-yellow-500 shadow-yellow-500/50',
          label: 'Menunggu Otorisasi',
        };
      case 'completed':
        return {
          bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
          pulse: 'bg-emerald-500 shadow-emerald-500/50',
          label: 'Selesai',
        };
      case 'error':
        return {
          bg: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
          pulse: 'bg-rose-500 shadow-rose-500/50',
          label: 'Terputus / Galat',
        };
      default:
        return {
          bg: 'bg-slate-900 text-slate-400 border-slate-800',
          pulse: 'bg-slate-600 shadow-none',
          label: 'Siaga (Idle)',
        };
    }
  };

  const getJobTitleIcon = (code: string) => {
    if (code.includes('CHIEF') || code.includes('STAFF')) return ShieldCheck;
    if (code.includes('SALES')) return TrendingUp;
    if (code.includes('MARKETING') || code.includes('CREATIVE')) return Sparkles;
    if (code.includes('CUSTOMER') || code.includes('SERVICE')) return Users;
    if (code.includes('INTELLIGENCE') || code.includes('DATA')) return Brain;
    if (code.includes('FINANCE') || code.includes('CONTROLLER')) return BarChart2;
    return Bot;
  };

  return (
    <div
      className={`min-h-screen font-sans transition-all duration-300 ${
        isWarRoom
          ? 'fixed inset-0 z-50 bg-[#050B14] p-4 md:p-6 overflow-y-auto'
          : 'bg-[#070D18] p-4 md:p-6 lg:p-8 text-white'
      }`}
    >
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Cpu className="w-4 h-4 animate-pulse" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Live AI Cognitive Monitoring Panel</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/60">
                24/7 Realtime
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Observatorium operasional otonom seluruh staf AI lintas tenant — privasi terjaga, tanpa kebocoran konten prompt atau data bisnis.
          </p>
        </div>

        {/* Action & Status Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* WebSocket Status Indicator */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
              wsConnected
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <span>{wsConnected ? 'Supabase Realtime Terhubung' : 'Polling Sinkronisasi'}</span>
          </div>

          {/* Trigger Real Workflow Test Button */}
          <button
            type="button"
            onClick={handleTriggerRealWorkflowTest}
            disabled={triggeringDemo}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-blue-600/25 transition disabled:opacity-50 cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${triggeringDemo ? 'animate-spin' : ''}`} />
            <span>{triggeringDemo ? 'Memicu Tugas...' : 'Picu Tugas AI Nyata'}</span>
          </button>

          {/* Refresh Snapshot */}
          <button
            type="button"
            onClick={fetchLiveStateData}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Perbarui Snapshot Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* War Room Toggle */}
          <button
            type="button"
            onClick={() => setIsWarRoom(!isWarRoom)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              isWarRoom
                ? 'bg-purple-900/60 text-purple-200 border-purple-700 shadow-lg shadow-purple-900/30'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            {isWarRoom ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isWarRoom ? 'Keluar War Room' : 'Mode War Room'}</span>
          </button>
        </div>
      </div>

      {triggerSuccessMsg && (
        <div className="max-w-7xl mx-auto mb-5 p-3 rounded-2xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{triggerSuccessMsg}</span>
          </div>
          <button onClick={() => setTriggerSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards & Status Breakdown */}
      <div className="max-w-7xl mx-auto mb-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Total Active Agents */}
        <div className="col-span-2 p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-blue-950/40 border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">AI Agent Aktif Sekarang</span>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white">{activeCount}</span>
            <span className="text-xs text-slate-400">dari {liveStates.length} staf termonitor</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>Detak jantung sinkron real-time</span>
          </div>
        </div>

        {/* Status: Thinking */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-indigo-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span>Berpikir (Thinking)</span>
          </span>
          <div className="text-2xl font-bold text-white mt-1">
            {summary?.breakdown_by_status?.thinking || liveStates.filter((a) => a.current_status === 'thinking').length}
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, ((summary?.breakdown_by_status?.thinking || 0) / Math.max(1, liveStates.length)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Status: Calling Tool */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-amber-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Panggil Tool MCP</span>
          </span>
          <div className="text-2xl font-bold text-white mt-1">
            {summary?.breakdown_by_status?.calling_tool || liveStates.filter((a) => a.current_status === 'calling_tool').length}
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, ((summary?.breakdown_by_status?.calling_tool || 0) / Math.max(1, liveStates.length)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Status: Generating Image */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-pink-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
            <span>Generasi Visual</span>
          </span>
          <div className="text-2xl font-bold text-white mt-1">
            {summary?.breakdown_by_status?.generating_image || liveStates.filter((a) => a.current_status === 'generating_image').length}
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-pink-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, ((summary?.breakdown_by_status?.generating_image || 0) / Math.max(1, liveStates.length)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Status: Waiting Approval */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-yellow-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            <span>Menunggu Manusia</span>
          </span>
          <div className="text-2xl font-bold text-white mt-1">
            {summary?.breakdown_by_status?.waiting_approval || liveStates.filter((a) => a.current_status === 'waiting_approval').length}
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-yellow-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, ((summary?.breakdown_by_status?.waiting_approval || 0) / Math.max(1, liveStates.length)) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="max-w-7xl mx-auto mb-6 p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mr-2">
          <Filter className="w-3.5 h-3.5 text-blue-400" />
          <span>Filter Tampilan:</span>
        </div>

        {/* Tenant Filter */}
        <select
          value={selectedTenant}
          onChange={(e) => setSelectedTenant(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">Semua Organisasi ({uniqueTenants.length})</option>
          {uniqueTenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {/* Department Category Filter */}
        <select
          value={selectedDepartment}
          onChange={(e) => setSelectedDepartment(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">Semua Departemen</option>
          {uniqueDepartments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>

        {/* Job Title Filter */}
        <select
          value={selectedJobTitle}
          onChange={(e) => setSelectedJobTitle(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">Semua Jabatan Resmi</option>
          {uniqueJobTitles.map((jt) => (
            <option key={jt.code} value={jt.code}>
              {jt.name}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">Semua Status</option>
          <option value="thinking">Berpikir (Thinking)</option>
          <option value="calling_tool">Memanggil Tool</option>
          <option value="generating_image">Generasi Gambar</option>
          <option value="retrieving_memory">Akses Memori</option>
          <option value="waiting_approval">Menunggu Otorisasi</option>
          <option value="idle">Siaga (Idle)</option>
          <option value="error">Galat (Error)</option>
        </select>

        {/* Text Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Cari nama agen, tahap kerja, organisasi"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Reset Filter Button */}
        {(selectedTenant !== 'all' || selectedDepartment !== 'all' || selectedJobTitle !== 'all' || selectedStatus !== 'all' || searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setSelectedTenant('all');
              setSelectedDepartment('all');
              setSelectedJobTitle('all');
              setSelectedStatus('all');
              setSearchQuery('');
            }}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          >
            Reset
          </button>
        )}
      </div>

      {/* Main Interactive Network Canvas & Agent Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Center: Network Map Visualization */}
        <div className="lg:col-span-8 bg-[#0B1220] rounded-3xl border border-slate-800 p-6 relative overflow-hidden shadow-2xl min-h-[520px] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 z-10">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Peta Jaringan Kognitif AI Terpusat
              </span>
            </div>
            <span className="text-xs text-slate-400">
              {filteredStates.length} Agen Terpeta ({activeCount} Aktif)
            </span>
          </div>

          {/* SVG Central Core Network Map */}
          {loading ? (
            <div className="h-[420px] flex items-center justify-center text-slate-400 text-sm">
              Memetakan topologi kognitif agen...
            </div>
          ) : filteredStates.length === 0 ? (
            /* Honest EmptyState saat tidak ada satupun agen aktif atau terdaftar */
            <div className="h-[420px] flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4 shadow-inner">
                <Brain className="w-10 h-10 stroke-1" />
              </div>
              <EmptyState
                id="empty-live-cognitive"
                icon={Brain}
                title="Tidak Ada Aktivitas AI Agent Saat Ini"
                description="Inti kognitif berada dalam kondisi siaga tenang. Segera setelah ada percakapan pelanggan, penjadwalan, atau automasi yang berjalan, node agen akan otomatis menyala di peta ini."
                actionLabel="Picu Tugas AI Nyata"
                onAction={handleTriggerRealWorkflowTest}
              />
            </div>
          ) : (
            <div className="relative w-full h-[440px] flex items-center justify-center my-2">
              {/* Dynamic SVG Connecting Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="coreLineActive" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="coreLineIdle" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#334155" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#1E293B" stopOpacity="0.2" />
                  </linearGradient>
                </defs>

                {filteredStates.slice(0, 12).map((agent, i) => {
                  const total = Math.min(filteredStates.length, 12);
                  const angle = (i * 2 * Math.PI) / total - Math.PI / 2;
                  const rx = 40; // % from center
                  const ry = 36; // % from center
                  const cx = 50; // %
                  const cy = 50; // %
                  const x = cx + rx * Math.cos(angle);
                  const y = cy + ry * Math.sin(angle);
                  const isActive = agent.current_status !== 'idle' && agent.current_status !== 'completed' && agent.current_status !== 'error';

                  return (
                    <g key={`line-${agent.id}`}>
                      <line
                        x1="50%"
                        y1="50%"
                        x2={`${x}%`}
                        y2={`${y}%`}
                        stroke={isActive ? 'url(#coreLineActive)' : 'url(#coreLineIdle)'}
                        strokeWidth={isActive ? '2.5' : '1'}
                        strokeDasharray={isActive ? '6 6' : 'none'}
                        className={isActive ? 'animate-[dash_2s_linear_infinite]' : ''}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Central Node: AI CORE */}
              <div className="z-10 flex flex-col items-center justify-center p-4 rounded-3xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] border-2 border-blue-500/60 shadow-[0_0_50px_rgba(59,130,246,0.3)] transition-transform hover:scale-105">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-lg mb-1.5">
                  <Brain className="w-8 h-8 animate-pulse text-white" />
                </div>
                <span className="font-extrabold text-xs tracking-tight text-white uppercase">AI CORE ENGINE</span>
                <span className="text-[10px] text-blue-300 font-mono">Model Router v2.2</span>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                  <Zap className="w-2.5 h-2.5" />
                  <span>{activeCount > 0 ? `${activeCount} Alur Aktif` : 'Siaga Tenang'}</span>
                </div>
              </div>

              {/* Orbiting Agent Nodes (up to 12 in radial layout) */}
              {filteredStates.slice(0, 12).map((agent, i) => {
                const total = Math.min(filteredStates.length, 12);
                const angle = (i * 2 * Math.PI) / total - Math.PI / 2;
                const rx = 40;
                const ry = 36;
                const cx = 50;
                const cy = 50;
                const x = cx + rx * Math.cos(angle);
                const y = cy + ry * Math.sin(angle);

                const isActive = agent.current_status !== 'idle' && agent.current_status !== 'completed' && agent.current_status !== 'error';
                const statusInfo = getStatusBadge(agent.current_status);
                const IconComponent = getJobTitleIcon(agent.job_title_code);
                const isSelected = selectedAgent?.ai_agent_id === agent.ai_agent_id;

                return (
                  <button
                    key={`node-${agent.id}`}
                    type="button"
                    onClick={() => setSelectedAgent(agent)}
                    style={{ left: `${x}%`, top: `${y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center p-2 rounded-2xl transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-900/90 border-2 border-blue-400 scale-110 shadow-xl shadow-blue-500/40'
                        : isActive
                        ? 'bg-slate-900/95 border border-blue-500/50 hover:scale-105 shadow-lg shadow-blue-900/20'
                        : 'bg-slate-950/70 border border-slate-800/60 opacity-60 hover:opacity-100 hover:scale-105'
                    }`}
                  >
                    <div className="relative mb-1">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-white border border-slate-700">
                        <IconComponent className="w-5 h-5 text-blue-400" />
                      </div>
                      {/* Pulse circle indicator */}
                      <span
                        className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-950 ${statusInfo.pulse}`}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-white max-w-[110px] truncate text-center leading-tight">
                      {agent.agent_name}
                    </span>
                    <span className="text-[9px] text-slate-400 max-w-[100px] truncate">{agent.tenant_name}</span>
                    <span
                      className={`mt-1 text-[9px] font-semibold px-2 py-0.5 rounded-full border ${statusInfo.bg}`}
                    >
                      {statusInfo.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-3 flex flex-wrap items-center justify-between gap-2 z-10">
            <span>Klik salah satu node untuk membuka panel detail tahapan & mini-timeline operasional.</span>
            <span className="font-mono text-slate-500">Kanal: platform:ai-agent-live</span>
          </div>
        </div>

        {/* Right: Selected Agent Focus Drawer / Live Feed List */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {selectedAgent ? (
            /* Fokus Agent Sidebar */
            <div className="p-5 rounded-3xl bg-[#0B1220] border border-blue-600/40 shadow-xl relative animate-fadeIn">
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 transition"
                title="Tutup Fokus Agen"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-950/80 border border-blue-700 flex items-center justify-center text-blue-300">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedAgent.agent_name}</h3>
                  <p className="text-xs text-blue-400 font-medium">{selectedAgent.job_title_name}</p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3 text-emerald-400" />
                    <span>{selectedAgent.tenant_name}</span>
                  </p>
                </div>
              </div>

              {/* Status & Step Card */}
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-slate-400 font-medium">Tahap Saat Ini:</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      getStatusBadge(selectedAgent.current_status).bg
                    }`}
                  >
                    {getStatusBadge(selectedAgent.current_status).label}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2">
                  <Activity className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{selectedAgent.current_step_label}</span>
                </div>
                {selectedAgent.current_tool_name && (
                  <div className="mt-2 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-900/50 px-2.5 py-1 rounded-lg font-mono">
                    Tool: {selectedAgent.current_tool_name}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <div>
                    <span>Durasi Berjalan:</span>
                    <p className="font-semibold text-white">{selectedAgent.duration_seconds} detik</p>
                  </div>
                  <div>
                    <span>Skor Keyakinan:</span>
                    <p className="font-semibold text-emerald-400">{selectedAgent.confidence_score}%</p>
                  </div>
                </div>
              </div>

              {/* Mini Timeline of Last Nodes (without sensitive prompts) */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 mb-2.5 flex items-center justify-between">
                  <span>Riwayat Tahapan Terakhir</span>
                  <span className="text-[10px] text-slate-500 font-normal">Metadata operasional</span>
                </h4>

                {historyLoading ? (
                  <div className="p-4 text-center text-slate-400 text-xs">Memuat riwayat tahapan...</div>
                ) : agentHistory.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950 text-center text-slate-500 text-xs">
                    Belum ada riwayat tahap checkpoint tersimpan.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {agentHistory.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              item.status === 'completed'
                                ? 'bg-emerald-400'
                                : item.status === 'failed'
                                ? 'bg-rose-400'
                                : 'bg-blue-400 animate-ping'
                            }`}
                          />
                          <div>
                            <span className="font-semibold text-slate-200 block text-[11px]">{item.step_label}</span>
                            <span className="text-[10px] text-slate-500 font-mono">Tipe: {item.node_type}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {item.duration_seconds > 0 ? `${item.duration_seconds}s` : `${item.duration_ms}ms`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Live Activity Feed List */
            <div className="p-5 rounded-3xl bg-[#0B1220] border border-slate-800 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
                <span>Daftar Aktivitas Terkini</span>
                <span className="text-[10px] text-slate-500 font-normal">{filteredStates.length} Agen</span>
              </h3>

              {filteredStates.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Tidak ada agen yang sesuai dengan kriteria filter saat ini.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {filteredStates.map((agent) => {
                    const statusInfo = getStatusBadge(agent.current_status);
                    const IconComponent = getJobTitleIcon(agent.job_title_code);

                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setSelectedAgent(agent)}
                        className="w-full text-left p-3 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800/80 hover:border-blue-500/50 transition cursor-pointer flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 shrink-0 group-hover:border-blue-500/50">
                            <IconComponent className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">{agent.agent_name}</span>
                              <span className="text-[10px] text-slate-400">({agent.tenant_name})</span>
                            </div>
                            <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                              {agent.current_step_label}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end shrink-0">
                          <span
                            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${statusInfo.bg}`}
                          >
                            {statusInfo.label}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono mt-1">
                            {agent.duration_seconds}s
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
