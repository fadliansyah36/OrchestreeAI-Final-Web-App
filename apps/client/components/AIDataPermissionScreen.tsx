import { apiClient } from '@orchestree/api-client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Key,
  Database,
  Building2,
  Users,
  Search,
  RefreshCw,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  ArrowRight,
  Filter,
  Check,
  ChevronDown,
  Layers,
  Sparkles,
  Info,
  ExternalLink,
  History,
  X
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader } from '@orchestree/ui';

export type AccessLevel = 'NONE' | 'READ_ONLY' | 'READ_WRITE' | 'ADMIN';

export interface PersonaItem {
  persona_type: string;
  display_name: string;
  role_title: string;
  description: string;
  icon: string;
  department: string;
}

export interface ConnectorItem {
  connector_code: string;
  connector_name: string;
  connector_type: string;
  data_classification: string;
  description: string;
  status?: string;
}

export interface CellPolicy {
  policy_id: string;
  access_level: AccessLevel;
  effect: 'ALLOW' | 'DENY';
  action: string;
  data_classification: string;
  priority: number;
  updated_at: string | null;
}

export interface AuditLogItem {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: any;
  created_at: string;
}

export interface AIDataPermissionScreenProps {
  tenantId: string;
  tenantName?: string;
  userRole?: string;
  userId?: string;
  onBack?: () => void;
}

export const AIDataPermissionScreen: React.FC<AIDataPermissionScreenProps> = ({
  tenantId,
  tenantName = 'Organisasi Terdaftar',
  userRole = 'TENANT_OWNER',
  userId,
  onBack,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const [personas, setPersonas] = useState<PersonaItem[]>([]);
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, CellPolicy>>>({});
  const [totalPolicies, setTotalPolicies] = useState<number>(0);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  // Popover cell active state
  const [activeCellCoord, setActiveCellCoord] = useState<{ persona: string; connector: string } | null>(null);

  // Audit Ledger Drawer
  const [showAuditDrawer, setShowAuditDrawer] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  // Live PDP Sandbox Simulator
  const [simPersona, setSimPersona] = useState<string>('hr_agent');
  const [simConnector, setSimConnector] = useState<string>('ERP.CorporateBanking');
  const [simAction, setSimAction] = useState<string>('data.read');
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<{
    is_authorized: boolean;
    decision: string;
    reason: string;
    policy_id: string | null;
    data_classification: string;
    evaluated_at: string;
  } | null>(null);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const isAuthorizedToEdit = useMemo(() => {
    const role = (userRole || '').toUpperCase();
    return role === 'TENANT_OWNER' || role === 'TENANT_ADMIN';
  }, [userRole]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchMatrix = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/permissions/matrix`);
      if (!res.ok) {
        throw new Error(`Gagal memuat matriks izin data: HTTP ${res.status}`);
      }
      const data = await res.json();
      setPersonas(data.personas || []);
      setConnectors(data.connectors || []);
      setMatrix(data.matrix || {});
      setTotalPolicies(data.total_configured_policies || 0);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memuat matriks izin.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setAuditLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/permissions/audit-logs?limit=40`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Gagal mengambil riwayat audit:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      fetchMatrix();
    }
  }, [tenantId]);

  const handleUpdateCell = async (
    personaType: string,
    connectorCode: string,
    newLevel: AccessLevel
  ) => {
    if (!isAuthorizedToEdit) {
      showToast('Akses ditolak: Hanya TENANT_OWNER atau TENANT_ADMIN yang dapat mengubah matriks izin.', 'error');
      return;
    }

    const cellKey = `${personaType}:${connectorCode}`;
    setSavingCell(cellKey);

    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/permissions/matrix/cell`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_persona_type: personaType,
          connector_code: connectorCode,
          access_level: newLevel,
          data_classification: 'internal',
          user_role: userRole,
          user_id: userId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || errData.detail || 'Gagal menyimpan perubahan kebijakan.');
      }

      const resData = await res.json();

      // Update local state matrix optimistically
      setMatrix((prev) => {
        const updated = { ...prev };
        if (!updated[personaType]) updated[personaType] = {};

        if (newLevel === 'NONE') {
          delete updated[personaType][connectorCode];
        } else {
          updated[personaType][connectorCode] = {
            policy_id: resData.policy_id || 'active',
            access_level: newLevel,
            effect: 'ALLOW',
            action: newLevel === 'READ_ONLY' ? 'data.read' : '*',
            data_classification: 'internal',
            priority: newLevel === 'ADMIN' ? 200 : 100,
            updated_at: new Date().toISOString(),
          };
        }
        return updated;
      });

      setActiveCellCoord(null);
      showToast(
        newLevel === 'NONE'
          ? `Izin dicabut untuk ${personaType} -> ${connectorCode}. Berstatus fail-closed Zero-Trust.`
          : `Izin diperbarui ke ${newLevel} dan tercatat di Audit Ledger.`,
        'success'
      );

      // If live simulator is open for this exact pair, rerun evaluation
      if (simPersona === personaType && simConnector === connectorCode) {
        handleRunEvaluation(personaType, connectorCode);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui izin.', 'error');
    } finally {
      setSavingCell(null);
    }
  };

  const handleRunEvaluation = async (pType?: string, cCode?: string) => {
    const targetPersona = pType || simPersona;
    const targetConnector = cCode || simConnector;

    setSimLoading(true);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/permissions/evaluate-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_persona_type: targetPersona,
          connector_code: targetConnector,
          action: simAction,
          data_classification: 'restricted',
          resource_type: 'enterprise_system',
        }),
      });

      if (!res.ok) {
        throw new Error(`Evaluasi PDP gagal dengan HTTP ${res.status}`);
      }

      const data = await res.json();
      setSimResult({
        is_authorized: data.is_authorized,
        decision: data.decision,
        reason: data.reason,
        policy_id: data.policy_id,
        data_classification: data.data_classification || 'restricted',
        evaluated_at: new Date().toLocaleTimeString(),
      });
    } catch (err: any) {
      showToast(err.message || 'Gagal menjalankan evaluasi PDP.', 'error');
    } finally {
      setSimLoading(false);
    }
  };

  // Departments list for filter
  const departments = useMemo(() => {
    const depts = new Set<string>();
    personas.forEach((p) => depts.add(p.department));
    return ['ALL', ...Array.from(depts)];
  }, [personas]);

  // Filtered Personas
  const filteredPersonas = useMemo(() => {
    return personas.filter((p) => {
      const matchesSearch =
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.persona_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.role_title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = selectedDept === 'ALL' || p.department === selectedDept;
      return matchesSearch && matchesDept;
    });
  }, [personas, searchQuery, selectedDept]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-slate-100 p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <SkeletonLoader className="h-8 w-64" />
            <SkeletonLoader className="h-10 w-36" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SkeletonLoader className="h-24 w-full" />
            <SkeletonLoader className="h-24 w-full" />
            <SkeletonLoader className="h-24 w-full" />
            <SkeletonLoader className="h-24 w-full" />
          </div>
          <SkeletonLoader className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-slate-100 p-6 md:p-8 flex items-center justify-center">
        <div className="max-w-lg w-full">
          <ErrorState
            title="Gagal Memuat Matriks Izin Data"
            message={error}
            onRetry={fetchMatrix}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-100 font-sans pb-16 selection:bg-emerald-500/30">
      {/* Top Header */}
      <div className="border-b border-slate-800/90 bg-[#0F172A]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 text-slate-300 transition-colors"
                title="Kembali"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">
                  Matriks Izin Akses Data AI
                </h1>
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ABAC Policy Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Organisasi: <span className="text-slate-200 font-medium">{tenantName}</span> • Peran: <span className={`font-semibold ${isAuthorizedToEdit ? 'text-emerald-400' : 'text-amber-400'}`}>{userRole}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setShowAuditDrawer(true);
                fetchAuditLogs();
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all shadow-sm cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-sky-400" />
              <span>Audit Ledger</span>
            </button>

            <button
              type="button"
              onClick={fetchMatrix}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-all cursor-pointer"
              title="Segarkan Matriks"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Segarkan</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6 space-y-6">
        {/* Role Notice Banner */}
        {!isAuthorizedToEdit && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-semibold text-amber-300 block">
                Mode Hanya Baca: Izin Pengubahan Terbatas
              </span>
              <p className="text-slate-300 leading-relaxed">
                Anda masuk dengan peran <strong className="text-white">{userRole}</strong>. Matriks di bawah ini ditampilkan dalam mode observasi. Sesuai kebijakan tata kelola zero-trust, hanya <strong className="text-white">TENANT_OWNER</strong> atau <strong className="text-white">TENANT_ADMIN</strong> yang memiliki wewenang untuk mengubah atau mencabut izin akses data agen AI ke sistem korporat.
              </p>
            </div>
          </div>
        )}

        {/* Statistical Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
            <span className="text-xs font-semibold text-slate-400">Total Persona AI Terdaftar</span>
            <div className="text-2xl font-bold text-white mt-1 flex items-center justify-between">
              <span>{personas.length}</span>
              <Users className="w-5 h-5 text-sky-400 opacity-80" />
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">8 Persona Standar Korporat</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
            <span className="text-xs font-semibold text-slate-400">Koneksi Sistem Korporat</span>
            <div className="text-2xl font-bold text-white mt-1 flex items-center justify-between">
              <span>{connectors.length}</span>
              <Database className="w-5 h-5 text-emerald-400 opacity-80" />
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Integration Fabric & Core Gateway</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
            <span className="text-xs font-semibold text-slate-400">Kebijakan Izin Ditetapkan</span>
            <div className="text-2xl font-bold text-white mt-1 flex items-center justify-between">
              <span className="text-emerald-400">{totalPolicies}</span>
              <Key className="w-5 h-5 text-emerald-400 opacity-80" />
            </div>
            <span className="text-[11px] text-emerald-400/80 mt-1 block">Aturan Eksplisit Aktif</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
            <span className="text-xs font-semibold text-slate-400">Zero-Trust Baseline</span>
            <div className="text-sm font-bold text-slate-200 mt-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>DENIED_NO_POLICY</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Default Fail-Closed Aktif</span>
          </div>
        </div>

        {/* Live PDP Evaluation Sandbox (Proving Ground & Acceptance Testing) */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-[#0E1726] to-[#0A101D] border border-slate-800 shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                <Play className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Simulator Evaluasi PDP (Policy Decision Point)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    Kriteria Penerimaan Standar
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Uji keputusan otorisasi nyata: verifikasi kegagalan zero-trust (DENIED_NO_POLICY) vs izin eksplisit.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSimPersona('hr_agent');
                  setSimConnector('ERP.CorporateBanking');
                  setSimAction('data.read');
                  handleRunEvaluation('hr_agent', 'ERP.CorporateBanking');
                }}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-semibold transition-all cursor-pointer"
              >
                Uji: HR Agent → ERP.CorporateBanking
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-4">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                AI Agent Persona
              </label>
              <select
                value={simPersona}
                onChange={(e) => setSimPersona(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {personas.map((p) => (
                  <option key={p.persona_type} value={p.persona_type}>
                    {p.display_name} ({p.department})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-4">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Target Sistem Korporat (Resource)
              </label>
              <select
                value={simConnector}
                onChange={(e) => setSimConnector(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {connectors.map((c) => (
                  <option key={c.connector_code} value={c.connector_code}>
                    {c.connector_code} - {c.connector_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Aksi Otorisasi
              </label>
              <select
                value={simAction}
                onChange={(e) => setSimAction(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="data.read">data.read (Baca)</option>
                <option value="data.write">data.write (Tulis)</option>
                <option value="*">* (Semua Aksi)</option>
              </select>
            </div>

            <div className="md:col-span-2 flex items-end">
              <button
                type="button"
                disabled={simLoading}
                onClick={() => handleRunEvaluation()}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {simLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>Evaluasi PDP</span>
              </button>
            </div>
          </div>

          {/* Result Box */}
          {simResult && (
            <div className={`mt-4 p-4 rounded-xl border text-xs transition-all ${
              simResult.is_authorized
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/40 border-red-500/40 text-red-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5 mb-2.5">
                <div className="flex items-center gap-2">
                  {simResult.is_authorized ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span className="font-bold text-sm">
                    Hasil Keputusan: <span className="font-mono">{simResult.decision}</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    simResult.is_authorized
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}>
                    {simResult.is_authorized ? 'TEROTORISASI' : 'DITOLAK'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Waktu Evaluasi: {simResult.evaluated_at} • Klasifikasi: {simResult.data_classification}
                </div>
              </div>

              <p className="text-slate-300 leading-relaxed font-sans">
                {simResult.reason}
              </p>

              <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-[11px]">
                <div className="flex items-center gap-2 text-slate-400">
                  <Shield className="w-3.5 h-3.5 text-slate-500" />
                  <span>Jejak Audit: Dicatat ke tabel <code className="text-slate-200">audit_logs</code> dengan isolasi RLS.</span>
                </div>

                {isAuthorizedToEdit && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Ubah Izin Cepat:</span>
                    {simResult.is_authorized ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateCell(simPersona, simConnector, 'NONE')}
                        className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-[11px] font-semibold cursor-pointer"
                      >
                        Cabut Izin (Set to NONE)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUpdateCell(simPersona, simConnector, 'READ_ONLY')}
                        className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold cursor-pointer"
                      >
                        Beri Izin READ_ONLY
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Matrix Filter & Search Toolbar */}
        <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                aria-label="Cari Persona AI"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d === 'ALL' ? 'Semua Departemen' : d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Matrix Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Legenda:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
              <span>NONE (Fail-Closed)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
              <span>READ_ONLY</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>READ_WRITE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              <span>ADMIN</span>
            </div>
          </div>
        </div>

        {/* The Visual Matrix Table */}
        <div className="rounded-2xl border border-slate-800 bg-[#0F172A] overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  {/* Sticky Top-Left Corner Header */}
                  <th className="p-4 text-xs font-bold text-slate-300 uppercase tracking-wider min-w-[240px] sticky left-0 z-10 bg-slate-900/95 border-r border-slate-800">
                    AI Agent Persona
                  </th>

                  {/* Columns: Enterprise System Connections */}
                  {connectors.map((conn) => (
                    <th
                      key={conn.connector_code}
                      className="p-4 text-xs font-semibold text-slate-200 min-w-[200px] border-r border-slate-800 last:border-r-0"
                    >
                      <div className="flex items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-bold text-white font-mono text-[13px]">{conn.connector_code}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                        {conn.connector_name}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${
                          conn.data_classification === 'restricted'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : conn.data_classification === 'confidential'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-slate-700 text-slate-300'
                        }`}>
                          {conn.data_classification}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {conn.connector_type}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/80">
                {filteredPersonas.map((persona) => (
                  <tr key={persona.persona_type} className="hover:bg-slate-850/50 transition-colors">
                    {/* Sticky Row Header: Persona */}
                    <td className="p-4 sticky left-0 z-10 bg-[#0F172A] border-r border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0 font-bold text-xs">
                          {persona.display_name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">
                            {persona.display_name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {persona.role_title}
                          </div>
                          <span className="text-[10px] font-mono text-emerald-400/80 mt-0.5 inline-block">
                            {persona.department}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Cells: Persona x Connection */}
                    {connectors.map((conn) => {
                      const cellPolicy = matrix[persona.persona_type]?.[conn.connector_code];
                      const level: AccessLevel = cellPolicy ? cellPolicy.access_level : 'NONE';
                      const cellKey = `${persona.persona_type}:${conn.connector_code}`;
                      const isSavingThis = savingCell === cellKey;
                      const isPopoverOpen =
                        activeCellCoord?.persona === persona.persona_type &&
                        activeCellCoord?.connector === conn.connector_code;

                      return (
                        <td
                          key={conn.connector_code}
                          className="p-3 border-r border-slate-800 last:border-r-0 text-center relative"
                        >
                          <div className="flex flex-col items-center justify-center">
                            {/* Cell Badge / Button */}
                            <button
                              type="button"
                              disabled={!isAuthorizedToEdit || isSavingThis}
                              onClick={() => {
                                if (isAuthorizedToEdit) {
                                  setActiveCellCoord(
                                    isPopoverOpen ? null : { persona: persona.persona_type, connector: conn.connector_code }
                                  );
                                }
                              }}
                              className={`w-full max-w-[170px] py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-1.5 transition-all shadow-sm ${
                                isAuthorizedToEdit
                                  ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
                                  : 'cursor-default opacity-85'
                              } ${
                                level === 'NONE'
                                  ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                                  : level === 'READ_ONLY'
                                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
                                  : level === 'READ_WRITE'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                                  : 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {level === 'NONE' ? (
                                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                                ) : (
                                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                                <span className="font-mono text-[11px] truncate">
                                  {level === 'NONE' ? 'NONE' : level}
                                </span>
                              </div>

                              {isSavingThis ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                              ) : isAuthorizedToEdit ? (
                                <ChevronDown className="w-3 h-3 text-slate-500" />
                              ) : (
                                <Lock className="w-3 h-3 text-slate-600" />
                              )}
                            </button>

                            {/* Status description pill */}
                            <span className="text-[10px] text-slate-500 mt-1 font-mono">
                              {level === 'NONE' ? 'DENIED_NO_POLICY' : 'ALLOW'}
                            </span>
                          </div>

                          {/* Popover Level Selector Dropdown */}
                          {isPopoverOpen && isAuthorizedToEdit && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 p-2 rounded-2xl bg-[#0B1220] border border-slate-700 shadow-2xl z-30 space-y-1 text-left animate-in fade-in zoom-in-95 duration-150">
                              <div className="px-2 py-1 border-b border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                                <span>Pilih Tingkat Akses</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveCellCoord(null)}
                                  className="text-slate-500 hover:text-white"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleUpdateCell(persona.persona_type, conn.connector_code, 'NONE')}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                  level === 'NONE'
                                    ? 'bg-slate-800 text-white font-bold'
                                    : 'text-slate-300 hover:bg-slate-800/60'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                                  <div>
                                    <div className="font-semibold">NONE</div>
                                    <div className="text-[10px] text-slate-500">Fail-closed Zero-Trust</div>
                                  </div>
                                </div>
                                {level === 'NONE' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleUpdateCell(persona.persona_type, conn.connector_code, 'READ_ONLY')}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                  level === 'READ_ONLY'
                                    ? 'bg-sky-500/20 text-sky-200 font-bold'
                                    : 'text-slate-300 hover:bg-slate-800/60'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Unlock className="w-3.5 h-3.5 text-sky-400" />
                                  <div>
                                    <div className="font-semibold">READ_ONLY</div>
                                    <div className="text-[10px] text-slate-500">Izin baca data.read</div>
                                  </div>
                                </div>
                                {level === 'READ_ONLY' && <Check className="w-3.5 h-3.5 text-sky-400" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleUpdateCell(persona.persona_type, conn.connector_code, 'READ_WRITE')}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                  level === 'READ_WRITE'
                                    ? 'bg-emerald-500/20 text-emerald-200 font-bold'
                                    : 'text-slate-300 hover:bg-slate-800/60'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                                  <div>
                                    <div className="font-semibold">READ_WRITE</div>
                                    <div className="text-[10px] text-slate-500">Baca & modifikasi data</div>
                                  </div>
                                </div>
                                {level === 'READ_WRITE' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleUpdateCell(persona.persona_type, conn.connector_code, 'ADMIN')}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                  level === 'ADMIN'
                                    ? 'bg-purple-500/20 text-purple-200 font-bold'
                                    : 'text-slate-300 hover:bg-slate-800/60'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Shield className="w-3.5 h-3.5 text-purple-400" />
                                  <div>
                                    <div className="font-semibold">ADMIN</div>
                                    <div className="text-[10px] text-slate-500">Kontrol penuh & prioritas 200</div>
                                  </div>
                                </div>
                                {level === 'ADMIN' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Audit Ledger Drawer (Modal / Sidebar) */}
      {showAuditDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-[#0F172A] border-l border-slate-800 h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 md:p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Jejak Audit Izin Data AI</h3>
                  <p className="text-xs text-slate-400">
                    Tercatat nyata pada tabel <code className="text-sky-300">audit_logs</code> Supabase
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditDrawer(false)}
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
              {auditLoading ? (
                <div className="space-y-3">
                  <SkeletonLoader className="h-16 w-full" />
                  <SkeletonLoader className="h-16 w-full" />
                  <SkeletonLoader className="h-16 w-full" />
                </div>
              ) : auditLogs.length === 0 ? (
                <EmptyState
                  title="Belum Ada Jejak Audit"
                  description="Aktivitas pengubahan izin atau evaluasi akses PDP akan otomatis tercatat secara permanen di sini."
                />
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-emerald-400 text-[11px]">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                      </span>
                    </div>

                    <div className="text-slate-300 font-sans">
                      Aktor: <span className="font-semibold text-white">{log.actor_type}</span> • Tipe Resource: <span className="text-slate-200">{log.resource_type}</span>
                    </div>

                    {log.payload && (
                      <div className="p-2 rounded bg-black/40 text-[11px] font-mono text-slate-400 overflow-x-auto">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.payload, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Total Catatan: {auditLogs.length}</span>
              <button
                type="button"
                onClick={fetchAuditLogs}
                className="flex items-center gap-1.5 text-sky-400 hover:text-sky-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
          <div className={`p-4 rounded-xl shadow-2xl border text-xs flex items-center gap-2.5 ${
            toast.type === 'success'
              ? 'bg-[#062016] border-emerald-500/50 text-emerald-200'
              : toast.type === 'error'
              ? 'bg-[#2B0E14] border-red-500/50 text-red-200'
              : 'bg-[#0E1E38] border-sky-500/50 text-sky-200'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};
