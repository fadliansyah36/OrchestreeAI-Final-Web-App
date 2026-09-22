import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Activity,
  RefreshCw,
  Timer,
  UserCheck,
  Globe,
  Lock,
  AlertTriangle,
  Send,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { SupportImpersonationSession, IpAllowlistConfig } from '../../types';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ title, subtitle }) => {
  const { user, remainingIdleSeconds } = useAuth();
  const [healthStatus, setHealthStatus] = useState<string>('CHECKING');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeSupportSession, setActiveSupportSession] = useState<SupportImpersonationSession | null>(null);

  // Security Posture Modal State
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [ipConfig, setIpConfig] = useState<IpAllowlistConfig>(() => api.getIpAllowlistConfigFromCache());
  const [clientIp] = useState<string>(() => api.getClientIp());
  const [newAllowedIp, setNewAllowedIp] = useState<string>('');
  const [emergencyAlertText, setEmergencyAlertText] = useState<string>('');
  const [isSendingAlert, setIsSendingAlert] = useState<boolean>(false);
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);

  const minutesLeft = Math.floor(remainingIdleSeconds / 60);
  const secondsLeft = remainingIdleSeconds % 60;
  const formattedIdleTime = `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`;
  const isUrgent = remainingIdleSeconds <= 120; // Last 2 minutes

  const fetchHealth = async () => {
    setIsRefreshing(true);
    try {
      const res = await api.getHealthStatus();
      setHealthStatus(res.status);
    } catch {
      setHealthStatus('DEGRADED');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    setActiveSupportSession(api.getActiveSupportImpersonation());

    const interval = setInterval(() => {
      fetchHealth();
      setActiveSupportSession(api.getActiveSupportImpersonation());
    }, 15000);

    const handleSessionChange = (e: any) => {
      setActiveSupportSession(e.detail);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('orchestree:support-session-changed', handleSessionChange);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('orchestree:support-session-changed', handleSessionChange);
      }
    };
  }, []);

  const handleEndSupportMode = () => {
    api.endSupportImpersonation();
    setActiveSupportSession(null);
  };

  const handleToggleIpAllowlist = async () => {
    const updated = { ...ipConfig, enabled: !ipConfig.enabled };
    setIpConfig(updated);
    await api.updateIpAllowlist({ enabled: updated.enabled, allowedIps: updated.allowedIps });
  };

  const handleAddIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAllowedIp.trim()) return;
    const ip = newAllowedIp.trim();
    if (ipConfig.allowedIps.includes(ip)) return;

    const updatedIps = [...ipConfig.allowedIps, ip];
    const updatedConfig = { ...ipConfig, allowedIps: updatedIps };
    setIpConfig(updatedConfig);
    setNewAllowedIp('');
    await api.updateIpAllowlist({ enabled: updatedConfig.enabled, allowedIps: updatedIps });
  };

  const handleRemoveIp = async (ipToRemove: string) => {
    const updatedIps = ipConfig.allowedIps.filter((ip) => ip !== ipToRemove);
    const updatedConfig = { ...ipConfig, allowedIps: updatedIps };
    setIpConfig(updatedConfig);
    await api.updateIpAllowlist({ enabled: updatedConfig.enabled, allowedIps: updatedIps });
  };

  const handleSendEmergencyAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencyAlertText.trim()) return;
    setIsSendingAlert(true);
    setAlertFeedback(null);
    try {
      const res = await api.sendSecurityEmergencyAlert({
        operatorEmail: user?.email || 'superadmin@orchestree.ai',
        reason: emergencyAlertText.trim(),
      });
      setAlertFeedback(res.message);
      setEmergencyAlertText('');
    } catch {
      setAlertFeedback('Gagal mengirim sinyal darurat keamanan.');
    } finally {
      setIsSendingAlert(false);
    }
  };

  const isClientIpAllowed = api.isIpAllowed(clientIp, ipConfig);

  return (
    <>
      {/* Active Support Impersonation Mode Banner */}
      {activeSupportSession && (
        <div className="bg-amber-950/95 border-b border-amber-800 text-amber-200 px-6 py-2 flex items-center justify-between text-xs backdrop-blur z-20">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span>
              <strong>SUPPORT IMPERSONATION AKTIF:</strong> Anda sedang menginspeksi tenant{' '}
              <span className="font-bold text-white">{activeSupportSession.tenantName}</span> (Sisa:{' '}
              {Math.max(0, Math.ceil((activeSupportSession.expiresAt - Date.now()) / 60000))}m).
            </span>
          </div>
          <button
            onClick={handleEndSupportMode}
            className="px-2.5 py-0.5 rounded bg-amber-900 hover:bg-amber-800 border border-amber-700 text-amber-200 font-semibold text-[11px] transition"
          >
            Akhiri Mode Support
          </button>
        </div>
      )}

      <header className="h-16 bg-slate-900/90 border-b border-slate-800 px-6 flex items-center justify-between backdrop-blur shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>

        <div className="flex items-center space-x-3">
          {/* 15-Minute Session Idle Timeout Badge */}
          <div
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${
              isUrgent
                ? 'bg-rose-950/80 border-rose-600 text-rose-300 animate-pulse font-bold'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-300'
            }`}
            title="Sesi Super Admin kadaluarsa setelah 15 menit tanpa aktivitas (Idle Timeout)"
          >
            <Timer className={`w-3.5 h-3.5 ${isUrgent ? 'text-rose-400' : 'text-amber-400'}`} />
            <span className="hidden md:inline font-sans text-slate-400">Sesi Idle:</span>
            <span className={isUrgent ? 'text-rose-200' : 'text-amber-300'}>{formattedIdleTime}</span>
          </div>

          {/* System Health Status Badge */}
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-full text-xs">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-medium hidden sm:inline">Router & MCP:</span>
            <span
              className={`font-semibold ${
                healthStatus === 'HEALTHY'
                  ? 'text-emerald-400'
                  : healthStatus === 'CHECKING'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {healthStatus}
            </span>
            <button
              onClick={fetchHealth}
              disabled={isRefreshing}
              className="p-1 hover:text-white text-slate-400 transition"
              title="Refresh Health Check"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Security Sentinel & IP Allowlist Quick Toggle Button */}
          <button
            onClick={() => setIsSecurityModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 rounded-full text-xs text-indigo-300 font-medium transition"
            title="Buka Postur Keamanan & IP Allowlist"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Security Sentinel</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </button>
        </div>
      </header>

      {/* Security Posture & IP Allowlist Modal */}
      {isSecurityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-300">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Super Admin Security Sentinel</h3>
                  <p className="text-xs text-slate-400">Postur Keamanan Ketat & Pengaturan IP Allowlist</p>
                </div>
              </div>
              <button
                onClick={() => setIsSecurityModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Security Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">MFA Zero-Bypass</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    ENFORCED
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Wajib TOTP 6 digit pada setiap login Super Admin tanpa pengecualian.</p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Session Idle Timeout</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    15 MENIT
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Sesi idle 15 menit otomatis logout untuk melindungi dashboard platform.</p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Double-Submit CSRF</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    ACTIVE
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Cookie XSRF-TOKEN + Header X-CSRF-Token pada setiap mutasi POST/PUT/DELETE.</p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Rate Limit & Lockout</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    3 FAIL → 15M
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">3 kali gagal kata sandi/TOTP berturut-turut memicu penguncian akun 15 menit.</p>
              </div>
            </div>

            {/* IP Allowlist Section */}
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white">IP Range Allowlist (Kantor / VPN)</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleIpAllowlist}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition border ${
                    ipConfig.enabled
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {ipConfig.enabled ? 'AKTIF (ENFORCED)' : 'NONAKTIF (OPTIONAL)'}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                <span className="text-slate-400">Alamat IP Anda Saat Ini:</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-white">{clientIp}</span>
                  {ipConfig.enabled && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] ${
                        isClientIpAllowed ? 'text-emerald-400 bg-emerald-950/80' : 'text-rose-400 bg-rose-950/80'
                      }`}
                    >
                      {isClientIpAllowed ? 'TERDAFTAR' : 'DIBLOKIR'}
                    </span>
                  )}
                </div>
              </div>

              {/* IP / CIDR List */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 block">Daftar Range IP / Subnet CIDR yang Diizinkan:</span>
                <div className="flex flex-wrap gap-2">
                  {ipConfig.allowedIps.map((ip) => (
                    <span
                      key={ip}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-mono text-[11px] border border-slate-700"
                    >
                      <span>{ip}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveIp(ip)}
                        className="hover:text-rose-400 transition"
                        title="Hapus IP"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAddIp} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newAllowedIp}
                  onChange={(e) => setNewAllowedIp(e.target.value)}
                  placeholder="Tambahkan IP / CIDR (mis. 103.147.154.0/24)"
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </form>
            </div>

            {/* Emergency Sentinel Alert Dispatcher */}
            <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span className="text-xs font-bold text-white">Kirim Notifikasi Keamanan Darurat</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Peringatkan sesama Super Admin dan Security Sentinel bila mendeteksi anomali sesi atau indikasi serangan.
              </p>
              <form onSubmit={handleSendEmergencyAlert} className="space-y-2">
                <input
                  type="text"
                  value={emergencyAlertText}
                  onChange={(e) => setEmergencyAlertText(e.target.value)}
                  placeholder="Deskripsi anomali (mis: Upaya bruteforce mencurigakan dari IP tidak dikenal)..."
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-rose-500"
                />
                <div className="flex items-center justify-between">
                  {alertFeedback && <span className="text-xs text-emerald-400">{alertFeedback}</span>}
                  <button
                    type="submit"
                    disabled={isSendingAlert || !emergencyAlertText.trim()}
                    className="ml-auto px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingAlert ? 'Mengirim...' : 'Kirim Sinyal Darurat'}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsSecurityModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

