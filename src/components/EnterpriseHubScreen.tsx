import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  Lock,
  Unlock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Cpu,
  Layers,
  FileText,
  Activity,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Server,
  Database,
  Briefcase,
  Users
} from 'lucide-react';
import { TenantRegistrationResponse } from '../types';

interface EnterpriseHubScreenProps {
  tenant: TenantRegistrationResponse | null;
  onBack: () => void;
  defaultTab?: 'chief_of_staff' | 'integration_fabric' | 'context_fabric' | 'enforcement';
}

export const EnterpriseHubScreen: React.FC<EnterpriseHubScreenProps> = ({
  tenant,
  onBack,
  defaultTab = 'chief_of_staff',
}) => {
  const tenantId = tenant?.tenant_id || 'tenant-alpha-001';
  const [activeTab, setActiveTab] = useState<'chief_of_staff' | 'integration_fabric' | 'context_fabric' | 'enforcement'>(defaultTab);

  // Status langganan real-time
  const [tierInfo, setTierInfo] = useState<{
    tenant_id: string;
    display_name: string;
    plan_code: string;
    tier_level: number;
    is_enterprise: boolean;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Data Chief of Staff
  const [briefings, setBriefings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [cosReadOnly, setCosReadOnly] = useState<boolean>(false);

  // Form Ingest Event
  const [eventTitle, setEventTitle] = useState('');
  const [eventSummary, setEventSummary] = useState('');
  const [eventType, setEventType] = useState('OPERATIONAL_ANOMALY');

  // Data Integration Fabric
  const [connectors, setConnectors] = useState<any[]>([]);
  const [newConnectorCode, setNewConnectorCode] = useState('');
  const [newConnectorName, setNewConnectorName] = useState('');
  const [newConnectorType, setNewConnectorType] = useState('ERP_SAP_ORACLE');

  // Data Context Fabric & Specialist
  const [contextQuery, setContextQuery] = useState('');
  const [contextResult, setContextResult] = useState<any>(null);
  const [specialistResult, setSpecialistResult] = useState<any>(null);

  // Data Enforcement Verification
  const [enforcementResult, setEnforcementResult] = useState<any>(null);
  const [verifyingEnforcement, setVerifyingEnforcement] = useState<boolean>(false);

  const fetchTierAndData = async () => {
    try {
      setLoading(true);
      // 1. Fetch Tier
      const tierRes = await fetch(`/api/v1/tenants/${tenantId}/subscription/tier`);
      if (tierRes.ok) {
        const tData = await tierRes.json();
        setTierInfo(tData);
      }

      // 2. Fetch Briefings
      const bRes = await fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/briefings`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBriefings(bData.briefings || []);
        setCosReadOnly(bData.read_only_history || false);
      }

      // 3. Fetch Events
      const eRes = await fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/events`);
      if (eRes.ok) {
        const eData = await eRes.json();
        setEvents(eData.events || []);
      }

      // 4. Fetch Fabric Connectors
      const cRes = await fetch(`/api/v1/tenants/${tenantId}/enterprise/integration-fabric/connectors`);
      if (cRes.ok) {
        const cData = await cRes.json();
        setConnectors(cData.connectors || []);
      }
    } catch (err: any) {
      console.error('Error fetching enterprise data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTierAndData();
  }, [tenantId]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Beralih Tier (Simulasi Downgrade ke Growth / Upgrade ke Enterprise)
  const handleChangeTier = async (targetPlan: 'GROWTH' | 'ENTERPRISE') => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/subscription/change-tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_code: targetPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Gagal mengubah paket langganan.');
        return;
      }

      showToast('success', data.message);
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Ingest Event Chief of Staff (Gated tier 3)
  const handleIngestEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventSummary.trim()) {
      showToast('error', 'Judul dan ringkasan event wajib diisi.');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          title: eventTitle,
          summary: eventSummary,
          details: { source: 'dashboard_manual_ingest', timestamp: new Date().toISOString() },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal mengirim event');
        }
        return;
      }

      showToast('success', 'Event berhasil dicatat dan diproses oleh AI Chief of Staff!');
      setEventTitle('');
      setEventSummary('');
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Generate Executive Briefing (Gated tier 3)
  const handleGenerateBriefing = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefing_date: new Date().toISOString().split('T')[0] }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal membuat briefing');
        }
        return;
      }

      showToast('success', 'Executive Morning Briefing berhasil disintesis oleh Raden Mas Arya!');
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Buat Konektor Integration Fabric (Gated tier 3)
  const handleCreateConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnectorCode.trim() || !newConnectorName.trim()) {
      showToast('error', 'Kode dan nama konektor wajib diisi.');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/integration-fabric/connectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connector_code: newConnectorCode.trim().toUpperCase(),
          connector_name: newConnectorName.trim(),
          connector_type: newConnectorType,
          config: { stream_mode: 'realtime_cdc', buffer_seconds: 5 },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal menambahkan konektor');
        }
        return;
      }

      showToast('success', `Konektor '${newConnectorName}' berhasil diaktifkan di Integration Fabric!`);
      setNewConnectorCode('');
      setNewConnectorName('');
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Sync Streaming Connector (Gated tier 3)
  const handleSyncConnector = async (connectorCode: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/integration-fabric/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_code: connectorCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal sinkronisasi');
        }
        return;
      }

      showToast('success', `Sinkronisasi streaming '${connectorCode}' selesai: ${data.records_synced} catatan sinkron (${data.latency_ms}ms).`);
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Query Context Fabric (Gated tier 3)
  const handleQueryContext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contextQuery.trim()) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/context-fabric/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: contextQuery }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal kueri context fabric');
        }
        return;
      }

      setContextResult(data);
      showToast('success', 'Kueri Context Fabric berhasil!');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Dispatch Specialist Agent (Gated tier 3)
  const handleDispatchSpecialist = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/specialist-agents/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_role: 'CFO_STRATEGIST',
          task: 'Evaluasi Runway Finansial & Proyeksi Capex Q4',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal menjalankan specialist agent');
        }
        return;
      }

      setSpecialistResult(data);
      showToast('success', 'AI Specialist CFO berhasil menyusun proyeksi strategis!');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Verifikasi Penegakan 3 Titik (Live PDP Audit Check)
  const handleRunEnforcementCheck = async () => {
    try {
      setVerifyingEnforcement(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/enterprise/enforcement-check`);
      const data = await res.json();
      setEnforcementResult(data);
      if (data.all_consistent) {
        showToast('success', `Verifikasi 3 Titik Selesai: 100% konsisten pada status Tier ${data.tenant_tier} (${data.plan_code})!`);
      } else {
        showToast('error', 'Terdeteksi inkonsistensi penegakan titik PDP.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setVerifyingEnforcement(false);
    }
  };

  const isEnterprise = tierInfo?.is_enterprise ?? false;

  return (
    <div className="min-h-screen bg-[#070D18] text-white">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 max-w-md animate-fade-in ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : toastMsg.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-blue-950/90 border-blue-500/50 text-blue-200'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : toastMsg.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <RefreshCw className="w-5 h-5 text-blue-400 shrink-0" />
          )}
          <span className="text-xs leading-relaxed">{toastMsg.text}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top Navigation & Status Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ← Kembali ke Hub
            </button>
            <div className="h-4 w-[1px] bg-slate-800" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                  Kapabilitas Enterprise & AI Chief of Staff
                </h1>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                    isEnterprise
                      ? 'bg-purple-950/60 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-900/30'
                      : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isEnterprise ? 'Tier 3: Enterprise' : `Tier ${tierInfo?.tier_level || 2}: Growth`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Organisasi: <span className="text-slate-200 font-medium">{tierInfo?.display_name || 'Organisasi Aktif'}</span> | PDP Tier Gate & Downgrade Resilience (PRD v2.2)
              </p>
            </div>
          </div>

          {/* Tier Switcher Control (Downgrade / Upgrade Simulator) */}
          <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 px-2 font-medium">Uji Status Paket:</span>
            {isEnterprise ? (
              <button
                disabled={actionLoading}
                onClick={() => handleChangeTier('GROWTH')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                title="Simulasikan downgrade ke Growth untuk melihat suspensi otomatis konektor dan pemblokiran 403"
              >
                <Lock className="w-3.5 h-3.5" />
                Downgrade ke Growth (Tier 2)
              </button>
            ) : (
              <button
                disabled={actionLoading}
                onClick={() => handleChangeTier('ENTERPRISE')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/40 hover:brightness-110 transition-all cursor-pointer flex items-center gap-1.5"
                title="Tingkatkan ke Enterprise untuk membuka seluruh kapabilitas dan reaktivasi konektor"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Tingkatkan ke Enterprise (Tier 3)
              </button>
            )}
            <button
              onClick={fetchTierAndData}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Perbarui Data Real-time"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Downgrade Banner if on Growth */}
        {!isEnterprise && (
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                  Penegakan PDP Aktif: Paket Saat Ini GROWTH (Tier 2)
                </h4>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Fitur-fitur Enterprise ditangguhkan secara otomatis:
                  <span className="font-semibold text-amber-100"> Integration Fabric ter-suspend aman (SUSPENDED_TIER_DOWNGRADE, data tidak hilang)</span>,
                  event baru Chief of Staff ditolak dengan kode <code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-300">capability_not_available (403)</code>,
                  namun seluruh riwayat briefing & event terdahulu tetap dapat diakses secara read-only.
                </p>
              </div>
            </div>
            <button
              onClick={() => handleChangeTier('ENTERPRISE')}
              className="shrink-0 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" /> Buka Akses Enterprise
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('chief_of_staff')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'chief_of_staff'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Briefcase className="w-4 h-4" /> AI Chief of Staff (Arya)
          </button>
          <button
            onClick={() => setActiveTab('integration_fabric')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'integration_fabric'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Server className="w-4 h-4" /> Integration Fabric (Connectors)
          </button>
          <button
            onClick={() => setActiveTab('context_fabric')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'context_fabric'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Cpu className="w-4 h-4" /> Context Fabric & Specialist Agents
          </button>
          <button
            onClick={() => setActiveTab('enforcement')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'enforcement'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Audit Penegakan 3 Titik PDP
          </button>
        </div>

        {/* TAB 1: AI CHIEF OF STAFF */}
        {activeTab === 'chief_of_staff' && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 font-medium">Agen Eksekutif</div>
                <div className="text-base font-bold text-white mt-1">Raden Mas Arya</div>
                <p className="text-xs text-slate-400 mt-1">Orkestrator & Sintesis Morning Briefing Tingkat Direksi</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 font-medium">Status Pengambilan Event</div>
                <div className="text-base font-bold mt-1 flex items-center gap-2">
                  {isEnterprise ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-300">Aktif & Memproses</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="text-amber-300">Ditangguhkan (Read-Only)</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isEnterprise ? 'Menerima event real-time lintas departemen' : 'Ditolak dengan 403 capability_not_available'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Sintesis Eksekutif</div>
                  <div className="text-base font-bold text-white mt-1">{briefings.length} Briefing Tersimpan</div>
                  <p className="text-xs text-slate-400 mt-1">Riwayat briefings dapat diakses read-only</p>
                </div>
                <button
                  disabled={actionLoading}
                  onClick={handleGenerateBriefing}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    isEnterprise
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                  }`}
                  title={isEnterprise ? 'Buat Executive Briefing Hari Ini' : 'Aksi ini akan menghasilkan 403 capability_not_available saat di Growth'}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Sintesis Briefing
                </button>
              </div>
            </div>

            {/* Ingestion & Events Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form Ingest Event */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-400" />
                    Simulasi Ingest Event Lintas Departemen
                  </h3>
                  {!isEnterprise && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Gated (403 Expected)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Kirimkan anomali atau sinyal departemen ke AI Chief of Staff. Pada tier Growth, aksi ini langsung ditolak oleh PDP dengan status 403 capability_not_available.
                </p>

                <form onSubmit={handleIngestEvent} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipe Event</label>
                    <select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="OPERATIONAL_ANOMALY">OPERATIONAL_ANOMALY (Anomali Operasional)</option>
                      <option value="SLA_RISK_DETECTED">SLA_RISK_DETECTED (Risiko Pelanggaran SLA)</option>
                      <option value="CROSS_DEPT_ALERT">CROSS_DEPT_ALERT (Peringatan Antar-Divisi)</option>
                      <option value="FINANCIAL_CAP_WARNING">FINANCIAL_CAP_WARNING (Peringatan Plafon Kredit)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Judul Event (Sinyal Divisi / Insiden)</label>
                    <input
                      type="text"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Ringkasan Sinyal Operasional</label>
                    <textarea
                      rows={2}
                      value={eventSummary}
                      onChange={(e) => setEventSummary(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Kirim Event ke Chief of Staff
                  </button>
                </form>
              </div>

              {/* Recent Events List */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Feed Event Chief of Staff ({events.length})
                  </h3>
                  {cosReadOnly && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Mode Riwayat Read-Only
                    </span>
                  )}
                </div>

                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {events.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-500">
                      Belum ada event yang tercatat. Silakan lakukan ingest event di atas.
                    </div>
                  ) : (
                    events.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs space-y-1 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{ev.title}</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(ev.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">{ev.summary}</p>
                        <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-purple-300">
                            {ev.event_type}
                          </span>
                          <span className="text-emerald-400">Status: {ev.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Morning Briefings Archive */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  Arsip Executive Morning Briefings ({briefings.length})
                </h3>
                <span className="text-xs text-slate-400">
                  Data historis tersimpan permanen di Supabase Postgres
                </span>
              </div>

              {briefings.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">
                  Belum ada morning briefing yang disintesis. Klik tombol "Sintesis Briefing" di atas.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {briefings.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-3 hover:border-purple-500/40 transition-all"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <div className="font-semibold text-sm text-purple-300 flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5" />
                          Briefing {b.briefing_date}
                        </div>
                        <span className="text-[10px] text-slate-400">Oleh: {b.generated_by}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{b.executive_summary}</p>
                      
                      {/* Action items */}
                      {Array.isArray(b.action_items) && b.action_items.length > 0 && (
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-[11px] space-y-1">
                          <div className="font-semibold text-slate-300">Rekomendasi Tindakan Eksekutif:</div>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                            {b.action_items.map((act: string, idx: number) => (
                              <li key={idx}>{act}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: INTEGRATION FABRIC */}
        {activeTab === 'integration_fabric' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-purple-400" />
                    Konektor Integration Fabric Enterprise
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Streaming sinkronisasi data enterprise real-time dua arah (SAP, Oracle, Salesforce, ERP kustom).
                    <strong className="text-slate-200"> Aturan Downgrade Resilience:</strong> Saat tenant beralih dari Enterprise ke Growth,
                    seluruh konektor aktif diubah ke status <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">SUSPENDED_TIER_DOWNGRADE</code> tanpa menghapus kredensial atau riwayat data.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">Total Konektor:</span>
                  <span className="text-sm font-bold text-white px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                    {connectors.length}
                  </span>
                </div>
              </div>
            </div>

            {/* List Konektor */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectors.map((c) => {
                const isSuspended = c.status === 'SUSPENDED_TIER_DOWNGRADE';
                const isActive = c.status === 'ACTIVE';

                return (
                  <div
                    key={c.id}
                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                      isSuspended
                        ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-purple-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-2 rounded-xl bg-purple-950/40 text-purple-400 border border-purple-800/30">
                        <Database className="w-4 h-4" />
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          isActive
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    <div>
                      <div className="text-xs font-mono text-purple-300">{c.connector_code}</div>
                      <h4 className="text-sm font-bold text-white mt-0.5">{c.connector_name}</h4>
                      <p className="text-xs text-slate-400 mt-1">Tipe: {c.connector_type}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Sync Terakhir:</span>
                      <span className="text-slate-300 font-mono">
                        {c.last_sync_at ? new Date(c.last_sync_at).toLocaleTimeString('id-ID') : 'Belum pernah'}
                      </span>
                    </div>

                    <button
                      disabled={actionLoading}
                      onClick={() => handleSyncConnector(c.connector_code)}
                      className={`w-full py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        isEnterprise && !isSuspended
                          ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-900/30'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title={
                        isSuspended
                          ? 'Konektor ditangguhkan karena downgrade paket'
                          : 'Sinkronkan streaming data sekarang'
                      }
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Sync Data Stream
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Form Tambah Konektor Baru */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4 max-w-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-purple-400" />
                  Daftarkan Konektor Fabric Baru
                </h3>
                {!isEnterprise && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Gated Tier 3
                  </span>
                )}
              </div>

              <form onSubmit={handleCreateConnector} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Kode Konektor (e.g. ERP_SAP_FIN)</label>
                    <input
                      type="text"
                      value={newConnectorCode}
                      onChange={(e) => setNewConnectorCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipe Konektor</label>
                    <select
                      value={newConnectorType}
                      onChange={(e) => setNewConnectorType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="ERP_SAP_ORACLE">ERP SAP S/4HANA / Oracle Fusion</option>
                      <option value="DATA_STREAM_PIPELINE">Data Stream Pipeline (Kafka / Postgres CDC)</option>
                      <option value="WEBHOOK_BROKER">High-Throughput Webhook Broker</option>
                      <option value="CUSTOM_RPC">Custom Corporate RPC Protocol</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Nama Tampilan Konektor</label>
                  <input
                    type="text"
                    value={newConnectorName}
                    onChange={(e) => setNewConnectorName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Daftarkan Konektor ke Integration Fabric
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: CONTEXT FABRIC & SPECIALIST AGENTS */}
        {activeTab === 'context_fabric' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Context Fabric Query */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    Kueri Federated Company Context Fabric
                  </h3>
                  {!isEnterprise && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Gated Tier 3
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pencarian semantik terfederasi lintas seluruh basis pengetahuan, SOP divisi, dan ontologi relasi korporat.
                </p>

                <form onSubmit={handleQueryContext} className="flex gap-2">
                  <input
                    type="text"
                    value={contextQuery}
                    onChange={(e) => setContextQuery(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-900/30 transition-all cursor-pointer"
                  >
                    Kueri
                  </button>
                </form>

                {contextResult && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
                    <div className="font-semibold text-purple-300">Hasil Penelusuran Terfederasi:</div>
                    {contextResult.results?.map((r: any, idx: number) => (
                      <div key={idx} className="p-2 bg-slate-900 rounded-lg border border-slate-800/80 text-[11px] space-y-1">
                        <div className="flex items-center justify-between font-medium text-white">
                          <span>{r.entity}</span>
                          <span className="text-emerald-400 font-mono">Relevansi: {Math.round(r.relevance * 100)}%</span>
                        </div>
                        <p className="text-slate-300">{r.snippet}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Specialist Agents (CFO Strategist) */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    AI Specialist Agent (CFO & Financial Strategist)
                  </h3>
                  {!isEnterprise && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Gated Tier 3
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pekerja AI spesialis tingkat direksi yang menyusun pemodelan proyeksi kas, simulasi beban gaji tim, dan perhitungan efisiensi operasional.
                </p>

                <button
                  disabled={actionLoading}
                  onClick={handleDispatchSpecialist}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Jalankan Simulasi Pemodelan Proyeksi CFO
                </button>

                {specialistResult && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between font-semibold text-emerald-300">
                      <span>Peran: {specialistResult.agent_role}</span>
                      <span className="text-slate-400 font-mono">Confidence: {Math.round(specialistResult.confidence * 100)}%</span>
                    </div>
                    <p className="text-slate-200 text-[11px] leading-relaxed font-sans">{specialistResult.analysis}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ENFORCEMENT AUDIT CHECK (DEFINITION OF DONE) */}
        {activeTab === 'enforcement' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                    Audit Penegakan Konsisten di 3 Titik PDP (Definition of Done)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Sesuai PRD v2.2 Bagian 3.5 & 14.2, kapabilitas Enterprise wajib ditolak secara konsisten dengan status 
                    <strong className="text-slate-200"> 403 (capability_not_available)</strong> di seluruh titik akses:
                    REST API, Orchestration Workflow Node Execution, dan MCP Tool Invocation.
                  </p>
                </div>
                <button
                  disabled={verifyingEnforcement}
                  onClick={handleRunEnforcementCheck}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/40 transition-all cursor-pointer flex items-center gap-2 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${verifyingEnforcement ? 'animate-spin' : ''}`} />
                  Jalankan Pengujian 3 Titik
                </button>
              </div>
            </div>

            {enforcementResult && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">Hasil Evaluasi Paket Saat Ini:</span>
                    <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                      Tier {enforcementResult.tenant_tier} ({enforcementResult.plan_code})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {enforcementResult.all_consistent ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 px-3 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40">
                        <CheckCircle2 className="w-4 h-4" /> 100% Konsistensi PDP Terverifikasi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400 px-3 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40">
                        <XCircle className="w-4 h-4" /> Inkonsistensi Terdeteksi
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Titik 1: REST */}
                  <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">Titik 1: REST Endpoint</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          enforcementResult.point1_rest.passed
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        HTTP {enforcementResult.point1_rest.status_code}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{enforcementResult.point1_rest.endpoint}</div>
                    <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800">
                      {enforcementResult.point1_rest.message}
                    </p>
                    {enforcementResult.point1_rest.code && (
                      <div className="text-[10px] text-amber-400 font-mono">Kode: {enforcementResult.point1_rest.code}</div>
                    )}
                  </div>

                  {/* Titik 2: Workflow Node */}
                  <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">Titik 2: Workflow Node</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          enforcementResult.point2_workflow_node.passed
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {enforcementResult.point2_workflow_node.passed ? 'PERMIT (Allowed)' : 'DENIED (403)'}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{enforcementResult.point2_workflow_node.node_type}</div>
                    <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800">
                      {enforcementResult.point2_workflow_node.message}
                    </p>
                    {enforcementResult.point2_workflow_node.error_code && (
                      <div className="text-[10px] text-amber-400 font-mono">Kode: {enforcementResult.point2_workflow_node.error_code}</div>
                    )}
                  </div>

                  {/* Titik 3: MCP Tool */}
                  <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">Titik 3: MCP Tool Invocation</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          enforcementResult.point3_mcp_tool.passed
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {enforcementResult.point3_mcp_tool.passed ? 'PERMIT (Allowed)' : 'DENIED (403)'}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{enforcementResult.point3_mcp_tool.tool_name}</div>
                    <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800">
                      {enforcementResult.point3_mcp_tool.message}
                    </p>
                    {enforcementResult.point3_mcp_tool.error_code && (
                      <div className="text-[10px] text-amber-400 font-mono">Kode: {enforcementResult.point3_mcp_tool.error_code}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
