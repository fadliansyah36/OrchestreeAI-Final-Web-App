import React, { useState, useEffect } from 'react';
import {
  Share2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Plus,
  Shield,
  ShieldCheck,
  Zap,
  ShoppingBag,
  ShoppingCart,
  MessageSquare,
  Users,
  Video,
  Instagram,
  Mail,
  Trello,
  ExternalLink,
  Lock,
  Search,
  SlidersHorizontal,
  FileText,
  Clock,
  Radio,
  Eye,
  Check,
  X,
  Layers,
  Sparkles,
  ArrowRight,
  Database
} from 'lucide-react';
import { TenantRegistrationResponse } from '@/apps/client/types';

interface IntegrationsHubScreenProps {
  tenant: TenantRegistrationResponse | null;
  onBack?: () => void;
  defaultCategory?: string;
}

export interface ThirdPartyAppItem {
  id: string;
  app_code: string;
  name: string;
  category: 'social' | 'marketplace' | 'workforce_collaboration' | 'productivity';
  description: string;
  icon: string;
  auth_type: 'oauth2' | 'api_key' | 'webhook';
  supported_scopes: string[];
  client_id?: string;
  requires_transparency_notice: boolean;
  transparency_notice_template?: string;
  is_active: boolean;
}

export interface ConnectionItem {
  id: string;
  tenant_id: string;
  app_id: string;
  app_code: string;
  connection_name: string;
  status: 'not_connected' | 'pending' | 'connected' | 'error' | 'suspended';
  token_expires_at?: string;
  authorized_scopes: string[];
  external_account_id?: string;
  external_account_name?: string;
  health_status: 'healthy' | 'degraded' | 'unreachable' | 'expired' | 'unknown';
  last_health_check_at?: string;
  last_sync_at?: string;
  error_message?: string;
  transparency_notice_accepted_at?: string;
  transparency_notice_accepted_by?: string;
  observation_mode: 'metadata_only' | 'none';
  active_workers_count: number;
  app_name?: string;
  app_category?: string;
  app_icon?: string;
  requires_transparency_notice?: boolean;
  transparency_notice_template?: string;
}

export interface SyncLogItem {
  id: string;
  connection_id: string;
  connection_name?: string;
  app_code?: string;
  sync_type: string;
  status: string;
  items_synced: number;
  error_detail?: string;
  latency_ms: number;
  created_at: string;
  metadata?: Record<string, any>;
}

// Map icon string to Lucide component
function renderAppIcon(iconName: string, className = 'w-5 h-5') {
  switch (iconName) {
    case 'instagram':
      return <Instagram className={className} />;
    case 'video':
      return <Video className={className} />;
    case 'message-square':
      return <MessageSquare className={className} />;
    case 'users':
      return <Users className={className} />;
    case 'trello':
      return <Trello className={className} />;
    case 'mail':
      return <Mail className={className} />;
    case 'shopping-bag':
      return <ShoppingBag className={className} />;
    case 'shopping-cart':
      return <ShoppingCart className={className} />;
    case 'zap':
      return <Zap className={className} />;
    default:
      return <Share2 className={className} />;
  }
}

export const IntegrationsHubScreen: React.FC<IntegrationsHubScreenProps> = ({
  tenant,
  onBack,
  defaultCategory = 'all',
}) => {
  const tenantId = tenant?.tenant_id || '';
  const userRole = tenant?.role || 'TENANT_OWNER';

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'client_connections' | 'sync_logs'>('client_connections');
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);
  const [searchFilter, setSearchFilter] = useState('');

  // Data states
  const [catalog, setCatalog] = useState<ThirdPartyAppItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [connectTargetApp, setConnectTargetApp] = useState<ThirdPartyAppItem | null>(null);
  const [connectAccountName, setConnectAccountName] = useState('');
  const [connectAccountId, setConnectAccountId] = useState('');
  const [connectToken, setConnectToken] = useState('');

  const [transparencyModalTarget, setTransparencyModalTarget] = useState<ConnectionItem | null>(null);
  const [consentCheckbox, setConsentCheckbox] = useState(false);

  const [revokeModalTarget, setRevokeModalTarget] = useState<ConnectionItem | null>(null);

  // Fetch Catalog & Connections
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Catalog
      const catRes = await fetch('/api/v1/integrations/catalog');
      if (catRes.ok) {
        const catJson = await catRes.json();
        setCatalog(catJson.data || []);
      }

      // 2. Fetch Tenant Connections
      const connRes = await fetch(`/api/v1/tenants/${tenantId}/integrations/connections`);
      if (connRes.ok) {
        const connJson = await connRes.json();
        setConnections(connJson.data || []);
      }

      // 3. Fetch Sync Logs
      const logsRes = await fetch(`/api/v1/tenants/${tenantId}/integrations/sync-logs?limit=40`);
      if (logsRes.ok) {
        const logsJson = await logsRes.json();
        setSyncLogs(logsJson.data || []);
      }
    } catch (err: any) {
      console.error('Failed to load integrations data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  // Connect platform handler
  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectTargetApp) return;

    setActionLoadingId(connectTargetApp.app_code);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/integrations/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_code: connectTargetApp.app_code,
          connection_name: connectAccountName || `${connectTargetApp.name} Utama`,
          access_token: connectToken || `tok_live_${Math.floor(Date.now() / 1000)}`,
          refresh_token: `ref_live_${Math.floor(Date.now() / 1000)}`,
          expires_in_days: 60,
          external_account_id: connectAccountId || `id_${Math.floor(Date.now() / 1000)}`,
          external_account_name: connectAccountName || `${connectTargetApp.name} Akun Bisnis`,
          authorized_scopes: connectTargetApp.supported_scopes,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal menghubungkan integrasi');
      }

      setFeedbackMessage({
        type: 'success',
        message: `Koneksi ke ${connectTargetApp.name} berhasil terhubung secara aktif.`,
      });
      setConnectTargetApp(null);
      setConnectAccountName('');
      setConnectAccountId('');
      setConnectToken('');
      await fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', message: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Health-check handler
  const handleCheckHealth = async (connectionId: string, appName: string) => {
    setActionLoadingId(connectionId);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/integrations/connections/${connectionId}/health-check`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Gagal mengecek kesehatan integrasi');
      const json = await res.json();
      setFeedbackMessage({
        type: 'success',
        message: `Pemeriksaan kesehatan ${appName}: status ${json.data.health_status}.`,
      });
      await fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', message: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Auto-refresh token handler
  const handleRefreshToken = async (connectionId: string, appName: string) => {
    setActionLoadingId(connectionId);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/integrations/connections/${connectionId}/refresh-token`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Gagal memperbarui token otentikasi');
      setFeedbackMessage({
        type: 'success',
        message: `Token ${appName} berhasil diperbarui (diperpanjang 60 hari).`,
      });
      await fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', message: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Manual sync handler
  const handleManualSync = async (connectionId: string, appName: string) => {
    setActionLoadingId(connectionId);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/integrations/connections/${connectionId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_type: 'manual_sync' }),
      });
      if (!res.ok) throw new Error('Sinkronisasi manual gagal');
      const json = await res.json();
      setFeedbackMessage({
        type: 'success',
        message: `Sinkronisasi data ${appName} selesai: ${json.data.items_synced} item diperbarui (${json.data.latency_ms}ms).`,
      });
      await fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', message: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Revoke Cascading handler
  const handleRevokeCascadingConfirm = async () => {
    if (!revokeModalTarget) return;
    setActionLoadingId(revokeModalTarget.id);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/integrations/connections/${revokeModalTarget.id}/revoke`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Gagal memutus koneksi integrasi');
      const json = await res.json();
      setFeedbackMessage({
        type: 'success',
        message: `Koneksi ${revokeModalTarget.connection_name} dicabut dengan aman. ${json.cascade_summary.cancelled_scheduled_posts} tugas tertunda dibatalkan, ${json.cascade_summary.stopped_workers_count} worker dihentikan tanpa tugas yatim.`,
      });
      setRevokeModalTarget(null);
      await fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', message: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Transparency Notice Consent Approval
  const handleConsentSubmit = async () => {
    if (!transparencyModalTarget || !consentCheckbox) return;
    setActionLoadingId(transparencyModalTarget.id);
    try {
      const res = await fetch(
        `/api/v1/tenants/${tenantId}/integrations/connections/${transparencyModalTarget.id}/transparency-consent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: tenant?.user_id || tenant?.membership_id || '',
            user_role: userRole,
          }),
        }
      );
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Persetujuan gagal diproses');
      }
      setFeedbackMessage({
        type: 'success',
        message: `Persetujuan Transparansi untuk ${transparencyModalTarget.connection_name} telah disetujui. Observasi dibatasi pada metadata koordinasi organisasi.`,
      });
      setTransparencyModalTarget(null);
      setConsentCheckbox(false);
      await fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', message: err.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Merge catalog with connections to show status for each platform
  const mergedPlatforms = catalog.map((app) => {
    const conn = connections.find((c) => c.app_code === app.app_code);
    return {
      app,
      connection: conn || null,
      status: conn ? conn.status : 'not_connected',
    };
  });

  // Filter platforms by category & search
  const filteredPlatforms = mergedPlatforms.filter(({ app, connection }) => {
    if (selectedCategory !== 'all' && app.category !== selectedCategory) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchName = app.name.toLowerCase().includes(q);
      const matchDesc = app.description.toLowerCase().includes(q);
      const matchAcc = connection?.external_account_name?.toLowerCase().includes(q);
      return matchName || matchDesc || matchAcc;
    }
    return true;
  });

  // Category counts
  const countSocial = mergedPlatforms.filter((p) => p.app.category === 'social').length;
  const countMarketplace = mergedPlatforms.filter((p) => p.app.category === 'marketplace').length;
  const countWorkforce = mergedPlatforms.filter((p) => p.app.category === 'workforce_collaboration').length;
  const countProductivity = mergedPlatforms.filter((p) => p.app.category === 'productivity').length;
  const countConnected = mergedPlatforms.filter((p) => p.status === 'connected').length;

  return (
    <div className="min-h-screen bg-[#070D18] text-slate-100 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  id="btn-back-hub"
                  onClick={onBack}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Kembali ke Hub
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  OrchestreeAI Ecosystem & Integration Gateway
                </span>
              </div>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Share2 className="w-6 h-6 text-emerald-400" />
              Integrasi Pihak Ketiga & Observasi Kerja
            </h1>
            <p className="text-xs md:text-sm text-slate-400">
              Konektor resmi media sosial, e-commerce marketplace, dan tools kolaborasi kerja dengan health-check berkala, auto-refresh token, dan revoke cascading.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-refresh-all-integrations"
              onClick={fetchData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Segarkan Status
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div
            id="integration-feedback-banner"
            className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              )}
              <span className="text-xs leading-relaxed">{feedbackMessage.message}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Top-Level Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 overflow-x-auto pb-px">
          <button
            id="tab-btn-client-connections"
            onClick={() => setActiveTab('client_connections')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'client_connections'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Layers className="w-4 h-4" />
            Integrasi Terhubung
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-bold font-mono">
              {countConnected} Aktif
            </span>
          </button>

          <button
            id="tab-btn-sync-logs"
            onClick={() => setActiveTab('sync_logs')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'sync_logs'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <FileText className="w-4 h-4" />
            Riwayat Sinkronisasi & Audit
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {syncLogs.length}
            </span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: INTEGRASI TERHUBUNG & KATALOG APLIKASI (CLIENT VIEW) */}
        {/* ========================================================================= */}
        {activeTab === 'client_connections' && (
          <div className="space-y-6">

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategory === 'all'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
                  }`}
                >
                  Semua ({catalog.length})
                </button>
                <button
                  onClick={() => setSelectedCategory('social')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategory === 'social'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
                  }`}
                >
                  Media Sosial ({countSocial})
                </button>
                <button
                  onClick={() => setSelectedCategory('marketplace')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategory === 'marketplace'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
                  }`}
                >
                  Marketplace ({countMarketplace})
                </button>
                <button
                  onClick={() => setSelectedCategory('workforce_collaboration')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategory === 'workforce_collaboration'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
                  }`}
                >
                  Kolaborasi Tim ({countWorkforce})
                </button>
                <button
                  onClick={() => setSelectedCategory('productivity')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategory === 'productivity'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
                  }`}
                >
                  Produktivitas ({countProductivity})
                </button>
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  aria-label="Cari integrasi platform"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Grid of Integration Tiles */}
            {filteredPlatforms.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                <Share2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">Tidak ada integrasi yang cocok</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Coba ubah kata kunci pencarian atau pilih kategori platform yang berbeda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPlatforms.map(({ app, connection, status }) => {
                  const isConnected = status === 'connected';
                  const isDegraded = connection?.health_status === 'degraded';
                  const isExpired = connection?.health_status === 'expired';
                  const isBusy = actionLoadingId === app.app_code || actionLoadingId === connection?.id;
                  const needsConsent = app.requires_transparency_notice && !connection?.transparency_notice_accepted_at;

                  return (
                    <div
                      key={app.id}
                      id={`integration-tile-${app.app_code}`}
                      className={`relative rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                        isConnected
                          ? 'bg-slate-900/80 border-slate-700/80 shadow-lg shadow-emerald-950/10 hover:border-slate-600'
                          : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Tile Header */}
                      <div className="p-5 space-y-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
                                isConnected
                                  ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                                  : 'bg-slate-800/80 border-slate-700/80 text-slate-400'
                              }`}
                            >
                              {renderAppIcon(app.icon, 'w-5 h-5')}
                            </div>
                            <div>
                              <h2 className="text-sm font-bold text-white tracking-tight leading-snug">
                                {app.name}
                              </h2>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                {app.category === 'social' && 'Media Sosial'}
                                {app.category === 'marketplace' && 'E-Commerce'}
                                {app.category === 'workforce_collaboration' && 'Kolaborasi Kerja'}
                                {app.category === 'productivity' && 'Produktivitas'}
                              </span>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isConnected
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                  : status === 'error'
                                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                                  : status === 'pending'
                                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {isConnected ? 'Terhubung' : status === 'error' ? 'Galat' : 'Belum Terhubung'}
                            </span>

                            {isConnected && (
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                  isExpired
                                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                                    : isDegraded
                                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                }`}
                              >
                                {connection?.health_status.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed min-h-[38px]">
                          {app.description}
                        </p>

                        {/* Transparency Notice Badge for Workforce Observability */}
                        {app.requires_transparency_notice && (
                          <div
                            className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                              connection?.transparency_notice_accepted_at
                                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                                : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
                            }`}
                          >
                            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="font-semibold text-[11px]">
                                {connection?.transparency_notice_accepted_at
                                  ? 'Observasi Kerja: Disetujui Admin'
                                  : 'Observasi Kerja: Menunggu Persetujuan Admin'}
                              </div>
                              <div className="text-[10px] opacity-85 mt-0.5">
                                Mode: Metadata aktivitas saja (bukan isi pesan pribadi).
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Connected Account Metadata */}
                        {isConnected && connection && (
                          <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between text-slate-300">
                              <span className="text-slate-500">Akun Terhubung:</span>
                              <span className="font-semibold text-slate-200">
                                {connection.external_account_name || 'Akun Utama'}
                              </span>
                            </div>
                            {connection.token_expires_at && (
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="text-slate-500">Kedaluwarsa Token:</span>
                                <span className="font-mono text-[11px] text-slate-400">
                                  {new Date(connection.token_expires_at).toLocaleDateString('id-ID')}
                                </span>
                              </div>
                            )}
                            {connection.last_sync_at && (
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="text-slate-500">Sinkronisasi Terakhir:</span>
                                <span className="font-mono text-[11px] text-slate-400">
                                  {new Date(connection.last_sync_at).toLocaleTimeString('id-ID')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Tile Actions Footer */}
                      <div className="p-4 bg-slate-950/60 rounded-b-2xl border-t border-slate-800/80 flex items-center justify-between gap-2">
                        {isConnected && connection ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              {/* Cek Kesehatan */}
                              <button
                                id={`btn-health-${app.app_code}`}
                                onClick={() => handleCheckHealth(connection.id, app.name)}
                                disabled={isBusy}
                                title="Uji Kesehatan Token & Koneksi"
                                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Radio className={`w-3.5 h-3.5 ${isBusy ? 'animate-pulse text-emerald-400' : ''}`} />
                              </button>

                              {/* Perbarui Token */}
                              <button
                                id={`btn-refresh-token-${app.app_code}`}
                                onClick={() => handleRefreshToken(connection.id, app.name)}
                                disabled={isBusy}
                                title="Perbarui Token Otentikasi (Auto-Refresh 60 Hari)"
                                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin text-emerald-400' : ''}`} />
                              </button>

                              {/* Sinkronisasi Manual */}
                              <button
                                id={`btn-sync-manual-${app.app_code}`}
                                onClick={() => handleManualSync(connection.id, app.name)}
                                disabled={isBusy}
                                title="Sinkronisasi Data Transaksional Sekarang"
                                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>

                              {/* Persetujuan Transparansi bila belum */}
                              {needsConsent && (
                                <button
                                  id={`btn-transparency-consent-${app.app_code}`}
                                  onClick={() => setTransparencyModalTarget(connection)}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer"
                                >
                                  Setujui Observasi
                                </button>
                              )}
                            </div>

                            {/* Putuskan Koneksi (Revoke Cascading) */}
                            <button
                              id={`btn-revoke-${app.app_code}`}
                              onClick={() => setRevokeModalTarget(connection)}
                              disabled={isBusy}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Putuskan
                            </button>
                          </>
                        ) : (
                          <div className="w-full flex justify-end">
                            <button
                              id={`btn-connect-${app.app_code}`}
                              onClick={() => setConnectTargetApp(app)}
                              disabled={isBusy}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              Hubungkan Platform
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: RIWAYAT SINKRONISASI & AUDIT LOGS */}
        {/* ========================================================================= */}
        {activeTab === 'sync_logs' && (
          <div className="space-y-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  Audit Transaksional Sinkronisasi & Revoke Cascading
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Catatan jejak sinkronisasi berkala, perpanjangan token, dan audit penghentian worker bebas job yatim.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">Total {syncLogs.length} Entri</span>
            </div>

            {syncLogs.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                Belum ada aktivitas sinkronisasi tercatat.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Waktu</th>
                      <th className="py-3 px-4">Integrasi</th>
                      <th className="py-3 px-4">Jenis Sinkronisasi</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Item Diproses</th>
                      <th className="py-3 px-4 text-right">Latensi</th>
                      <th className="py-3 px-4">Detail / Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {syncLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                          {new Date(log.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 font-sans font-semibold text-white">
                          {log.connection_name || log.app_code || 'Integrasi'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                            {log.sync_type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status === 'success'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : log.status === 'cancelled'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {log.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-200">
                          {log.items_synced}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400">
                          {log.latency_ms} ms
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-400 truncate max-w-xs">
                          {log.error_detail || (log.metadata?.action && String(log.metadata.action)) || 'Selesai normal'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: HUBUNGKAN PLATFORM INTEGRASI */}
        {/* ========================================================================= */}
        {connectTargetApp && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              id="modal-connect-app"
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    {renderAppIcon(connectTargetApp.icon, 'w-4 h-4')}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Hubungkan {connectTargetApp.name}</h2>
                    <span className="text-[10px] text-slate-400">Kredensial terenkripsi per-tenant</span>
                  </div>
                </div>
                <button
                  onClick={() => setConnectTargetApp(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConnectSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nama Akun / Koneksi Organisasi</label>
                  <input
                    type="text"
                    required
                    value={connectAccountName}
                    onChange={(e) => setConnectAccountName(e.target.value)}
                    aria-label="Nama Akun"
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">ID Akun Eksternal (Workspace / Store ID)</label>
                  <input
                    type="text"
                    value={connectAccountId}
                    onChange={(e) => setConnectAccountId(e.target.value)}
                    aria-label="ID Akun Eksternal"
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Kredensial Akses (Token / API Key)</label>
                  <input
                    type="password"
                    required
                    value={connectToken}
                    onChange={(e) => setConnectToken(e.target.value)}
                    aria-label="Kredensial Akses"
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Kredensial disimpan dengan enkripsi KMS envelope bertenant.
                  </span>
                </div>

                {connectTargetApp.requires_transparency_notice && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs">
                    <div className="font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      Perhatian Observasi Kerja:
                    </div>
                    <p className="text-[11px] mt-1 text-amber-300/90 leading-relaxed">
                      Platform ini memerlukan persetujuan Transparency Notice oleh Administrator sebelum sinkronisasi aktivitas kerja diaktifkan.
                    </p>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConnectTargetApp(null)}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoadingId === connectTargetApp.app_code}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoadingId === connectTargetApp.app_code ? 'Menghubungkan...' : 'Simpan & Aktifkan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: TRANSPARENCY NOTICE (PERSETUJUAN ADMINISTRATOR) */}
        {/* ========================================================================= */}
        {transparencyModalTarget && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              id="modal-transparency-consent"
              className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Persetujuan Transparansi Observasi Aktivitas Kerja
                  </h2>
                  <span className="text-[11px] text-amber-400 font-medium">
                    Kepatuhan Privasi Staf ({transparencyModalTarget.connection_name})
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300 leading-relaxed">
                <div className="font-semibold text-amber-300">Pemberitahuan Wajib:</div>
                <p>
                  {transparencyModalTarget.transparency_notice_template ||
                    'Pengamatan dilakukan secara eksklusif terhadap metadata aktivitas (frekuensi interaksi, timestamp koordinasi proyek, status kehadiran) demi peningkatan efisiensi kolaborasi. Sistem tidak mengakses isi pesan pribadi atau percakapan rahasia.'}
                </p>
                <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-800/80">
                  • <strong>Lingkup Observasi:</strong> Waktu kehadiran, ritme responsif channel proyek, log sinkronisasi tugas.<br />
                  • <strong>Privasi Pekerja:</strong> Tidak ada pemantauan layar, webcam, atau konten pesan personal.
                </div>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={consentCheckbox}
                  onChange={(e) => setConsentCheckbox(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500"
                />
                <span>
                  Saya menyatakan sebagai Administrator/Pemilik Organisasi yang berwenang menyetujui pengamatan metadata koordinasi ini demi efisiensi operasional.
                </span>
              </label>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTransparencyModalTarget(null);
                    setConsentCheckbox(false);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!consentCheckbox || actionLoadingId === transparencyModalTarget.id}
                  onClick={handleConsentSubmit}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
                >
                  {actionLoadingId === transparencyModalTarget.id ? 'Menyimpan...' : 'Setujui & Aktifkan Observasi'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: REVOKE CASCADING CONFIRMATION */}
        {/* ========================================================================= */}
        {revokeModalTarget && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              id="modal-revoke-cascading"
              className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Konfirmasi Pemutusan Koneksi</h2>
                  <span className="text-[11px] text-rose-400 font-medium">Revoke Cascading Aman</span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>
                  Apakah Anda yakin ingin memutus koneksi dengan <strong className="text-white">{revokeModalTarget.connection_name}</strong>?
                </p>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-[11px] text-slate-400">
                  <div className="text-rose-300 font-semibold">Tindakan Cascading Otomatis:</div>
                  <div>• Seluruh posting terjadwal yang menargetkan platform ini akan dibatalkan.</div>
                  <div>• Background worker sinkronisasi dihentikan seketika.</div>
                  <div>• Token otentikasi dihapus dari database tanpa meninggalkan tugas yatim (zero orphaned jobs).</div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setRevokeModalTarget(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={actionLoadingId === revokeModalTarget.id}
                  onClick={handleRevokeCascadingConfirm}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-500 cursor-pointer disabled:opacity-50"
                >
                  {actionLoadingId === revokeModalTarget.id ? 'Memutus...' : 'Putuskan & Hentikan Worker'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
