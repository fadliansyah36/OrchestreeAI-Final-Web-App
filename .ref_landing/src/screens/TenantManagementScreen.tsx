import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  Clock,
  Trash2,
  Edit2,
  Ban,
  CheckCircle,
  Users,
  PieChart,
  BarChart3,
  Layers,
  Activity,
  Target,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  TenantItem,
  SupportImpersonationSession,
  CustomerProfileIntelligenceSummary,
} from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const TenantManagementScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tenants' | 'customer_profiles'>('tenants');

  // Tab 1: Tenant Governance State
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newTenantName, setNewTenantName] = useState<string>('');
  const [newTenantTier, setNewTenantTier] = useState<string>('starter');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);

  // Support Impersonation Modal State
  const [impersonateTenant, setImpersonateTenant] = useState<TenantItem | null>(null);
  const [impersonateReason, setImpersonateReason] = useState<string>('');
  const [impersonateDuration, setImpersonateDuration] = useState<number>(15);
  const [activeSession, setActiveSession] = useState<SupportImpersonationSession | null>(null);

  // Tab 2: Customer Profile Intelligence State
  const [profileData, setProfileData] = useState<CustomerProfileIntelligenceSummary | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<HonestErrorInfo | null>(null);

  const fetchTenants = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const data = await api.getTenants();
      setTenants(data);

      const localSession = api.getActiveSupportImpersonation();
      if (localSession?.sessionId) {
        try {
          const backendSession = await api.getSupportImpersonation(localSession.sessionId);
          if (backendSession) {
            setActiveSession({ ...localSession, ...backendSession });
          } else {
            setActiveSession(localSession);
          }
        } catch {
          setActiveSession(localSession);
        }
      } else {
        setActiveSession(null);
      }
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/tenants',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat daftar tenant dari backend.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memuat daftar tenant.' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCustomerProfiles = async () => {
    setIsProfileLoading(true);
    setProfileError(null);
    try {
      const res = await api.getCustomerProfileIntelligence();
      setProfileData(res);
    } catch (err: any) {
      setProfileError({
        endpoint: '/admin/customer-profile/intelligence',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat telemetri Customer Profile Intelligence.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsProfileLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();

    const handleSessionChange = (e: any) => {
      setActiveSession(e.detail);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('orchestree:support-session-changed', handleSessionChange);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('orchestree:support-session-changed', handleSessionChange);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'customer_profiles') {
      fetchCustomerProfiles();
    }
  }, [activeTab]);

  const handleRefresh = () => {
    if (activeTab === 'tenants') {
      fetchTenants();
    } else {
      fetchCustomerProfiles();
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    setIsSubmitting(true);
    setBackendError(null);
    try {
      await api.createTenant({
        name: newTenantName.trim(),
        tier: newTenantTier,
        ownerEmail: `admin@${newTenantName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tenant'}.orchestree.biz.id`,
      });
      setMessage({ type: 'success', text: `Tenant "${newTenantName}" berhasil dibuat.` });
      setNewTenantName('');
      setIsModalOpen(false);
      fetchTenants();
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/tenants',
        status: err?.status || 500,
        message: err?.message || 'Gagal membuat tenant di backend.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal membuat tenant.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTenantStatus = async (tenant: TenantItem) => {
    const nextStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api.updateTenantStatus(tenant.id, nextStatus);
      setMessage({ type: 'success', text: `Status tenant "${tenant.name}" diubah menjadi ${nextStatus}.` });
      fetchTenants();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/tenants/${tenant.id}/status`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memperbarui status tenant.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const handleDeleteTenant = async (tenant: TenantItem) => {
    if (!window.confirm(`Yakin ingin menghapus tenant "${tenant.name}"? Tindakan ini permanen.`)) return;
    try {
      await api.deleteTenant(tenant.id);
      setMessage({ type: 'success', text: `Tenant "${tenant.name}" berhasil dihapus.` });
      fetchTenants();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/tenants/${tenant.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menghapus tenant.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const handleStartSupportMode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!impersonateTenant || !impersonateReason.trim()) return;
    setIsSubmitting(true);
    try {
      const session = await api.createSupportImpersonation({
        targetTenantId: impersonateTenant.id,
        tenantName: impersonateTenant.name,
        ownerEmail: `owner@${impersonateTenant.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tenant'}.orchestree.biz.id`,
        reason: impersonateReason.trim(),
        durationMinutes: impersonateDuration,
      });
      setActiveSession(session);
      setMessage({
        type: 'success',
        text: `Support Mode diaktifkan untuk tenant "${impersonateTenant.name}" selama ${impersonateDuration} menit. Notifikasi terkirim ke Tenant Owner.`,
      });
      setImpersonateTenant(null);
      setImpersonateReason('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal mengaktifkan Support Mode.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndSupportMode = () => {
    api.endSupportImpersonation();
    setActiveSession(null);
    setMessage({ type: 'success', text: 'Support Mode telah diakhiri secara manual.' });
  };

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.id.toLowerCase().includes(search.toLowerCase()) ||
    (t.tier && t.tier.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <span>Multi-Tenant Governance & Customer Profile Intelligence</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Super Admin scope platform-wide. Manajemen isolasi database, alokasi paket, dan inteligensi profil segmen pelanggan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${(activeTab === 'tenants' ? isLoading : isProfileLoading) ? 'animate-spin' : ''}`} />
          </button>
          {activeTab === 'tenants' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Tenant Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 flex-wrap">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'tenants'
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Tata Kelola Tenant & Sesi Support</span>
        </button>
        <button
          onClick={() => setActiveTab('customer_profiles')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'customer_profiles'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Customer Profile Intelligence (CustomerProfile)</span>
        </button>
      </div>

      {/* TAB 1: Tenants Governance */}
      {activeTab === 'tenants' && (
        <div className="space-y-6">
          {/* Honest Backend Error Banner */}
          <HonestErrorBanner error={backendError} onRetry={fetchTenants} isRetrying={isLoading} />

          {/* Active Support Impersonation Banner */}
          {activeSession && (
            <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-900/60 border border-amber-700/60 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <UserCheck className="w-4 h-4 text-amber-400" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold flex flex-wrap items-center gap-2">
                    <span>SUPPORT IMPERSONATION AKTIF: {activeSession.tenantName}</span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-900/80 border border-amber-700 text-amber-300">
                      ID: {activeSession.sessionId}
                    </span>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-amber-900/80 border border-amber-700 text-amber-300">
                      {Math.max(0, Math.ceil((activeSession.expiresAt - Date.now()) / 60000))}m tersisa
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-300/80">
                    Alasan: "{activeSession.reason}" • Notifikasi audit dikirim ke Owner ({activeSession.ownerEmail}) • Sesi terverifikasi via <code className="text-amber-200 font-mono">GET /admin/support/impersonate/{activeSession.sessionId}</code>
                  </p>
                </div>
              </div>
              <button
                onClick={handleEndSupportMode}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition self-end sm:self-auto shrink-0"
              >
                Akhiri Sesi Impersonasi
              </button>
            </div>
          )}

          {message && (
            <div
              className={`p-3 text-xs rounded-lg border ${
                message.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari tenant berdasarkan nama, id, atau paket..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Tenants Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Nama Tenant</th>
                    <th className="px-4 py-3">ID Tenant</th>
                    <th className="px-4 py-3">Paket Komersial</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Workforce</th>
                    <th className="px-4 py-3 text-right">Aksi Super Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Tidak ada data tenant ditemukan.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((tenant) => {
                      const isCurrentlyImpersonated = activeSession?.targetTenantId === tenant.id;
                      return (
                        <tr key={tenant.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 font-semibold text-white">
                            <div className="flex items-center gap-2">
                              <span>{tenant.name}</span>
                              {isCurrentlyImpersonated && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold">
                                  IN SUPPORT
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">{tenant.id}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 uppercase">
                              {tenant.tier || 'STARTER'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                tenant.status === 'ACTIVE'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {tenant.status || 'ACTIVE'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-mono text-slate-300">
                              {tenant.agentCount ?? 0} AI / {tenant.userCount ?? 0} Human
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isCurrentlyImpersonated ? (
                                <button
                                  onClick={handleEndSupportMode}
                                  className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition"
                                >
                                  End Support
                                </button>
                              ) : (
                                <button
                                  onClick={() => setImpersonateTenant(tenant)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] transition flex items-center gap-1"
                                  title="Masuk sebagai Tenant (Support Mode)"
                                >
                                  <UserCheck className="w-3 h-3 text-indigo-400" />
                                  <span>Masuk sebagai Tenant</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleToggleTenantStatus(tenant)}
                                className={`p-1 rounded border text-[11px] transition ${
                                  tenant.status === 'ACTIVE'
                                    ? 'bg-amber-950/40 hover:bg-amber-900/60 border-amber-800/60 text-amber-300'
                                    : 'bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-800/60 text-emerald-300'
                                }`}
                                title={tenant.status === 'ACTIVE' ? 'Suspend Tenant' : 'Aktifkan Tenant'}
                              >
                                {tenant.status === 'ACTIVE' ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                onClick={() => handleDeleteTenant(tenant)}
                                className="p-1 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-400 transition"
                                title="Hapus Tenant"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Customer Profile Intelligence */}
      {activeTab === 'customer_profiles' && (
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
                  Super Admin hanya memiliki visibilitas pada <strong className="text-white">segmentasi pelanggan makro, agregasi RFM, dan skor risiko churn lintas organisasi</strong>. Dilarang keras menampilkan data identitas perorangan, email atau kontak customer akhir, ataupun riwayat transaksi spesifik personal.
                </p>
              </div>
            </div>
          </div>

          <HonestErrorBanner
            error={profileError}
            onRetry={fetchCustomerProfiles}
            isRetrying={isProfileLoading}
            title="Telemetri Endpoint Customer Profile Intelligence (Status Backend Nyata)"
          />

          {profileData && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Total Tracked Profiles</span>
                  <div className="text-2xl font-bold text-white tracking-tight mt-1">
                    {profileData.totalTrackedProfiles.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[11px] text-cyan-400 mt-2 font-mono">
                    Profil teragregasi platform
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Aggregated Churn Risk Index</span>
                  <div className="text-2xl font-bold text-amber-400 tracking-tight mt-1">
                    {profileData.aggregatedChurnRiskIndex}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    Tingkat risiko churn makro
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Segmen Enterprise</span>
                  <div className="text-2xl font-bold text-emerald-400 tracking-tight mt-1">
                    {profileData.segmentDistribution.find((s) => s.segment === 'ENTERPRISE')?.percentage || 0}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    {profileData.segmentDistribution.find((s) => s.segment === 'ENTERPRISE')?.tenantCount || 0} tenant organisasi
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-400">Healthy Tier</span>
                  <div className="text-2xl font-bold text-indigo-400 tracking-tight mt-1">
                    {profileData.healthScoreDistribution.find((h) => h.tier === 'HEALTHY')?.percentage || 0}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    {profileData.healthScoreDistribution.find((h) => h.tier === 'HEALTHY')?.count || 0} profil berstatus prima
                  </div>
                </div>
              </div>

              {/* Segment Distribution & Health Score */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Segment Distribution */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-indigo-400" />
                    <span>Distribusi Segmen Pelanggan (Segment Distribution)</span>
                  </h3>
                  <div className="space-y-3">
                    {profileData.segmentDistribution.map((seg, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-white">{seg.segment}</span>
                          <span className="font-bold text-indigo-400 font-mono">{seg.percentage}%</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>{seg.tenantCount} Organisasi</span>
                          <span>Retensi Rata-rata: {seg.avgRetentionMonths} Bulan</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full"
                            style={{ width: `${Math.min(100, seg.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Health Score Distribution */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Distribusi Skor Kesehatan Pelanggan (Health Score Tiers)</span>
                  </h3>
                  <div className="space-y-3">
                    {profileData.healthScoreDistribution.map((tier, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-white">{tier.tier}</span>
                          <span className="font-bold text-slate-200 font-mono">{tier.count.toLocaleString('id-ID')} Akun</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Porsi Platform</span>
                          <span>{tier.percentage}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              tier.tier === 'HEALTHY'
                                ? 'bg-emerald-500'
                                : tier.tier === 'NEUTRAL'
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, tier.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RFM Quintiles Analysis */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  <span>Analisis RFM Teragregasi (Recency, Frequency, Monetary Quintiles)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {profileData.rfmQuintiles.map((q, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                      <div className="font-bold text-white text-center pb-1 border-b border-slate-800">
                        {q.quintile}
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                        <span>Porsi Pelanggan</span>
                        <span className="text-slate-200 font-semibold">{q.customerPercentage}%</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Porsi Revenue</span>
                        <span className="text-cyan-400 font-bold">{q.revenueSharePercentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal Tambah Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              <span>Daftarkan Tenant Baru</span>
            </h3>
            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Organisasi / Perusahaan</label>
                <input
                  type="text"
                  required
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="Contoh: PT Inovasi Maju Bersama"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Paket Komersial Awal</label>
                <select
                  value={newTenantTier}
                  onChange={(e) => setNewTenantTier(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 uppercase"
                >
                  <option value="starter">STARTER</option>
                  <option value="pro">PRO</option>
                  <option value="enterprise">ENTERPRISE</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Mendaftarkan...' : 'Simpan Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Support Impersonation Mode */}
      {impersonateTenant && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-950/80 border border-amber-800/80 flex items-center justify-center text-amber-400 shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Support Impersonation Mode</h3>
                <p className="text-xs text-slate-400 mt-0.5">Akses asistensi teknis terisolasi & diaudit penuh</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Target Tenant:</span>
                <span className="font-semibold text-white">{impersonateTenant.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tenant ID:</span>
                <span className="font-mono text-slate-300 text-[11px]">{impersonateTenant.id}</span>
              </div>
            </div>

            <form onSubmit={handleStartSupportMode} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Alasan Masuk (Ticket Reference / Deskripsi Insiden)
                </label>
                <textarea
                  required
                  rows={3}
                  value={impersonateReason}
                  onChange={(e) => setImpersonateReason(e.target.value)}
                  placeholder="Contoh: Investigasi bottleneck webhook WhatsApp pada ticket #SUP-8821..."
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Durasi Sesi Support</label>
                <select
                  value={impersonateDuration}
                  onChange={(e) => setImpersonateDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value={15}>15 Menit (Investigasi Singkat)</option>
                  <option value={30}>30 Menit (Debugging Standar)</option>
                  <option value={60}>60 Menit (Resolusi Kompleks)</option>
                </select>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Sesi ini akan dicatat ke Immutable Security Audit Log dan mengirimkan notifikasi audit otomatis ke Tenant Owner.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setImpersonateTenant(null)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Mengaktifkan...' : 'Mulai Sesi Support'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

