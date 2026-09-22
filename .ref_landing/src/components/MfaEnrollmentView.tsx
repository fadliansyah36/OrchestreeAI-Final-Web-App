import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  ArrowRight,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import { AdminMfaEnrollResponse } from '../types';

interface MfaEnrollmentViewProps {
  email: string;
  preAuthToken?: string;
  onSuccess: (result: { token?: string; user?: any; message?: string }) => void;
  onSwitchToTotpLogin?: () => void;
  onCancel?: () => void;
  isModal?: boolean;
}

export const MfaEnrollmentView: React.FC<MfaEnrollmentViewProps> = ({
  email,
  preAuthToken,
  onSuccess,
  onSwitchToTotpLogin,
  onCancel,
  isModal = false,
}) => {
  const [enrollData, setEnrollData] = useState<AdminMfaEnrollResponse | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState<string>('');
  const [isLoadingEnroll, setIsLoadingEnroll] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showManualKey, setShowManualKey] = useState<boolean>(false);

  // Simpan props terbaru di ref untuk menghindari re-trigger yang tidak diinginkan
  const emailRef = useRef(email);
  const preAuthTokenRef = useRef(preAuthToken);
  emailRef.current = email;
  preAuthTokenRef.current = preAuthToken;

  // Guard agar pendaftaran hanya dieksekusi 1 kali saat modal dibuka (bahkan di StrictMode/re-render)
  const hasInitiatedRef = useRef(false);

  const fetchEnrollment = useCallback(async (isManualRefresh: boolean = false) => {
    setIsLoadingEnroll(true);
    setErrorMessage(null);
    setSecret(null);
    setOtpauthUri(null);
    try {
      const data = await api.adminMfaEnroll(emailRef.current, preAuthTokenRef.current);
      const resolvedSecret =
        data.secret ||
        data.secretKey ||
        (data.otpauthUri ? new URL(data.otpauthUri).searchParams.get('secret') : null);

      if (!resolvedSecret || !data.otpauthUri) {
        throw new Error('Response API enroll tidak memuat secret key atau URI OTP yang valid.');
      }

      setSecret(resolvedSecret);
      setOtpauthUri(data.otpauthUri);
      setEnrollData(data);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Gagal menyiapkan pendaftaran MFA TOTP. Silakan coba kembali.'
      );
    } finally {
      setIsLoadingEnroll(false);
    }
  }, []);

  // FASE AUDIT MFA: Eksekusi HANYA SEKALI saat modal dibuka (dependency array kosong [])
  // Tidak ada auto-refresh berkala (setInterval) karena secret TOTP tidak boleh berubah tanpa aksi eksplisit user.
  useEffect(() => {
    if (hasInitiatedRef.current) return;
    hasInitiatedRef.current = true;
    fetchEnrollment(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleConfirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = totpCode.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setErrorMessage('Masukkan 6-digit angka kode verifikasi dari aplikasi Authenticator.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const confirmRes = await api.adminMfaConfirmEnrollment(
        cleanCode,
        email,
        enrollData?.enrollmentToken,
        preAuthToken,
        secret || enrollData?.secret || enrollData?.secretKey
      );

      const isSuccess = Boolean(
        confirmRes.success ||
        confirmRes.status === 'ACTIVE' ||
        confirmRes.status === 'SUCCESS' ||
        confirmRes.token ||
        confirmRes.accessToken
      );

      if (isSuccess) {
        const hasToken = Boolean(confirmRes.token || confirmRes.accessToken);
        const successMsg = hasToken
          ? (confirmRes.message || 'MFA berhasil diaktifkan! Mengarahkan ke dashboard...')
          : 'MFA berhasil diaktifkan, silakan login kembali menggunakan kode dari Authenticator Anda.';

        setSuccessMessage(successMsg);
        setErrorMessage(null);
        // Langkah 1.3: Bersihkan form/state (kode 6-digit dikosongkan agar tidak lagi terlihat di layar)
        setTotpCode('');

        // Tandai di localStorage bahwa email ini sudah menyelesaikan enrollment
        try {
          localStorage.setItem(`orchestree_mfa_enrolled_${email.trim().toLowerCase()}`, 'true');
        } catch {}

        setTimeout(() => {
          onSuccess({
            token: confirmRes.token || confirmRes.accessToken,
            user: confirmRes.user,
            message: confirmRes.message,
          });
        }, 1200);
      } else {
        throw new Error(confirmRes.message || 'Verifikasi kode MFA gagal.');
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Kode verifikasi tidak sesuai atau sudah kadaluarsa. Silakan periksa kembali aplikasi Authenticator Anda.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`w-full ${
        isModal
          ? 'bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 max-w-xl mx-auto'
          : 'bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 relative z-10'
      }`}
    >
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-950/50">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          Aktivasi Multi-Factor Authentication (MFA)
        </h2>
        <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto">
          Amankan akun Super Admin dengan memasang autentikasi 2 langkah (TOTP). Wajib untuk akses console platform.
        </p>
        <div className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-950 border border-slate-800 rounded-full text-[11px] font-mono text-emerald-400">
          <span>Akun: {email}</span>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-950/70 border border-emerald-600 rounded-xl flex items-center space-x-3 text-emerald-200 text-xs shadow-lg shadow-emerald-950/50 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="font-bold text-emerald-300 text-sm">Aktivasi MFA Berhasil</p>
            <p className="text-slate-300 mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="mb-6 p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-start space-x-2.5 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{errorMessage}</p>
            <p className="text-[11px] text-rose-400/80 mt-0.5">
              Pastikan jam di perangkat Anda sinkron dengan waktu internet dan masukkan kode 6-digit terbaru.
            </p>
          </div>
        </div>
      )}

      {isLoadingEnroll ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-xs text-slate-400">Menyiapkan kunci rahasia & QR Code MFA...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Step 1: Scan QR Code */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 text-center">
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="font-semibold text-slate-200 flex items-center space-x-1.5">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Langkah 1: Pindai QR Code</span>
              </span>
              <button
                type="button"
                onClick={() => fetchEnrollment(true)}
                disabled={isLoadingEnroll}
                className="text-[11px] text-slate-400 hover:text-emerald-400 disabled:opacity-50 flex items-center space-x-1 transition cursor-pointer"
                title="Generate ulang QR Code secara manual"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingEnroll ? 'animate-spin' : ''}`} />
                <span>Refresh Key</span>
              </button>
            </div>

            {otpauthUri ? (
              <div className="flex flex-col items-center">
                <div className="bg-white p-3.5 rounded-2xl shadow-xl shadow-black/40 border-4 border-emerald-950/40 inline-block">
                  <QRCodeSVG
                    value={otpauthUri}
                    size={176}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-3 max-w-xs">
                  Buka aplikasi <strong>Google Authenticator</strong>, <strong>1Password</strong>, atau <strong>Authy</strong>, lalu scan kode di atas.
                </p>
              </div>
            ) : (
              <div className="p-4 text-xs text-amber-300">
                URI Otentikasi tidak tersedia dari response server. Silakan refresh kembali.
              </div>
            )}

            {/* Secret key toggle / manual display */}
            <div className="mt-3 pt-3 border-t border-slate-800/60">
              {!showManualKey ? (
                <button
                  type="button"
                  onClick={() => setShowManualKey(true)}
                  className="text-[11px] text-slate-400 hover:text-emerald-400 underline transition inline-flex items-center space-x-1 cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>Tidak bisa scan kamera? Masukkan kunci manual</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Kunci Rahasia Manual (Base32):
                  </span>
                  {secret ? (
                    <div className="flex items-center justify-center space-x-2 bg-slate-900 border border-slate-700/70 rounded-lg p-2 font-mono text-xs text-emerald-400">
                      <span className="select-all tracking-wider font-bold">
                        {secret}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                        title="Salin Kunci"
                      >
                        {copiedSecret ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="p-2 text-xs text-rose-400 bg-rose-950/30 rounded border border-rose-900/50 text-center">
                      Kunci rahasia belum dimuat dari server.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Input First 6-digit Code */}
          <form onSubmit={handleConfirmEnrollment} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Langkah 2: Masukkan Kode 6-Digit Pertama</span>
                </label>
                <span className="text-[10px] text-slate-500 font-mono">TOTP RFC-6238</span>
              </div>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                disabled={isSubmitting || Boolean(successMessage)}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                placeholder="Contoh: 123456"
                className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl py-3 px-4 text-center font-mono text-xl tracking-[0.3em] text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 transition"
              />
              <p className="mt-1 text-[11px] text-slate-400 text-center">
                Masukkan 6 angka yang ditampilkan aplikasi Authenticator Anda sesaat setelah scan.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting || totpCode.length !== 6 || Boolean(successMessage)}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-lg shadow-emerald-950/60 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mengonfirmasi & Mengaktifkan MFA...</span>
                  </>
                ) : (
                  <>
                    <span>Konfirmasi Aktivasi MFA</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {onSwitchToTotpLogin && (
                <button
                  type="button"
                  onClick={onSwitchToTotpLogin}
                  className="w-full text-xs text-slate-400 hover:text-slate-200 py-1.5 transition text-center"
                >
                  Sudah pernah aktivasi QR sebelumnya? Masukkan kode TOTP langsung
                </button>
              )}

              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full text-xs text-slate-500 hover:text-slate-300 py-1 transition text-center"
                >
                  Batal / Kembali
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
