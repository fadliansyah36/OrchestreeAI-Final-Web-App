import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Key,
  Trash2,
  Power,
  X,
  Radio,
  MessageSquare,
  ShieldAlert,
  Globe,
  Activity,
  Zap,
  Pencil,
  AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { AppRegistryItem, ChannelAccountMonitoringSummary, ChannelAccountItem } from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const ThirdPartyAppRegistryManagementScreen: React.FC = () => {
  // Tab State
  const [activeTab, setActiveTab] = useState<'registry' | 'channel_accounts'>('registry');

  // App Registry State
  const [apps, setApps] = useState<AppRegistryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);

  // Channel Accounts Telemetry State
  const [channelSummary, setChannelSummary] = useState<ChannelAccountMonitoringSummary | null>(null);
  const [isChannelsLoading, setIsChannelsLoading] = useState<boolean>(false);
  const [channelsError, setChannelsError] = useState<HonestErrorInfo | null>(null);
  const [selectedChannelType, setSelectedChannelType] = useState<string>('ALL');

  // Create Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [appName, setAppName] = useState<string>('');
  const [appType, setAppType] = useState<string>('CRM');
  const [clientId, setClientId] = useState<string>('');
  const [authType, setAuthType] = useState<string>('OAuth 2.0');
  const [scopesStr, setScopesStr] = useState<string>('read, write');

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingApp, setEditingApp] = useState<AppRegistryItem | null>(null);
  const [editAppName, setEditAppName] = useState<string>('');
  const [editAppType, setEditAppType] = useState<string>('CRM');
  const [editClientId, setEditClientId] = useState<string>('');
  const [editAuthType, setEditAuthType] = useState<string>('OAuth 2.0');
  const [editScopesStr, setEditScopesStr] = useState<string>('');
  const [editCapabilityStatus, setEditCapabilityStatus] = useState<string>('PRODUCTION_READY');
  const [editMigrationNotice, setEditMigrationNotice] = useState<string>('');
  const [isEditSubmitting, setIsEditSubmitting] = useState<boolean>(false);

  // Mark Migration State
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState<boolean>(false);
  const [migratingApp, setMigratingApp] = useState<AppRegistryItem | null>(null);
  const [migrationReason, setMigrationReason] = useState<string>('');
  const [isMigrationSubmitting, setIsMigrationSubmitting] = useState<boolean>(false);

  const fetchApps = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const data = await api.getAppRegistry();
      setApps(data);
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/app-registry',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat registry aplikasi pihak ketiga.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memuat registry aplikasi pihak ketiga.' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChannelAccounts = async () => {
    setIsChannelsLoading(true);
    setChannelsError(null);
    try {
      const res = await api.getChannelAccountsMonitoring({
        channelType: selectedChannelType !== 'ALL' ? selectedChannelType : undefined,
      });
      setChannelSummary(res);
    } catch (err: any) {
      setChannelsError({
        endpoint: '/admin/channels/monitoring',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat telemetri Multi-Channel Accounts.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsChannelsLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  useEffect(() => {
    if (activeTab === 'channel_accounts') {
      fetchChannelAccounts();
    }
  }, [activeTab, selectedChannelType]);

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim()) return;
    setIsSubmitting(true);
    try {
      const scopes = scopesStr.split(',').map((s) => s.trim()).filter(Boolean);
      await api.createAppRegistry({
        appName: appName.trim(),
        appType,
        clientId: clientId.trim() || `app_${Math.random().toString(36).substring(2, 9)}`,
        authType,
        scopes,
      });
      setMessage({ type: 'success', text: `Aplikasi "${appName}" berhasil didaftarkan.` });
      setIsModalOpen(false);
      setAppName('');
      setClientId('');
      fetchApps();
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/app-registry',
        status: err?.status || 500,
        message: err?.message || 'Gagal mendaftarkan aplikasi.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleConnection = async (app: AppRegistryItem) => {
    const nextState = !app.isConnected;
    try {
      await api.updateAppRegistry(app.id, { isConnected: nextState });
      setMessage({
        type: 'success',
        text: `Status koneksi "${app.appName}" diubah ke ${nextState ? 'CONNECTED' : 'DISCONNECTED'}.`,
      });
      fetchApps();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/app-registry/${app.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memperbarui status koneksi aplikasi.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const handleDeleteApp = async (app: AppRegistryItem) => {
    if (!window.confirm(`Yakin ingin menghapus aplikasi "${app.appName}" dari registry?`)) return;
    try {
      await api.deleteAppRegistry(app.id);
      setMessage({ type: 'success', text: `Aplikasi "${app.appName}" berhasil dihapus.` });
      fetchApps();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/app-registry/${app.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menghapus aplikasi.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const openEditModal = (app: AppRegistryItem) => {
    setEditingApp(app);
    setEditAppName(app.appName);
    setEditAppType(app.appType);
    setEditClientId(app.clientId || '');
    setEditAuthType(app.authType || 'OAuth 2.0');
    setEditScopesStr((app.scopes || []).join(', '));
    setEditCapabilityStatus(app.capabilityStatus || 'PRODUCTION_READY');
    setEditMigrationNotice(app.manualLinkMigrationNotice || '');
    setIsEditModalOpen(true);
  };

  const handleUpdateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingApp || !editAppName.trim()) return;
    setIsEditSubmitting(true);
    try {
      const scopes = editScopesStr.split(',').map((s) => s.trim()).filter(Boolean);
      await api.updateAppRegistry(editingApp.id, {
        appName: editAppName.trim(),
        appType: editAppType,
        clientId: editClientId.trim(),
        authType: editAuthType,
        scopes,
        capabilityStatus: editCapabilityStatus,
        manualLinkMigrationNotice: editMigrationNotice.trim() || undefined,
      });
      setMessage({ type: 'success', text: `Aplikasi "${editAppName}" berhasil diperbarui.` });
      setIsEditModalOpen(false);
      fetchApps();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/app-registry/${editingApp.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memperbarui aplikasi.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const openMigrationModal = (app: AppRegistryItem) => {
    setMigratingApp(app);
    setMigrationReason(app.manualLinkMigrationNotice || 'Migrasi ke spesifikasi API/OAuth terbaru diperlukan sebelum tenggat waktu.');
    setIsMigrationModalOpen(true);
  };

  const handleMarkMigration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!migratingApp || !migrationReason.trim()) return;
    setIsMigrationSubmitting(true);
    try {
      await api.markAppMigration(migratingApp.id, migrationReason.trim());
      setMessage({ type: 'success', text: `Aplikasi "${migratingApp.appName}" berhasil ditandai memerlukan migrasi.` });
      setIsMigrationModalOpen(false);
      fetchApps();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/app-registry/${migratingApp.id}/mark-migration`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menandai migrasi.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsMigrationSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Third-Party App & Multi-Channel Connectors Registry</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Koneksi OAuth 2.0, Webhook integrations, dan telemetri Multi-Channel Accounts lintas tenant.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={activeTab === 'registry' ? fetchApps : fetchChannelAccounts}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start sm:self-auto"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${(activeTab === 'registry' ? isLoading : isChannelsLoading) ? 'animate-spin' : ''}`} />
          </button>
          {activeTab === 'registry' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Daftarkan Aplikasi</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('registry')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'registry'
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Konektor & Registry Aplikasi</span>
        </button>
        <button
          onClick={() => setActiveTab('channel_accounts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'channel_accounts'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Multi-Channel Accounts Telemetry (ChannelAccount)</span>
        </button>
      </div>

      {/* Tab 1: App Registry */}
      {activeTab === 'registry' && (
        <div className="space-y-6">
          {/* Honest Backend Error Banner */}
          <HonestErrorBanner error={backendError} onRetry={fetchApps} isRetrying={isLoading} />

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

          {/* Grid of Apps */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <div key={app.id} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <span>{app.appName}</span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {app.appType}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 font-mono text-[11px]">Client ID: {app.clientId || 'N/A'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        app.isConnected
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {app.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                    </span>
                    <button
                      onClick={() => openEditModal(app)}
                      className="p-1 rounded text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition"
                      title="Edit Aplikasi"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openMigrationModal(app)}
                      className="p-1 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition"
                      title="Tandai Memerlukan Migrasi"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteApp(app)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                      title="Hapus Aplikasi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {app.manualLinkMigrationNotice && (
                  <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-tight">
                      <strong className="font-semibold block mb-0.5">Notifikasi Migrasi:</strong>
                      {app.manualLinkMigrationNotice}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/60 pt-3">
                  <div className="flex justify-between">
                    <span>Auth Type:</span>
                    <span className="font-semibold text-slate-200">{app.authType || 'OAuth 2.0'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Capability:</span>
                    <span className="text-indigo-400 font-semibold">{app.capabilityStatus || 'PRODUCTION_READY'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 mb-1">OAuth Scopes:</span>
                    <div className="flex flex-wrap gap-1">
                      {app.scopes?.map((s, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <button
                    onClick={() => handleToggleConnection(app)}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                      app.isConnected
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        : 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>{app.isConnected ? 'Putus Sambungan (Disconnect)' : 'Sambungkan Connector (Connect)'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Multi-Channel Accounts Telemetry */}
      {activeTab === 'channel_accounts' && (
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
                  Tingkat akses Super Admin secara ketat <strong className="text-white">tidak menampilkan isi pesan / percakapan chat</strong> (WhatsApp, Instagram, Telegram, Slack), tidak mengekspos nomor telepon atau identitas customer individual. Hanya menyajikan telemetri operasional agregat: status sinkronisasi, tingkat keberhasilan webhook, latensi, dan throughput pesan.
                </p>
              </div>
            </div>
          </div>

          {/* Honest Error Banner if backend fails */}
          <HonestErrorBanner
            error={channelsError}
            onRetry={fetchChannelAccounts}
            isRetrying={isChannelsLoading}
            title="Telemetri Endpoint Multi-Channel Accounts (Status Backend Nyata)"
          />

          {/* Channel Filters */}
          <div className="flex items-center gap-2 flex-wrap bg-slate-900/50 p-2.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-medium px-2">Filter Kanal:</span>
            {['ALL', 'WHATSAPP', 'INSTAGRAM', 'TELEGRAM', 'SLACK', 'EMAIL'].map((ctype) => (
              <button
                key={ctype}
                onClick={() => setSelectedChannelType(ctype)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  selectedChannelType === ctype
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {ctype}
              </button>
            ))}
          </div>

          {/* KPI Metrics */}
          {channelSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400 block">Total Akun Kanal</span>
                <span className="text-xl font-bold text-white mt-1 block">{channelSummary.totalChannelAccounts}</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400 block">Kanal Aktif</span>
                <span className="text-xl font-bold text-emerald-400 mt-1 block">{channelSummary.activeChannelsCount}</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400 block">Throughput Pesan / Jam</span>
                <span className="text-xl font-bold text-cyan-400 mt-1 block">{channelSummary.hourlyMessageThroughput.toLocaleString('id-ID')}</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400 block">Webhook Delivery Rate</span>
                <span className="text-xl font-bold text-indigo-400 mt-1 block">{channelSummary.aggregateWebhookDeliveryRate}%</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-slate-400 block">Avg Latensi Webhook</span>
                <span className="text-xl font-bold text-amber-400 mt-1 block">{channelSummary.aggregateWebhookLatencyMs} ms</span>
              </div>
            </div>
          )}

          {/* Distribution per Channel */}
          {channelSummary && channelSummary.channelDistribution && channelSummary.channelDistribution.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Distribusi & Rasio Keaktifan Kanal Multi-Tenant</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {channelSummary.channelDistribution.map((dist, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white">{dist.channelType}</span>
                      <span className="text-emerald-400 font-mono font-semibold">{dist.count} akun</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex justify-between">
                      <span>Active Rate: {dist.activeRate}%</span>
                      <span className="text-rose-400">Err: {dist.errorRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Channel Accounts Table */}
          {channelSummary && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span>Daftar Akun Kanal Terhubung (Telemetri Sinkronisasi & Webhook)</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  Menampilkan {channelSummary.channels?.length || 0} akun
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Kanal</th>
                      <th className="px-4 py-3">Akun Masked</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Sync Health</th>
                      <th className="px-4 py-3 text-right">Volume 24 Jam</th>
                      <th className="px-4 py-3 text-right">Webhook Rate</th>
                      <th className="px-4 py-3 text-right">Err 24h</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {channelSummary.channels?.map((ch) => (
                      <tr key={ch.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 font-semibold text-white">
                          <div>{ch.tenantName || 'Tenant'}</div>
                          <span className="text-[10px] text-slate-500 font-mono">{ch.tenantId}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-medium text-[10px]">
                            {ch.channelType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">{ch.accountIdentifier}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ch.status === 'ACTIVE'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : ch.status === 'DEGRADED'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {ch.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          <span className={ch.syncHealthScore >= 90 ? 'text-emerald-400' : 'text-amber-400'}>
                            {ch.syncHealthScore}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-200">
                          {ch.messageVolume24h.toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-cyan-400">{ch.webhookSuccessRate}%</td>
                        <td className="px-4 py-3 text-right font-mono text-rose-400">{ch.errorCount24h}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Daftarkan Aplikasi Baru */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Daftarkan Aplikasi / Konektor Baru</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateApp} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Aplikasi</label>
                <input
                  type="text"
                  required
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Contoh: Salesforce CRM, SAP S/4HANA, HubSpot"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tipe Integrasi</label>
                  <select
                    value={appType}
                    onChange={(e) => setAppType(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CRM">CRM</option>
                    <option value="ERP">ERP</option>
                    <option value="COMMUNICATION">COMMUNICATION</option>
                    <option value="STORAGE">STORAGE</option>
                    <option value="CUSTOM_WEBHOOK">CUSTOM_WEBHOOK</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Auth Type</label>
                  <select
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="OAuth 2.0">OAuth 2.0</option>
                    <option value="API Key">API Key</option>
                    <option value="mTLS">mTLS</option>
                    <option value="Webhook HMAC">Webhook HMAC</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Client ID / API Key</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="app-client-id-xyz"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">OAuth Scopes (Pisahkan dengan koma)</label>
                <input
                  type="text"
                  value={scopesStr}
                  onChange={(e) => setScopesStr(e.target.value)}
                  placeholder="contacts.read, deals.write, webhook.receive"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Mendaftarkan...' : 'Simpan Aplikasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Aplikasi */}
      {isEditModalOpen && editingApp && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-400" />
                <span>Edit Aplikasi: {editingApp.appName}</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateApp} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Aplikasi</label>
                <input
                  type="text"
                  required
                  value={editAppName}
                  onChange={(e) => setEditAppName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tipe Integrasi</label>
                  <select
                    value={editAppType}
                    onChange={(e) => setEditAppType(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CRM">CRM</option>
                    <option value="ERP">ERP</option>
                    <option value="COMMUNICATION">COMMUNICATION</option>
                    <option value="STORAGE">STORAGE</option>
                    <option value="CUSTOM_WEBHOOK">CUSTOM_WEBHOOK</option>
                    <option value="Project Management">Project Management</option>
                    <option value="Billing">Billing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Auth Type</label>
                  <select
                    value={editAuthType}
                    onChange={(e) => setEditAuthType(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="OAuth 2.0">OAuth 2.0</option>
                    <option value="API Key">API Key</option>
                    <option value="mTLS">mTLS</option>
                    <option value="Webhook HMAC">Webhook HMAC</option>
                    <option value="Webhook / API Key">Webhook / API Key</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Client ID / API Key</label>
                <input
                  type="text"
                  value={editClientId}
                  onChange={(e) => setEditClientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">OAuth Scopes (Pisahkan koma)</label>
                <input
                  type="text"
                  value={editScopesStr}
                  onChange={(e) => setEditScopesStr(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Capability Status</label>
                <select
                  value={editCapabilityStatus}
                  onChange={(e) => setEditCapabilityStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="PRODUCTION_READY">PRODUCTION_READY</option>
                  <option value="MIGRATION_REQUIRED">MIGRATION_REQUIRED</option>
                  <option value="DEPRECATED">DEPRECATED</option>
                  <option value="BETA">BETA</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Notifikasi Manual Migration Notice (Opsional)</label>
                <input
                  type="text"
                  value={editMigrationNotice}
                  onChange={(e) => setEditMigrationNotice(e.target.value)}
                  placeholder="Contoh: Migrasi ke Jira OAuth 2.0 3LO Granular Scopes sebelum 30 September 2026"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50"
                >
                  {isEditSubmitting ? 'Memperbarui...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Mark Migration */}
      {isMigrationModalOpen && migratingApp && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Tandai Migrasi: {migratingApp.appName}</span>
              </h3>
              <button
                onClick={() => setIsMigrationModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleMarkMigration} className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Tindakan ini akan mengubah status aplikasi menjadi{' '}
                <span className="font-bold text-amber-400">MIGRATION_REQUIRED</span> dan memicu notifikasi peringatan
                migrasi ke semua tenant yang terhubung.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Alasan / Instruksi Migrasi
                </label>
                <textarea
                  required
                  rows={3}
                  value={migrationReason}
                  onChange={(e) => setMigrationReason(e.target.value)}
                  placeholder="Contoh: Protokol OAuth 1.0a akan dinonaktifkan per 30 September 2026. Lakukan re-autentikasi ke OAuth 2.0."
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMigrationModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isMigrationSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition disabled:opacity-50"
                >
                  {isMigrationSubmitting ? 'Menandai...' : 'Tandai Memerlukan Migrasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
