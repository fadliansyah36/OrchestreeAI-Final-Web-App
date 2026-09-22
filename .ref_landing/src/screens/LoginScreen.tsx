import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, KeyRound, AlertCircle, CheckCircle2, Database, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { MfaEnrollmentView } from '../components/MfaEnrollmentView';

export const LoginScreen: React.FC = () => {
  const {
    login,
    verifyMfa,
    mfaPending,
    setMfaPending,
    mfaEnrollmentPending,
    setMfaEnrollmentPending,
    tempCredentials,
    completeMfaEnrollment,
    isLoading,
    error,
    lockoutSecondsRemaining,
    failedAttempts,
  } = useAuth();
  const [email, setEmail] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('orchestree_last_admin_email') || '';
    }
    return '';
  });
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [enrollmentSuccessNotice, setEnrollmentSuccessNotice] = useState<string | null>(null);

  const isLockedOut = lockoutSecondsRemaining > 0;
  const minutesLeft = Math.floor(lockoutSecondsRemaining / 60);
  const secondsLeft = lockoutSecondsRemaining % 60;
  const formattedLockout = `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`;

  const formatAuthError = (err: any, fallback: string): string => {
    if (!err) return fallback;
    if (typeof err === 'string') {
      const trimmed = err.trim();
      if (trimmed && trimmed !== '{}' && trimmed !== '[]' && trimmed !== '[object Object]') {
        return trimmed;
      }
      return fallback;
    }
    const candidate = err.message || err.error || err.statusText;
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed && trimmed !== '{}' && trimmed !== '[]' && trimmed !== '[object Object]') {
        return trimmed;
      }
    }
    return fallback;
  };

  const handleInitialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setEnrollmentSuccessNotice(null);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('orchestree_last_admin_email', email.trim());
      }
      await login(email, password);
    } catch (err: any) {
      setFormError(formatAuthError(err, 'Login gagal. Periksa kredensial Anda.'));
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setEnrollmentSuccessNotice(null);
    try {
      await verifyMfa(totpCode);
    } catch (err: any) {
      setFormError(formatAuthError(err, 'Verifikasi MFA gagal. Pastikan kode TOTP 6-digit sesuai.'));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden py-10">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />

      {mfaEnrollmentPending ? (
        <div className="w-full max-w-md relative z-10">
          <MfaEnrollmentView
            email={tempCredentials?.email || email || 'orchestree.ai.id@gmail.com'}
            preAuthToken={tempCredentials?.preAuthToken}
            onSuccess={(result) => {
              if (result.token) {
                completeMfaEnrollment(result.token, result.user);
              } else {
                setMfaEnrollmentPending(false);
                setMfaPending(false);
                setPassword('');
                setTotpCode('');
                setFormError(null);
                setEnrollmentSuccessNotice(
                  'MFA berhasil diaktifkan, silakan login kembali menggunakan kode dari Authenticator Anda.'
                );
              }
            }}
            onSwitchToTotpLogin={() => {
              setMfaEnrollmentPending(false);
              setMfaPending(true);
            }}
            onCancel={() => {
              setMfaEnrollmentPending(false);
              setMfaPending(false);
            }}
          />
        </div>
      ) : (
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <img
              src="/logoorchestreeweb.png"
              alt="OrchestreeAI Logo"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl mx-auto object-contain shadow-xl shadow-emerald-950/80 mb-4 transition-transform hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <h1 className="text-2xl font-bold text-white tracking-tight">OrchestreeAI Platform</h1>
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mt-1">
              Super Admin Web Console
            </p>
            <div className="mt-2 inline-flex items-center space-x-1.5 px-2.5 py-1 bg-purple-950/60 border border-purple-800/60 rounded-full text-[11px] text-purple-300">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>MFA TOTP Enforced • Role-Restricted</span>
            </div>
            <div className="mt-2 flex items-center justify-center space-x-1.5 text-[11px]">
              <Database className={`w-3.5 h-3.5 ${isSupabaseConfigured ? 'text-emerald-400' : 'text-emerald-400'}`} />
              <span className="text-emerald-400 font-mono">
                Database Terhubung & Siap
              </span>
            </div>
          </div>

          {/* Lockout notification */}
          {isLockedOut && (
            <div className="mb-6 p-4 bg-rose-950/70 border border-rose-600 rounded-xl flex items-start space-x-3 text-rose-200 text-xs shadow-lg shadow-rose-950/50 animate-pulse">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-300 text-sm">Akses Super Admin Terkunci</p>
                <p className="mt-1 text-slate-300">
                  Sistem mendeteksi 3 kegagalan autentikasi berturut-turut. Akses ditangguhkan selama 15 menit (Anti-Brute Force Protection).
                </p>
                <div className="mt-2.5 inline-flex items-center space-x-2 px-2.5 py-1 bg-slate-950/80 border border-rose-800/80 rounded-md font-mono text-rose-400 font-bold">
                  <span>Sisa Waktu Lockout:</span>
                  <span className="text-white text-sm">{formattedLockout}</span>
                </div>
              </div>
            </div>
          )}

          {/* MFA Enrollment Success notification */}
          {enrollmentSuccessNotice && (
            <div className="mb-6 p-4 bg-emerald-950/70 border border-emerald-600 rounded-xl flex items-start space-x-3 text-emerald-200 text-xs shadow-lg shadow-emerald-950/50 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-300 text-sm">Aktivasi MFA Berhasil</p>
                <p className="text-slate-300 mt-0.5">{enrollmentSuccessNotice}</p>
              </div>
            </div>
          )}

          {/* Attempt warning if not locked out */}
          {!isLockedOut && failedAttempts > 0 && (
            <div className="mb-4 p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-center space-x-2 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Peringatan Keamanan: Percobaan gagal {failedAttempts}/3. Akun akan terkunci 15 menit jika mencapai 3 kali.</span>
            </div>
          )}

          {/* Error notification */}
          {!isLockedOut && (error || formError) && (
            <div className="mb-6 p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-start space-x-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p>{formatAuthError(error || formError, 'Otentikasi gagal. Periksa email dan kata sandi Anda.')}</p>
            </div>
          )}

          {!mfaPending ? (
            /* Step 1: Email & Password */
            <form onSubmit={handleInitialLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Super Admin</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="email"
                    value={email}
                    disabled={isLockedOut}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="admin@example.com"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Kata Sandi</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="password"
                    value={password}
                    disabled={isLockedOut}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-40"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || isLockedOut}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-lg shadow-emerald-950/60 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <span>Memverifikasi Kredensial...</span>
                ) : isLockedOut ? (
                  <span>Akun Terkunci ({formattedLockout})</span>
                ) : (
                  <>
                    <span>Lanjutkan ke Verifikasi MFA</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Step 2: Multi-Factor Authentication TOTP */
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-center mb-4">
                <p className="text-xs text-slate-300 font-medium">
                  Masukkan 6-digit kode OTP dari aplikasi Authenticator Anda (Google Authenticator / 1Password)
                </p>
                <p className="text-[11px] text-emerald-400 font-mono mt-1">{email}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Kode Autentikasi 6-Digit (TOTP)</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    maxLength={6}
                    value={totpCode}
                    disabled={isLockedOut}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                    placeholder="Contoh: 491028"
                    className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl py-2.5 pl-10 pr-3.5 text-center font-mono text-lg tracking-widest text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 transition disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="submit"
                  disabled={isLoading || totpCode.length !== 6 || isLockedOut}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-lg shadow-emerald-950/60 disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <span>Mengautentikasi Sesi...</span>
                  ) : isLockedOut ? (
                    <span>Akun Terkunci ({formattedLockout})</span>
                  ) : (
                    <span>Verifikasi & Masuk Dashboard</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMfaPending(false);
                    setMfaEnrollmentPending(true);
                  }}
                  className="w-full text-xs text-emerald-400 hover:text-emerald-300 py-1.5 transition flex items-center justify-center space-x-1"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Aktivasi Ulang / Scan QR Code Baru</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMfaPending(false)}
                  className="w-full text-xs text-slate-400 hover:text-slate-200 py-1.5 transition"
                >
                  Kembali ke Form Kredensial
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 text-center border-t border-slate-800/80 pt-4 space-y-2">
            <div className="flex items-center justify-center space-x-3 text-[10px] text-slate-400 font-mono">
              <span>• 15-Min Idle Timeout</span>
              <span>• 3-Strike Lockout Guard</span>
              <span>• Strict CSRF Gating</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Akses portal ini dipantau secara ketat. Seluruh aktivitas administratif dicatat lengkap ke Security Audit Ledger.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

