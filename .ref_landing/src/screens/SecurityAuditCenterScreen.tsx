import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Fingerprint,
  UserCheck,
  Trash2,
  Plus,
  ToggleLeft,
  ToggleRight,
  QrCode,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { AuditLogItem, PresenceSecurityAuditSummary } from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';
import { useAuth } from '../context/AuthContext';
import { MfaEnrollmentView } from '../components/MfaEnrollmentView';

export const SecurityAuditCenterScreen: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [presenceStats, setPresenceStats] = useState<PresenceSecurityAuditSummary | null>(null);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [isAllowlistEnabled, setIsAllowlistEnabled] = useState<boolean>(false);
  const [clientIp, setClientIp] = useState<string>(() => api.getClientIp());
  const [newIp, setNewIp] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdatingAllowlist, setIsUpdatingAllowlist] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [honestError, setHonestError] = useState<HonestErrorInfo | null>(null);
  const [showReEnrollModal, setShowReEnrollModal] = useState<boolean>(false);

  const fetchData = async () => {
    setIsLoading(true);
    setHonestError(null);
    try {
      const [logsData, presenceData, ipsData] = await Promise.all([
        api.getAuditLogs(),
        api.getPresenceSecurityAuditSummary(),
        api.getIpAllowlist(),
      ]);
      setLogs(logsData);
      setPresenceStats(presenceData);
      setAllowlist(ipsData.allowedIps || []);
      setIsAllowlistEnabled(Boolean(ipsData.enabled));
      setClientIp(api.getClientIp());
    } catch (err: any) {
      setHonestError({
        endpoint: '/admin/audit-logs & /admin/presence/security-stats',
        status: err?.status || err?.statusCode || 502,
        message: err?.message || 'Gagal memuat log audit dan statistik keamanan dari backend API.',
        rawDetails: err?.rawDetails || err?.stack || err?.toString(),
        timestamp: new Date().toLocaleTimeString(),
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memuat log audit keamanan.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleAllowlist = async () => {
    setIsUpdatingAllowlist(true);
    const nextState = !isAllowlistEnabled;
    try {
      await api.updateIpAllowlist({ enabled: nextState, allowedIps: allowlist });
      setIsAllowlistEnabled(nextState);
      setMessage({
        type: 'success',
        text: `IP Allowlist Sentinel berhasil ${nextState ? 'diaktifkan (Enforced)' : 'dinonaktifkan (Permissive)'}.`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal memperbarui status IP allowlist.' });
    } finally {
      setIsUpdatingAllowlist(false);
    }
  };

  const handleAddIp = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = newIp.trim();
    if (!candidate) return;
    if (allowlist.includes(candidate)) {
      setMessage({ type: 'error', text: `IP atau CIDR ${candidate} sudah ada dalam allowlist.` });
      return;
    }
    const updated = [...allowlist, candidate];
    setIsUpdatingAllowlist(true);
    try {
      await api.updateIpAllowlist({ enabled: isAllowlistEnabled, allowedIps: updated });
      setAllowlist(updated);
      setNewIp('');
      setMessage({ type: 'success', text: `IP/CIDR ${candidate} berhasil ditambahkan ke allowlist.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menambahkan IP ke allowlist.' });
    } finally {
      setIsUpdatingAllowlist(false);
    }
  };

  const handleDeleteIp = async (ipToRemove: string) => {
    const updated = allowlist.filter((ip) => ip !== ipToRemove);
    setIsUpdatingAllowlist(true);
    try {
      await api.updateIpAllowlist({ enabled: isAllowlistEnabled, allowedIps: updated });
      setAllowlist(updated);
      setMessage({ type: 'success', text: `IP/CIDR ${ipToRemove} berhasil dihapus dari allowlist.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menghapus IP dari allowlist.' });
    } finally {
      setIsUpdatingAllowlist(false);
    }
  };

  const handleAddCurrentIp = async () => {
    if (!clientIp) return;
    if (allowlist.includes(clientIp)) {
      setMessage({ type: 'success', text: `IP Anda saat ini (${clientIp}) sudah terdaftar.` });
      return;
    }
    const updated = [...allowlist, clientIp];
    setIsUpdatingAllowlist(true);
    try {
      await api.updateIpAllowlist({ enabled: isAllowlistEnabled, allowedIps: updated });
      setAllowlist(updated);
      setMessage({ type: 'success', text: `IP Anda (${clientIp}) berhasil ditambahkan ke allowlist.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menambahkan IP saat ini.' });
    } finally {
      setIsUpdatingAllowlist(false);
    }
  };

  const filteredLogs = logs.filter((l) =>
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.operatorId.toLowerCase().includes(search.toLowerCase()) ||
    l.resource.toLowerCase().includes(search.toLowerCase()) ||
    l.ipAddress.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <span>Security, Forensics & ABAC Sentinel Center</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Log forensik akses Super Admin, verifikasi kehadiran biometrik tanpa raw embedding, dan proteksi IP allowlist.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {honestError && (
        <HonestErrorBanner
          error={honestError}
          onRetry={fetchData}
          isRetrying={isLoading}
          title="Status Endpoint GET /admin/audit-logs & /admin/presence/security-stats"
        />
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

      {/* Biometric Presence Security Overview */}
      {presenceStats && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-emerald-400" />
              <span>Biometric Presence Security Telemetry</span>
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                presenceStats.securityRiskLevel === 'HIGH'
                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                  : presenceStats.securityRiskLevel === 'ELEVATED'
                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              }`}
            >
              Risk: {presenceStats.securityRiskLevel}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Enrolled Users</span>
              <span className="text-lg font-bold text-white">{presenceStats.totalEnrolledUsers}</span>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Total Verifikasi</span>
              <span className="text-lg font-bold text-white">{presenceStats.totalVerificationChecks}</span>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Sukses / Gagal</span>
              <span className="text-lg font-bold text-emerald-400">
                {presenceStats.totalSuccessfulChecks} / <span className="text-rose-400">{presenceStats.totalFailedChecks}</span>
              </span>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-400 block text-[11px]">Percobaan Tidak Sah</span>
              <span className="text-lg font-bold text-amber-400">{presenceStats.potentialUnauthorizedAttempts}</span>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin MFA TOTP Management Card (Fase 124 Bagian A.1) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-emerald-400 shrink-0">
            <Fingerprint className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Autentikasi Dua Faktor (MFA TOTP) Super Admin</span>
              <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full text-[10px] font-mono uppercase font-semibold">
                ENFORCED
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Akun aktif: <span className="text-slate-200 font-mono">{user?.email || 'Super Admin'}</span>. Pindai ulang QR Code dan perbarui secret authenticator jika mengganti perangkat atau aplikasi OTP.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowReEnrollModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-semibold rounded-lg border border-slate-700 transition shrink-0"
        >
          <QrCode className="w-4 h-4" />
          <span>Aktivasi Ulang / Re-Enroll MFA</span>
        </button>
      </div>

      {/* Re-Enroll Modal */}
      {showReEnrollModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-md">
            <button
              onClick={() => setShowReEnrollModal(false)}
              className="absolute top-4 right-4 z-20 p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-full transition"
            >
              <X className="w-4 h-4" />
            </button>
            <MfaEnrollmentView
              email={user?.email || 'orchestree.ai.id@gmail.com'}
              onSuccess={() => {
                setShowReEnrollModal(false);
                setMessage({
                  type: 'success',
                  text: 'Aktivasi ulang MFA TOTP berhasil dikonfirmasi. Authenticator Anda telah diperbarui.',
                });
                fetchData();
              }}
              onCancel={() => setShowReEnrollModal(false)}
            />
          </div>
        </div>
      )}

      {/* IP Allowlist Card with Full Toggle & CRUD */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span>Super Admin CIDR / IP Allowlist Sentinel (Domain 16)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              GET/POST <code className="text-indigo-300 font-mono">/admin/security/ip-allowlist</code> • Pembatasan akses login hanya untuk subnet/IP terotorisasi.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase border ${
                isAllowlistEnabled
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isAllowlistEnabled ? 'STATUS: ENFORCING' : 'STATUS: DISABLED / PERMISSIVE'}
            </span>
            <button
              onClick={handleToggleAllowlist}
              disabled={isUpdatingAllowlist}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                isAllowlistEnabled
                  ? 'bg-rose-950/60 hover:bg-rose-900/80 border-rose-800 text-rose-200'
                  : 'bg-emerald-950/60 hover:bg-emerald-900/80 border-emerald-800 text-emerald-200'
              } disabled:opacity-50`}
            >
              {isAllowlistEnabled ? (
                <>
                  <ToggleRight className="w-4 h-4 text-emerald-400" />
                  <span>Nonaktifkan Guard</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4 text-slate-400" />
                  <span>Aktifkan Guard</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Current client IP helper */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">IP Anda Saat Ini:</span>
            <span className="font-mono font-bold text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {clientIp || '127.0.0.1'}
            </span>
            {allowlist.includes(clientIp) ? (
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Terdaftar dalam allowlist
              </span>
            ) : (
              <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Belum terdaftar
              </span>
            )}
          </div>
          {!allowlist.includes(clientIp) && (
            <button
              onClick={handleAddCurrentIp}
              disabled={isUpdatingAllowlist}
              className="px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-[11px] font-semibold transition disabled:opacity-50"
            >
              + Tambahkan IP Saya ke Allowlist
            </button>
          )}
        </div>

        {/* IP Chips with Remove Button */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Daftar IP & Subnet CIDR Diizinkan ({allowlist.length})
          </label>
          {allowlist.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">Belum ada IP terdaftar dalam allowlist.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allowlist.map((ip, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-xs font-mono text-slate-200 border border-slate-700"
                >
                  <span>{ip}</span>
                  <button
                    onClick={() => handleDeleteIp(ip)}
                    disabled={isUpdatingAllowlist}
                    className="text-slate-400 hover:text-rose-400 transition p-0.5"
                    title={`Hapus ${ip} dari allowlist`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Add IP Form */}
        <form onSubmit={handleAddIp} className="flex flex-col sm:flex-row gap-2 max-w-lg">
          <input
            type="text"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder="Tambah IP/CIDR (contoh: 203.0.113.1 atau 10.200.0.0/16)"
            className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
          <button
            type="submit"
            disabled={isUpdatingAllowlist || !newIp.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah IP</span>
          </button>
        </form>
      </div>

      {/* Forensic Audit Log Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Forensic Audit Log Trail</h3>
          <div className="w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari log..."
              className="w-full px-3 py-1 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3">Aksi</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {isLoading ? 'Memuat log forensik...' : 'Tidak ada catatan audit.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      {typeof log.timestamp === 'number' ? new Date(log.timestamp).toLocaleString('id-ID') : log.timestamp}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">{log.operatorId}</td>
                    <td className="px-4 py-3 font-mono text-indigo-300">{log.action}</td>
                    <td className="px-4 py-3 text-slate-300">{log.resource}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{log.ipAddress}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
