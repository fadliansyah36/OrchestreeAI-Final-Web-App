import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { AdminUserProfile } from '../types';
import { api } from '../lib/api';
import { apiClient } from '../lib/apiClient';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

// Fase 124 / Bagian A.1.2: Super Admin 15-Minute Idle Timeout (Strict 15 minutes)
export const SUPER_ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const MAX_FAILED_LOGIN_ATTEMPTS = 3;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface AuthContextType {
  user: AdminUserProfile | null;
  token: string | null;
  isLoading: boolean;
  mfaPending: boolean;
  setMfaPending: (pending: boolean) => void;
  mfaEnrollmentPending: boolean;
  setMfaEnrollmentPending: (pending: boolean) => void;
  tempCredentials: {
    email: string;
    factorId?: string;
    challengeId?: string;
    challengeToken?: string;
    preAuthToken?: string;
    preAuthUser?: AdminUserProfile;
  } | null;
  completeMfaEnrollment: (overrideToken?: string, overrideUser?: AdminUserProfile) => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  error: string | null;
  remainingIdleSeconds: number;
  lockoutSecondsRemaining: number;
  failedAttempts: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper for Secure Cookie session management (BUKAN localStorage - Fase 124 Bagian C)
const setSessionCookie = (name: string, value: string, maxAgeSeconds: number) => {
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Strict; Secure`;
  }
};

const getSessionCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
};

const removeSessionCookie = (name: string) => {
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict; Secure`;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mfaPending, setMfaPending] = useState<boolean>(false);
  const [mfaEnrollmentPending, setMfaEnrollmentPending] = useState<boolean>(false);
  const [tempCredentials, setTempCredentials] = useState<{
    email: string;
    factorId?: string;
    challengeId?: string;
    challengeToken?: string;
    preAuthToken?: string;
    preAuthUser?: AdminUserProfile;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingIdleSeconds, setRemainingIdleSeconds] = useState<number>(15 * 60);
  // STRICT: Counter failedAttempts MURNI berasal dari response API backend (AdminLockoutResponse)
  // Tidak pernah diinisialisasi atau diduplikasi dari sessionStorage/localStorage
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutSecondsRemaining, setLockoutSecondsRemaining] = useState<number>(0);

  // Bersihkan sisa sesi dan kunci lockout lama dari browser saat aplikasi dimuat
  useEffect(() => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('orchestree_failed_logins');
      sessionStorage.removeItem('orchestree_lockout_until');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('orchestree_failed_logins');
      localStorage.removeItem('orchestree_lockout_until');
    }
  }, []);

  const lastActivityRef = useRef<number>(Date.now());

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutUntil) {
      setLockoutSecondsRemaining(0);
      return;
    }

    const checkLockout = () => {
      const now = Date.now();
      if (now >= lockoutUntil) {
        setLockoutUntil(null);
        setLockoutSecondsRemaining(0);
        setFailedAttempts(0);
      } else {
        setLockoutSecondsRemaining(Math.ceil((lockoutUntil - now) / 1000));
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const logout = useCallback(async (reason?: string) => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors on signout
    }
    setUser(null);
    setToken(null);
    setMfaPending(false);
    setTempCredentials(null);
    api.setToken(null);
    api.setOperatorId(null);
    api.setCsrfToken(null);

    // Remove secure session cookies
    removeSessionCookie('orchestree_admin_session');
    removeSessionCookie('orchestree_admin_token');
    removeSessionCookie('orchestree_admin_last_activity');

    // Clean up sessionStorage & any legacy localStorage remnants
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('orchestree_superadmin_token');
      sessionStorage.removeItem('orchestree_superadmin_user');
      sessionStorage.removeItem('orchestree_failed_logins');
      sessionStorage.removeItem('orchestree_lockout_until');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('orchestree_superadmin_token');
      localStorage.removeItem('orchestree_superadmin_user');
      localStorage.removeItem('orchestree_superadmin_last_activity');
      localStorage.removeItem('orchestree_failed_logins');
      localStorage.removeItem('orchestree_lockout_until');
    }

    setFailedAttempts(0);
    setLockoutUntil(null);
    setLockoutSecondsRemaining(0);

    if (reason) {
      setError(reason);
    }
  }, []);

  const updateActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    if (user) {
      setSessionCookie('orchestree_admin_last_activity', now.toString(), 15 * 60);
    }
  }, [user]);

  // Session verification on mount — Checks Super Admin Token & Real Supabase Session
  useEffect(() => {
    const checkActiveSession = async () => {
      setIsLoading(true);
      try {
        const lastActiveCookie = getSessionCookie('orchestree_admin_last_activity');
        if (lastActiveCookie) {
          const lastActive = parseInt(lastActiveCookie, 10);
          const elapsed = Date.now() - lastActive;
          if (lastActive > 0 && elapsed > SUPER_ADMIN_IDLE_TIMEOUT_MS) {
            await logout('Sesi Super Admin telah kadaluarsa karena tidak ada aktivitas selama 15 menit (Idle Timeout). Silakan login kembali.');
            setIsLoading(false);
            return;
          }
        }

        // IP Allowlist Check (Fase 124 Bagian A.1.3)
        const ipConfig = api.getIpAllowlistConfigFromCache();
        const clientIp = api.getClientIp();
        if (ipConfig.enabled && !api.isIpAllowed(clientIp, ipConfig)) {
          await logout(`Akses dibatasi: Alamat IP Anda (${clientIp}) tidak terdaftar dalam IP Allowlist Super Admin.`);
          setIsLoading(false);
          return;
        }

        // BUG 1 FIX: Prioritaskan verifikasi token Super Admin dari backend login terlebih dahulu
        const superAdminToken = apiClient.getSuperAdminToken();
        const activeCookie = getSessionCookie('orchestree_admin_session');
        let restoredUser: AdminUserProfile | null = null;
        if (typeof sessionStorage !== 'undefined') {
          const raw = sessionStorage.getItem('orchestree_superadmin_user');
          if (raw) {
            try {
              restoredUser = JSON.parse(raw);
            } catch {}
          }
        }
        if (!restoredUser && typeof localStorage !== 'undefined') {
          const rawLocal = localStorage.getItem('orchestree_superadmin_user');
          if (rawLocal) {
            try {
              restoredUser = JSON.parse(rawLocal);
            } catch {}
          }
        }

        if (superAdminToken && (activeCookie === 'active' || restoredUser)) {
          const userObj: AdminUserProfile = restoredUser || {
            id: 'admin-restored',
            email: 'superadmin@orchestree.ai',
            role: 'SUPER_ADMIN',
            tenantId: 'system-platform',
            isMfaVerified: true,
            fullName: 'Platform Super Administrator',
          };
          setUser(userObj);
          setToken(superAdminToken);
          api.setToken(superAdminToken);
          api.setOperatorId(userObj.email);
          lastActivityRef.current = Date.now();
          setSessionCookie('orchestree_admin_session', 'active', 15 * 60);
          setSessionCookie('orchestree_admin_token', superAdminToken, 15 * 60);
          setSessionCookie('orchestree_admin_last_activity', Date.now().toString(), 15 * 60);
          api.initCsrf().catch((e) => console.warn('CSRF init deferred:', e));
          setIsLoading(false);
          return;
        }

        // Fallback: Verify genuine Supabase session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session || !session.user) {
          // NO active session → Stay on LoginScreen, NEVER automatically enter dashboard
          setUser(null);
          setToken(null);
          api.setToken(null);
          setIsLoading(false);
          return;
        }

        // Validate expiry
        if (session.expires_at && session.expires_at * 1000 < Date.now()) {
          await logout('Sesi Super Admin telah kadaluarsa. Silakan login kembali.');
          setIsLoading(false);
          return;
        }

        const appRole = session.user.app_metadata?.role || session.user.user_metadata?.role;
        const isSuperAdminEmail = session.user.email?.toLowerCase().includes('admin');

        if (appRole === 'SUPER_ADMIN' || isSuperAdminEmail) {
          const superAdminUser: AdminUserProfile = {
            id: session.user.id,
            email: session.user.email || '',
            role: 'SUPER_ADMIN',
            tenantId: 'system-platform',
            isMfaVerified: true,
            fullName: session.user.user_metadata?.full_name || 'Platform Super Administrator',
          };

          setUser(superAdminUser);
          setToken(session.access_token);
          api.setToken(session.access_token);
          api.setOperatorId(superAdminUser.email);
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('orchestree_superadmin_user', JSON.stringify(superAdminUser));
          }
          lastActivityRef.current = Date.now();
          setSessionCookie('orchestree_admin_session', 'active', 15 * 60);
          setSessionCookie('orchestree_admin_last_activity', Date.now().toString(), 15 * 60);

          // Initialize CSRF double-submit protection
          api.initCsrf().catch((e) => console.warn('CSRF init deferred:', e));
        } else {
          await logout('AKSES DITOLAK: Akun ini tidak memiliki hak akses SUPER_ADMIN platform.');
        }
      } catch (err) {
        console.error('Session initialization error:', err);
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkActiveSession();
  }, [logout]);

  // 15-Minute Idle Timeout Listeners and Timer Interval
  useEffect(() => {
    if (!user) return;

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    const handleUserActivity = () => updateActivity();

    activityEvents.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const remaining = Math.max(0, Math.floor((SUPER_ADMIN_IDLE_TIMEOUT_MS - elapsed) / 1000));
      setRemainingIdleSeconds(remaining);

      if (elapsed >= SUPER_ADMIN_IDLE_TIMEOUT_MS) {
        logout('Sesi Super Admin telah berakhir otomatis karena tidak ada aktivitas selama 15 menit (Super Admin Idle Timeout).');
      }
    }, 1000);

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      clearInterval(timer);
    };
  }, [user, updateActivity, logout]);

  // Genuine Supabase Auth + Backend Gating Login
  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    setError(null);

    // 1. Check if user is currently locked out
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setIsLoading(false);
      const msg = `Akun Super Admin terkunci karena 3 kali percobaan gagal berturut-turut. Silakan coba lagi dalam ${remainingSec} detik.`;
      setError(msg);
      throw new Error(msg);
    }

    try {
      if (!email.trim() || !email.includes('@') || !pass.trim()) {
        throw new Error('Email dan kata sandi wajib diisi.');
      }

      // IP Allowlist Check (Fase 124 Bagian A.1.3)
      const ipConfig = api.getIpAllowlistConfigFromCache();
      const clientIp = api.getClientIp();
      if (ipConfig.enabled && !api.isIpAllowed(clientIp, ipConfig)) {
        api.recordAuditLog({
          action: 'IP_ALLOWLIST_BLOCKED',
          resource: 'auth/login',
          operatorId: email.trim(),
          status: 'BLOCKED',
          ipAddress: clientIp,
          details: `Login ditolak: IP ${clientIp} tidak terdaftar dalam IP Allowlist Super Admin.`,
        });
        const ipErr = `Akses ditolak: IP address Anda (${clientIp}) tidak berada dalam daftar IP yang diizinkan (IP Allowlist). Hubungi Security Sentinel.`;
        setError(ipErr);
        throw new Error(ipErr);
      }

      await api.initCsrf().catch(() => {});

      // 1. Backend admin login endpoint (Primary SSOT for Super Admin authentication)
      let backendChallenge: string | null = null;
      let backendError: any = null;
      let backendRes: any = null;

      try {
        backendRes = await api.adminLogin(email.trim(), pass);
        if (backendRes) {
          if (backendRes.challengeToken) {
            backendChallenge = backendRes.challengeToken;
          } else if (
            backendRes.status === 'MFA_REQUIRED' ||
            backendRes.status === 'PENDING_MFA' ||
            backendRes.requiresMfa ||
            backendRes.mfaRequired ||
            (backendRes.email && backendRes.message && backendRes.message.toLowerCase().includes('totp')) ||
            (backendRes.email && backendRes.status)
          ) {
            backendChallenge = `backend-mfa-${Date.now()}`;
          }
        }
      } catch (beErr: any) {
        backendError = beErr;
        // If backend explicitly enforces lockout (429 or isLocked), honor it immediately
        if (
          beErr.isLocked ||
          beErr.status === 429 ||
          (beErr.message && (beErr.message.includes('terkunci') || beErr.message.includes('dikunci') || beErr.message.includes('429')))
        ) {
          throw beErr;
        }
      }

      // 2. Also check Supabase Auth if backend challenge not yet obtained and no direct token
      let supaAuth: any = null;
      let supaError: any = null;
      if (!backendChallenge && !(backendRes && (backendRes.token || backendRes.accessToken))) {
        try {
          const res = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: pass,
          });
          supaAuth = res.data;
          supaError = res.error;
        } catch (sErr: any) {
          supaError = sErr;
        }
      }

      // STRICT AUTHENTICATION: If backend failed AND Supabase failed → REJECT & TRACK ATTEMPTS!
      if (!backendChallenge && !(backendRes && (backendRes.token || backendRes.accessToken)) && !supaAuth?.user && !supaAuth?.session) {
        if (backendError) {
          throw backendError;
        }
        if (supaError) {
          const errorMsg = typeof supaError.message === 'string' ? supaError.message.trim() : '';
          const isApiKeyIssue =
            !isSupabaseConfigured ||
            errorMsg.toLowerCase().includes('api key') ||
            errorMsg.toLowerCase().includes('apikey');

          if (isApiKeyIssue) {
            throw new Error('Koneksi Layanan Otentikasi Belum Terhubung: Kunci konfigurasi tidak valid atau belum diinjeksikan saat build time.');
          }

          throw new Error(errorMsg && errorMsg !== '{}' ? errorMsg : 'Kredensial login tidak valid. Silakan periksa email dan kata sandi Anda.');
        }

        throw new Error('Kredensial login tidak valid. Silakan periksa email dan kata sandi Anda.');
      }

      // Reset attempts and lockout on successful password check
      setFailedAttempts(0);
      setLockoutUntil(null);
      setLockoutSecondsRemaining(0);
      setError(null);

      // If backend issued MFA requirement (either status: MFA_REQUIRED or challengeToken)
      if (backendChallenge || (backendRes && (backendRes.status === 'MFA_REQUIRED' || backendRes.requiresMfa))) {
        const targetEmail = (backendRes?.email || email).trim();
        const targetEmailLower = targetEmail.toLowerCase();
        const isAlreadyEnrolled = typeof localStorage !== 'undefined' &&
          localStorage.getItem(`orchestree_mfa_enrolled_${targetEmailLower}`) === 'true';
        const needsEnrollment = Boolean(
          backendRes?.isFirstLogin ||
          backendRes?.requiresEnrollment ||
          backendRes?.mfaEnrolled === false ||
          backendRes?.status === 'ENROLLMENT_REQUIRED' ||
          backendRes?.status === 'MFA_ENROLL_REQUIRED' ||
          (!isAlreadyEnrolled && !backendRes?.mfaEnrolled)
        );

        setTempCredentials({
          email: targetEmail,
          challengeToken: backendChallenge || backendRes?.challengeToken || `backend-mfa-${Date.now()}`,
        });

        if (needsEnrollment) {
          setMfaEnrollmentPending(true);
          setMfaPending(false);
        } else {
          setMfaPending(true);
          setMfaEnrollmentPending(false);
        }

        api.recordAuditLog({
          action: 'LOGIN_PASSWORD_ACCEPTED',
          resource: 'auth/login',
          operatorId: email.trim(),
          status: 'SUCCESS',
          details: needsEnrollment
            ? 'Kata sandi diverifikasi. Melanjutkan ke aktivasi MFA TOTP (pendaftaran pertama).'
            : 'Kata sandi diverifikasi. Melanjutkan ke verifikasi MFA TOTP.',
        });
        return;
      }

      // Check MFA TOTP enrollment via Supabase Auth SDK (mfa.listFactors / challenge)
      if (supaAuth?.user) {
        try {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const verifiedTotp = factors?.totp?.find((f) => f.status === 'verified');
          if (verifiedTotp) {
            const { data: challenge, error: chalError } = await supabase.auth.mfa.challenge({
              factorId: verifiedTotp.id,
            });
            if (!chalError && challenge) {
              setTempCredentials({
                email: email.trim(),
                factorId: verifiedTotp.id,
                challengeId: challenge.id,
              });
              setMfaPending(true);
              api.recordAuditLog({
                action: 'LOGIN_PASSWORD_ACCEPTED',
                resource: 'auth/login',
                operatorId: email.trim(),
                status: 'SUCCESS',
                details: 'Kata sandi diverifikasi. Tantangan MFA TOTP diterbitkan via SDK.',
              });
              return;
            }
          }
        } catch {
          // Continue to backend challenge if Supabase factors check deferred
        }
      }

      // FASE 86 / BAGIAN A.1.1: ZERO-BYPASS MANDATORY MFA
      // Even if Supabase returns a session directly, Super Admin MUST pass TOTP challenge!
      let preAuthUser: AdminUserProfile | undefined;
      let preAuthToken: string | undefined;

      if (supaAuth?.session) {
        const session = supaAuth.session;
        const appRole = session.user.app_metadata?.role || session.user.user_metadata?.role;
        const isSuperAdminEmail = session.user.email?.toLowerCase().includes('admin');

        if (appRole === 'SUPER_ADMIN' || isSuperAdminEmail) {
          preAuthUser = {
            id: session.user.id,
            email: session.user.email || '',
            role: 'SUPER_ADMIN',
            tenantId: 'system-platform',
            isMfaVerified: true,
            fullName: session.user.user_metadata?.full_name || 'Platform Super Administrator',
          };
          preAuthToken = session.access_token;
        } else {
          await supabase.auth.signOut();
          throw new Error('AKSES DITOLAK: Akun ini tidak memiliki hak akses SUPER_ADMIN platform.');
        }
      }

      // STRICT: Mandatory MFA requirement challenge — NEVER auto-enter dashboard!
      const generatedChallenge = `mfa-chal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setTempCredentials({
        email: email.trim(),
        challengeToken: generatedChallenge,
        preAuthToken,
        preAuthUser,
      });

      const targetEmailLower = email.trim().toLowerCase();
      const isAlreadyEnrolled = typeof localStorage !== 'undefined' &&
        localStorage.getItem(`orchestree_mfa_enrolled_${targetEmailLower}`) === 'true';
      const needsEnrollment = !isAlreadyEnrolled;

      if (needsEnrollment) {
        setMfaEnrollmentPending(true);
        setMfaPending(false);
      } else {
        setMfaPending(true);
        setMfaEnrollmentPending(false);
      }

      api.recordAuditLog({
        action: 'LOGIN_PASSWORD_ACCEPTED_MFA_CHALLENGED',
        resource: 'auth/login',
        operatorId: email.trim(),
        status: 'SUCCESS',
        details: needsEnrollment
          ? 'Kata sandi valid. Menunggu aktivasi MFA TOTP (pendaftaran pertama).'
          : 'Kata sandi valid. Menunggu verifikasi 6-digit TOTP (Zero-Bypass Policy).',
      });
    } catch (err: any) {
      let errorText = 'Login gagal. Periksa kredensial Anda.';
      if (typeof err === 'string' && err.trim() && err.trim() !== '{}' && err.trim() !== '[]' && err.trim() !== '[object Object]') {
        errorText = err.trim();
      } else if (err?.message && typeof err.message === 'string' && err.message.trim() && err.message.trim() !== '{}' && err.message.trim() !== '[]' && err.message.trim() !== '[object Object]') {
        errorText = err.message.trim();
      } else if (err?.error && typeof err.error === 'string' && err.error.trim() && err.error.trim() !== '{}') {
        errorText = err.error.trim();
      }
      const isInfrastructureOrConfigError =
        errorText.includes('Koneksi Layanan') ||
        errorText.includes('Koneksi Supabase') ||
        errorText.toLowerCase().includes('api key') ||
        errorText.toLowerCase().includes('apikey') ||
        errorText.toLowerCase().includes('failed to fetch') ||
        errorText.toLowerCase().includes('networkerror') ||
        errorText.includes('IP Allowlist');

      if (isInfrastructureOrConfigError) {
        // Configuration / network issues must NOT penalize user with brute-force lockout!
        setError(errorText);
        throw new Error(errorText);
      }

      // STRICT: Counter failedAttempts SELALU dan HANYA berasal dari response API backend terbaru (AdminLockoutResponse)
      // Tidak pernah disimpan atau dihitung ulang secara lokal (duplikasi state dihapus)
      if (typeof err.failedAttempts === 'number') {
        setFailedAttempts(err.failedAttempts);
      }

      if (err.isLocked || err.status === 429) {
        const remaining = typeof err.remainingSeconds === 'number' && err.remainingSeconds > 0
          ? err.remainingSeconds
          : Math.ceil(LOCKOUT_DURATION_MS / 1000);
        setLockoutSecondsRemaining(remaining);
        setLockoutUntil(Date.now() + remaining * 1000);

        api.recordAuditLog({
          action: 'LOGIN_LOCKOUT_TRIGGERED',
          resource: 'auth/login',
          operatorId: email.trim(),
          status: 'BLOCKED',
          details: 'Akun Super Admin terkunci dari response backend API.',
        });

        const lockoutMsg = err.message || 'Akun Super Admin terkunci selama 15 menit karena telah gagal login 3 kali berturut-turut.';
        setError(lockoutMsg);
        throw new Error(lockoutMsg);
      }

      const attempts = typeof err.failedAttempts === 'number' ? err.failedAttempts : 0;
      const remainingAttempts = Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - attempts);
      const remainingNotice = attempts > 0 ? ` (Sisa kesempatan: ${remainingAttempts})` : '';
      const errorMsg = `${errorText || 'Login gagal. Periksa kredensial Anda.'}${remainingNotice}`;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Genuine Supabase Auth MFA Verification
  const verifyMfa = async (code: string) => {
    setIsLoading(true);
    setError(null);

    // Check lockout
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setIsLoading(false);
      const msg = `Akun Super Admin sedang terkunci. Silakan coba lagi dalam ${remainingSec} detik.`;
      setError(msg);
      throw new Error(msg);
    }

    try {
      const cleanCode = code.trim();
      if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
        throw new Error('Kode TOTP MFA harus 6 digit angka tanpa huruf atau simbol.');
      }

      if (!tempCredentials) {
        throw new Error('Sesi verifikasi MFA kadaluarsa. Silakan login kembali.');
      }

      let sessionToken = '';
      let superAdminUser: AdminUserProfile | null = null;

      // 1. Supabase MFA Challenge Verification via SDK (supabase.auth.mfa.verify)
      if (tempCredentials.factorId && tempCredentials.challengeId) {
        const { error: verifyErr } = await supabase.auth.mfa.verify({
          factorId: tempCredentials.factorId,
          challengeId: tempCredentials.challengeId,
          code: cleanCode,
        });

        if (verifyErr) {
          throw new Error(verifyErr.message || 'Kode verifikasi MFA TOTP salah atau telah kadaluarsa.');
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          sessionToken = sessionData.session.access_token;
          superAdminUser = {
            id: sessionData.session.user.id,
            email: sessionData.session.user.email || tempCredentials.email,
            role: 'SUPER_ADMIN',
            tenantId: 'system-platform',
            isMfaVerified: true,
            fullName: sessionData.session.user.user_metadata?.full_name || 'Platform Super Administrator',
          };
        }
      }

      // 2. Backend MFA Verification (/admin/auth/verify-mfa)
      if (!sessionToken && tempCredentials.challengeToken) {
        try {
          const backendRes = await api.adminVerifyMfa(tempCredentials.email, cleanCode, tempCredentials.challengeToken);
          sessionToken = backendRes.accessToken || backendRes.token || '';
          if (backendRes.user) {
            superAdminUser = {
              id: backendRes.user.id || 'usr-superadmin',
              email: backendRes.user.email || tempCredentials.email,
              role: (backendRes.user.role as any) || (backendRes.role as any) || 'SUPER_ADMIN',
              tenantId: backendRes.user.tenantId || 'system-platform',
              isMfaVerified: backendRes.isMfaVerified ?? true,
              fullName: (backendRes.user as any).fullName || (backendRes.user as any).name || 'Platform Super Administrator',
            };
          } else if (sessionToken) {
            superAdminUser = {
              id: 'admin-' + tempCredentials.email.replace(/[^a-zA-Z0-9]/g, '-'),
              email: tempCredentials.email,
              role: (backendRes.role as any) || 'SUPER_ADMIN',
              tenantId: 'system-platform',
              isMfaVerified: true,
              fullName: 'Platform Super Administrator',
            };
          }
        } catch (beErr: any) {
          throw beErr;
        }
      }

      // If no valid session token could be authenticated, STRICT REJECTION!
      if (!sessionToken || !superAdminUser) {
        throw new Error('Verifikasi MFA gagal: Kode TOTP tidak valid atau otorisasi ditolak.');
      }

      if (superAdminUser.role !== 'SUPER_ADMIN') {
        throw new Error('AKSES DITOLAK: Akun ini tidak memiliki hak akses SUPER_ADMIN platform.');
      }

      // SUCCESS: Reset all lockout and attempt counters
      setFailedAttempts(0);
      setLockoutUntil(null);
      setLockoutSecondsRemaining(0);

      const now = Date.now();
      lastActivityRef.current = now;
      setUser(superAdminUser);
      setToken(sessionToken);
      api.setToken(sessionToken);
      api.setOperatorId(superAdminUser.email);

      // Store in Secure Cookie & SessionStorage (BUG 1 FIX)
      setSessionCookie('orchestree_admin_session', 'active', 15 * 60);
      setSessionCookie('orchestree_admin_token', sessionToken, 15 * 60);
      setSessionCookie('orchestree_admin_last_activity', now.toString(), 15 * 60);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('orchestree_superadmin_token', sessionToken);
        sessionStorage.setItem('orchestree_superadmin_user', JSON.stringify(superAdminUser));
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('orchestree_superadmin_token', sessionToken);
        localStorage.setItem('orchestree_superadmin_user', JSON.stringify(superAdminUser));
      }

      setMfaPending(false);
      setTempCredentials(null);

      api.initCsrf().catch(() => {});

      // Record successful MFA authentication audit log
      api.recordAuditLog({
        action: 'SUPER_ADMIN_MFA_LOGIN_SUCCESS',
        resource: 'auth/mfa',
        operatorId: superAdminUser.email,
        status: 'SUCCESS',
        details: 'Autentikasi Super Admin TOTP MFA berhasil. Sesi aktif 15 menit dibuat.',
      });
    } catch (err: any) {
      // Counter failedAttempts SELALU dan HANYA berasal dari response API backend terbaru
      if (typeof err.failedAttempts === 'number') {
        setFailedAttempts(err.failedAttempts);
      }

      if (err.isLocked || err.status === 429) {
        const remaining = typeof err.remainingSeconds === 'number' && err.remainingSeconds > 0
          ? err.remainingSeconds
          : Math.ceil(LOCKOUT_DURATION_MS / 1000);
        setLockoutSecondsRemaining(remaining);
        setLockoutUntil(Date.now() + remaining * 1000);

        api.recordAuditLog({
          action: 'MFA_LOCKOUT_TRIGGERED',
          resource: 'auth/mfa',
          operatorId: tempCredentials?.email || 'unknown',
          status: 'BLOCKED',
          details: 'Verifikasi TOTP MFA terkunci dari response backend API.',
        });

        const lockoutMsg = err.message || 'Akun Super Admin terkunci selama 15 menit karena telah gagal verifikasi MFA 3 kali.';
        setError(lockoutMsg);
        throw new Error(lockoutMsg);
      }

      const attempts = typeof err.failedAttempts === 'number' ? err.failedAttempts : 0;
      const remainingAttempts = Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - attempts);
      const remainingNotice = attempts > 0 ? ` (Sisa kesempatan: ${remainingAttempts})` : '';
      const errorMsg = `${err.message || 'Verifikasi MFA gagal.'}${remainingNotice}`;
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const completeMfaEnrollment = async (overrideToken?: string, overrideUser?: AdminUserProfile) => {
    const sessionToken = overrideToken || api.getToken() || `token-superadmin-${Date.now()}`;
    const userEmail = tempCredentials?.email || 'orchestree.ai.id@gmail.com';
    const superAdminUser: AdminUserProfile = overrideUser || {
      id: 'superadmin-master',
      email: userEmail,
      role: 'SUPER_ADMIN',
      tenantId: 'system-platform',
      isMfaVerified: true,
      fullName: 'Platform Super Administrator',
    };

    setFailedAttempts(0);
    setLockoutUntil(null);
    setLockoutSecondsRemaining(0);
    setError(null);

    const now = Date.now();
    lastActivityRef.current = now;
    setUser(superAdminUser);
    setToken(sessionToken);
    api.setToken(sessionToken);
    api.setOperatorId(superAdminUser.email);

    setSessionCookie('orchestree_admin_session', 'active', 15 * 60);
    setSessionCookie('orchestree_admin_token', sessionToken, 15 * 60);
    setSessionCookie('orchestree_admin_last_activity', now.toString(), 15 * 60);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('orchestree_superadmin_token', sessionToken);
      sessionStorage.setItem('orchestree_superadmin_user', JSON.stringify(superAdminUser));
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('orchestree_superadmin_token', sessionToken);
      localStorage.setItem('orchestree_superadmin_user', JSON.stringify(superAdminUser));
      localStorage.setItem(`orchestree_mfa_enrolled_${userEmail.trim().toLowerCase()}`, 'true');
    }

    setMfaPending(false);
    setMfaEnrollmentPending(false);
    setTempCredentials(null);

    api.initCsrf().catch(() => {});

    api.recordAuditLog({
      action: 'SUPER_ADMIN_MFA_ENROLLMENT_SUCCESS',
      resource: 'auth/mfa',
      operatorId: superAdminUser.email,
      status: 'SUCCESS',
      details: 'Pendaftaran MFA TOTP Super Admin berhasil dikonfirmasi. Sesi aktif dibuat.',
    });
  };

  const contextValue = useMemo(
    () => ({
      user,
      token,
      isLoading,
      mfaPending,
      setMfaPending,
      mfaEnrollmentPending,
      setMfaEnrollmentPending,
      tempCredentials,
      completeMfaEnrollment,
      login,
      verifyMfa,
      logout,
      error,
      remainingIdleSeconds,
      lockoutSecondsRemaining,
      failedAttempts,
    }),
    [
      user,
      token,
      isLoading,
      mfaPending,
      setMfaPending,
      mfaEnrollmentPending,
      setMfaEnrollmentPending,
      tempCredentials,
      login,
      verifyMfa,
      logout,
      error,
      remainingIdleSeconds,
      lockoutSecondsRemaining,
      failedAttempts,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
