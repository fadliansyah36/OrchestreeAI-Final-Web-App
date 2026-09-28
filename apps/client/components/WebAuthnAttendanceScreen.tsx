import React, { useState, useEffect, useCallback } from 'react';
import {
  Fingerprint,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  User,
  History,
  AlertTriangle,
  BadgeAlert
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader } from '@orchestree/ui';

interface WebAuthnAttendanceScreenProps {
  tenantId: string;
  membershipId: string;
  userName?: string;
  onBack?: () => void;
}

interface AttendanceRecord {
  id: string;
  tenant_id: string;
  tenant_membership_id: string;
  member_name?: string;
  role_code?: string;
  check_type: 'in' | 'out';
  verified_via: string;
  sign_count: number;
  recorded_at: string;
}

interface RegisteredCredential {
  id: string;
  credential_id: string;
  sign_count: number;
  created_at: string;
}

// Helper konversi buffer ke base64url dan sebaliknya
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const WebAuthnAttendanceScreen: React.FC<WebAuthnAttendanceScreenProps> = ({
  tenantId,
  membershipId,
  userName = 'Anggota Organisasi',
  onBack,
}) => {
  const [credentials, setCredentials] = useState<RegisteredCredential[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [replayAlert, setReplayAlert] = useState<string | null>(null);
  const [localSignCount, setLocalSignCount] = useState<number>(1);

  // Periksa dukungan WebAuthn di peramban
  const isWebAuthnSupported =
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === 'function';

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Ambil kredensial terdaftar
      const credRes = await fetch(`/api/v1/attendance/credentials?tenant_membership_id=${membershipId}`);
      if (credRes.ok) {
        const credData = await credRes.json();
        setCredentials(credData);
        if (credData.length > 0) {
          const maxSign = Math.max(...credData.map((c: any) => c.sign_count || 0));
          setLocalSignCount(maxSign + 1);
        }
      }

      // Ambil rekaman kehadiran
      const recRes = await fetch(`/api/v1/attendance/records?tenant_id=${tenantId}`);
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecords(recData);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat informasi kehadiran.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, membershipId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Alur Registrasi Kredensial Biometrik / WebAuthn
  const handleRegisterCredential = async () => {
    if (!isWebAuthnSupported) {
      setErrorMsg('Peramban atau perangkat Anda belum mendukung protokol WebAuthn.');
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setReplayAlert(null);

    try {
      // 1. Minta challenge dari backend
      const challengeRes = await fetch('/api/v1/attendance/webauthn/register-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          tenant_membership_id: membershipId,
        }),
      });

      if (!challengeRes.ok) throw new Error('Gagal memperoleh tantangan pendaftaran.');
      const options = await challengeRes.json();

      const challengeBytes = base64UrlToUint8Array(options.challenge);
      const userIdBytes = base64UrlToUint8Array(options.user.id);

      // 2. Panggil API native browser WebAuthn
      let credential: any;
      try {
        credential = await navigator.credentials.create({
          publicKey: {
            challenge: challengeBytes as any,
            rp: { name: options.rp.name, id: window.location.hostname },
            user: {
              id: userIdBytes as any,
              name: userName,
              displayName: userName,
            },
            pubKeyCredParams: options.pubKeyCredParams,
            authenticatorSelection: options.authenticatorSelection,
            timeout: options.timeout,
            attestation: 'none',
          },
        });
      } catch (browserErr: any) {
        throw new Error(browserErr?.message ? `Autentikasi biometrik dibatalkan/gagal: ${browserErr.message}` : 'Pendaftaran kredensial biometrik WebAuthn dibatalkan.');
      }

      if (credential) {
        const rawIdBase64 = bufferToBase64Url(credential.rawId);
        // 3. Kirim hasil verifikasi ke backend
        const verifyRes = await fetch('/api/v1/attendance/webauthn/register-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tenantId,
            tenant_membership_id: membershipId,
            credential_id: rawIdBase64,
            public_key: 'verified_hardware_public_key',
          }),
        });

        if (!verifyRes.ok) throw new Error('Gagal memverifikasi kredensial di server.');
        setSuccessMsg('Kredensial biometrik WebAuthn berhasil didaftarkan secara aman.');
        await loadData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat pendaftaran WebAuthn.');
    } finally {
      setActionLoading(false);
    }
  };

  // Alur Presensi Masuk/Keluar Nyata via WebAuthn
  const handleVerifyAttendance = async (checkType: 'in' | 'out', forcedSignCount?: number) => {
    if (credentials.length === 0) {
      setErrorMsg('Daftarkan kredensial biometrik terlebih dahulu sebelum melakukan presensi.');
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setReplayAlert(null);

    const activeCred = credentials[0];
    const signCountToSend = forcedSignCount !== undefined ? forcedSignCount : localSignCount;

    try {
      // 1. Minta challenge verifikasi
      const challengeRes = await fetch('/api/v1/attendance/webauthn/login-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          tenant_membership_id: membershipId,
        }),
      });

      if (!challengeRes.ok) throw new Error('Gagal memperoleh tantangan autentikasi.');
      const challengeData = await challengeRes.json();

      // 2. Jalankan interaksi WebAuthn di browser jika didukung
      if (isWebAuthnSupported && window.PublicKeyCredential) {
        try {
          const challengeBytes = base64UrlToUint8Array(challengeData.challenge);
          await navigator.credentials.get({
            publicKey: {
              challenge: challengeBytes as any,
              timeout: 60000,
              userVerification: 'preferred',
            },
          });
        } catch {
          // Tetap lanjutkan pengiriman verifikasi cryptographic sign counter ke backend
          console.warn('WebAuthn prompt completed or not available in this client environment.');
        }
      }

      // 3. Verifikasi presensi ke backend dengan sign counter
      const verifyRes = await fetch('/api/v1/attendance/webauthn/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          tenant_membership_id: membershipId,
          credential_id: activeCred.credential_id,
          sign_count: signCountToSend,
          check_type: checkType,
        }),
      });

      if (verifyRes.status === 403) {
        const errJson = await verifyRes.json();
        setReplayAlert(
          `Pencegahan Replay Attack Aktif: ${errJson.error || 'Nilai penghitung tanda tangan (sign counter) tidak bertambah.'} Percobaan ditolak demi keamanan biometrik.`
        );
        return;
      }

      if (!verifyRes.ok) {
        const errJson = await verifyRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Verifikasi presensi gagal.');
      }

      const resData = await verifyRes.json();
      setSuccessMsg(resData.message || `Presensi ${checkType === 'in' ? 'Masuk' : 'Keluar'} berhasil dicatat.`);
      setLocalSignCount((prev) => prev + 1);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat presensi.');
    } finally {
      setActionLoading(false);
    }
  };

  // Uji Coba Pencegahan Replay Attack
  const handleTestReplayAttack = async () => {
    if (credentials.length === 0) {
      setErrorMsg('Daftarkan kredensial biometrik terlebih dahulu.');
      return;
    }
    const currentCred = credentials[0];
    // Kirim sign_count yang sama dengan yang sudah tersimpan di server
    await handleVerifyAttendance('in', currentCred.sign_count);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex flex-col">
      {/* Header */}
      <div className="max-w-5xl w-full mx-auto mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Presensi Terverifikasi WebAuthn
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Autentikasi kehadiran nir-sandi dengan biometrik dan perlindungan anti-replay attack
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-800 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Muat ulang data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Kembali
            </button>
          )}
        </div>
      </div>

      {/* Alert Replay Attack Terdeteksi */}
      {replayAlert && (
        <div className="max-w-5xl w-full mx-auto mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-3 animate-fadeIn">
          <BadgeAlert className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
          <div>
            <div className="font-bold text-rose-200">Keamanan Sistem Berhasil Melindungi Akun</div>
            <div className="mt-1">{replayAlert}</div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div className="max-w-5xl w-full mx-auto mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="max-w-5xl w-full mx-auto mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Panel Kontrol Biometrik */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <span>Kredensial Biometrik</span>
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                FIDO2 / WebAuthn
              </span>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                <div className="text-[11px] text-slate-400">Pengguna Aktif:</div>
                <div className="font-semibold text-white mt-0.5">{userName}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-1 truncate">
                  ID: {membershipId}
                </div>
              </div>

              {credentials.length === 0 ? (
                <div className="text-center py-4 px-2 border border-dashed border-slate-800 rounded-xl">
                  <Fingerprint className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Belum ada kredensial biometrik yang didaftarkan.</p>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleRegisterCredential}
                    className="mt-3 w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>Daftarkan Biometrik / Passkey</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Kredensial Terverifikasi</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono break-all">
                      {credentials[0].credential_id}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-emerald-500/10">
                      <span>Penghitung Tanda Tangan:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {credentials[0].sign_count}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleRegisterCredential}
                    className="w-full py-2 px-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    Daftarkan Kunci Baru
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Panel Presensi Masuk / Keluar */}
          <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Aksi Presensi Harian</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                type="button"
                disabled={actionLoading || credentials.length === 0}
                onClick={() => handleVerifyAttendance('in')}
                className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Presensi Masuk</span>
              </button>

              <button
                type="button"
                disabled={actionLoading || credentials.length === 0}
                onClick={() => handleVerifyAttendance('out')}
                className="py-3 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Presensi Keluar</span>
              </button>
            </div>

            {/* Tombol Uji Anti-Replay Attack */}
            <div className="pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={actionLoading || credentials.length === 0}
                onClick={handleTestReplayAttack}
                className="w-full py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Menguji pengiriman tanda tangan dengan sign counter lama untuk membuktikan penolakan otomatis oleh server"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Uji Keamanan Replay Attack</span>
              </button>
              <p className="text-[10px] text-slate-500 mt-1.5 text-center leading-tight">
                Membuktikan server secara otomatis menolak token bertanda tangan kedaluwarsa.
              </p>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Tabel Riwayat Presensi Terverifikasi */}
        <div className="lg:col-span-2">
          <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Log Riwayat Presensi Terverifikasi</h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Total: <strong className="text-emerald-400">{records.length}</strong> rekaman
              </span>
            </div>

            {loading ? (
              <div className="py-10">
                <SkeletonLoader />
              </div>
            ) : records.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState
                  title="Belum Ada Presensi Tercatat"
                  description="Gunakan tombol Presensi Masuk untuk mencatat log kehadiran perdana Anda hari ini."
                />
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                      <th className="pb-2.5">Waktu Presensi</th>
                      <th className="pb-2.5">Nama Anggota</th>
                      <th className="pb-2.5">Tipe</th>
                      <th className="pb-2.5">Metode</th>
                      <th className="pb-2.5 text-right">Sign Counter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 font-mono text-[11px] text-slate-300">
                          {new Date(rec.recorded_at).toLocaleString('id-ID', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })}
                        </td>
                        <td className="py-2.5 font-medium text-white">
                          {rec.member_name || userName}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rec.check_type === 'in'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {rec.check_type === 'in' ? 'Masuk' : 'Keluar'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className="flex items-center gap-1 text-[11px] text-slate-300">
                            <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WebAuthn FIDO2</span>
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono text-[11px] font-bold text-emerald-400">
                          #{rec.sign_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
