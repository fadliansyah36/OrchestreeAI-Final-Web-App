import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Users,
  KeyRound,
  Shield,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Lock,
  Mail,
  User,
  Sparkles,
  Loader2,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_SUPABASE_URL || process.env?.VITE_SUPABASE_URL)) || (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_SUPABASE_URL : '') || '';
const SUPABASE_ANON_KEY = (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env?.VITE_SUPABASE_ANON_KEY)) || (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY : '') || '';
const supabase = createClient(SUPABASE_URL || 'https://supabase.co', SUPABASE_ANON_KEY || 'public-anon-key');

export type AuthModalMode = 'login' | 'register_tenant' | 'join_staff';

interface TenantRegistrationResponse {
  tenant_id: string;
  legal_name: string;
  display_name: string;
  status: string;
  membership_id: string;
  role: string;
  owner_full_name?: string;
  created_at: string;
}

interface AuthModalCardProps {
  isOpen: boolean;
  initialMode?: AuthModalMode;
  initialPlanCode?: string;
  onClose: () => void;
  onSuccess: (tenant: TenantRegistrationResponse) => void;
  onOpenFullWizard?: () => void;
}

interface SubscriptionPlanOption {
  id: string;
  plan_code: string;
  display_name: string;
  price_monthly: string;
}

export const AuthModalCard: React.FC<AuthModalCardProps> = ({
  isOpen,
  initialMode = 'login',
  initialPlanCode = 'FREE_TRIAL',
  onClose,
  onSuccess,
  onOpenFullWizard,
}) => {
  const [activeTab, setActiveTab] = useState<AuthModalMode>(initialMode);
  const [loginSubRole, setLoginSubRole] = useState<'owner' | 'staff'>('owner');

  // Login form states
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCompanyCode, setLoginCompanyCode] = useState('');

  // Register Tenant form states
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [selectedPlanCode, setSelectedPlanCode] = useState(initialPlanCode);
  const [plans, setPlans] = useState<SubscriptionPlanOption[]>([]);

  // Join Staff form states
  const [staffCompanyCode, setStaffCompanyCode] = useState('');
  const [staffFullName, setStaffFullName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffDepartment, setStaffDepartment] = useState('');
  const [codeVerification, setCodeVerification] = useState<{
    status: 'idle' | 'checking' | 'valid' | 'invalid';
    companyName?: string;
    message?: string;
  }>({ status: 'idle' });

  // UI status states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync mode when prop changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, initialMode]);

  // Fetch plans for registration wizard
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/v1/public/subscription-plans')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPlans(data);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Realtime Company Code verification
  const handleVerifyCode = async (codeToVerify: string) => {
    const trimmed = codeToVerify.trim().toUpperCase();
    if (!trimmed) {
      setCodeVerification({ status: 'idle' });
      return;
    }

    setCodeVerification({ status: 'checking' });
    try {
      const res = await fetch(`/api/v1/auth/verify-company-code?code=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        setCodeVerification({
          status: 'valid',
          companyName: data.display_name || data.legal_name,
          message: 'Kode valid dan terdaftar',
        });
      } else {
        setCodeVerification({
          status: 'invalid',
          message: data.error || 'Kode tidak ditemukan atau kedaluwarsa.',
        });
      }
    } catch {
      setCodeVerification({
        status: 'invalid',
        message: 'Gagal memverifikasi kode perusahaan.',
      });
    }
  };

  // 1. Submit Login Handler (Direct Supabase Auth Client)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const email = loginIdentifier.trim();
      const password = loginPassword;

      if (!email || !password) {
        throw new Error('Email dan kata sandi wajib diisi.');
      }

      // Otentikasi langsung menggunakan Supabase Auth Client
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message || 'Kredensial login tidak valid.');
      }

      if (!data.user) {
        throw new Error('Pengguna tidak ditemukan dalam sistem otentikasi.');
      }

      const userMeta = data.user.user_metadata || {};
      const tenantPayload: TenantRegistrationResponse = {
        tenant_id: userMeta.tenant_id || data.user.id,
        legal_name: userMeta.legal_name || 'Organisasi Terdaftar',
        display_name: userMeta.display_name || userMeta.full_name || email.split('@')[0],
        status: 'active',
        membership_id: crypto.randomUUID(),
        role: userMeta.role || (loginSubRole === 'owner' ? 'TENANT_OWNER' : 'TENANT_MEMBER'),
        owner_full_name: userMeta.full_name || email,
        created_at: new Date().toISOString(),
      };

      localStorage.setItem('orchestree_active_tenant', JSON.stringify(tenantPayload));
      if (data.session?.access_token) {
        localStorage.setItem('orchestree_auth_token', data.session.access_token);
      }
      setSuccessMessage(`Selamat datang kembali, ${tenantPayload.owner_full_name}!`);

      setTimeout(() => {
        onSuccess(tenantPayload);
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat proses masuk.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Submit Register Tenant Handler
  const handleRegisterTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalName.trim() || !displayName.trim() || !ownerFullName.trim()) {
      setErrorMessage('Nama legal perusahaan, nama tampilan, dan nama pimpinan wajib diisi.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const generatedOwnerId = crypto.randomUUID();

    try {
      const res = await fetch('/api/v1/onboarding/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: legalName.trim(),
          display_name: displayName.trim(),
          owner_auth_user_id: generatedOwnerId,
          owner_full_name: ownerFullName.trim(),
          plan_code: selectedPlanCode || 'FREE_TRIAL',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Pendaftaran perusahaan gagal diproses.');
      }

      localStorage.setItem('orchestree_active_tenant', JSON.stringify(data));
      setSuccessMessage(`Perusahaan ${data.display_name} berhasil didaftarkan di Supabase!`);

      setTimeout(() => {
        onSuccess(data);
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi galat saat mendaftarkan perusahaan.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Submit Join Staff Handler
  const handleJoinStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffCompanyCode.trim() || !staffFullName.trim() || !staffEmail.trim()) {
      setErrorMessage('Kode perusahaan, nama lengkap, dan email kerja wajib diisi.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const generatedUserId = crypto.randomUUID();

    try {
      const res = await fetch('/api/v1/onboarding/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_code: staffCompanyCode.trim().toUpperCase(),
          full_name: staffFullName.trim(),
          email: staffEmail.trim(),
          auth_user_id: generatedUserId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Pendaftaran staff gagal diproses.');
      }

      setSuccessMessage(
        data.message || 'Permohonan bergabung berhasil dikirim ke antrian persetujuan HR.'
      );

      // Auto login as member if valid
      if (data.tenant_id) {
        const staffPayload: TenantRegistrationResponse = {
          tenant_id: data.tenant_id,
          legal_name: codeVerification.companyName || 'Organisasi Terdaftar',
          display_name: codeVerification.companyName || 'Organisasi',
          status: 'pending_approval',
          membership_id: data.queue_id || generatedUserId,
          role: 'TENANT_MEMBER',
          owner_full_name: staffFullName.trim(),
          created_at: new Date().toISOString(),
        };

        localStorage.setItem('orchestree_active_tenant', JSON.stringify(staffPayload));

        setTimeout(() => {
          onSuccess(staffPayload);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi galat saat memproses permohonan staff.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="auth-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        id="auth-modal-card"
        className="relative w-full max-w-2xl bg-[#0B1220] border border-white/15 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1FA35A] to-[#1E6FE0] flex items-center justify-center text-white shadow-md shadow-[#1FA35A]/20 shrink-0">
              {activeTab === 'login' && <Lock className="w-5 h-5 text-white" />}
              {activeTab === 'register_tenant' && <Building2 className="w-5 h-5 text-white" />}
              {activeTab === 'join_staff' && <KeyRound className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {activeTab === 'login' && 'Masuk ke Orchestree.AI'}
                {activeTab === 'register_tenant' && 'Registrasi Perusahaan Baru'}
                {activeTab === 'join_staff' && 'Gabung Tim dengan Kode Perusahaan'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeTab === 'login' && 'Akses ruang kerja otonom AI Workforce dengan kredensial terverifikasi'}
                {activeTab === 'register_tenant' && 'Buat tenant organisasi dan aktifkan sistem operasi tenaga kerja AI'}
                {activeTab === 'join_staff' && 'Masukkan kode akses yang diberikan oleh HR atau admin perusahaan Anda'}
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-auth-modal-btn"
            onClick={onClose}
            aria-label="Tutup jendela autentikasi"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Switcher */}
        <div className="px-6 pt-4 pb-2 bg-[#0B1220] border-b border-white/10">
          <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-semibold">
            <button
              type="button"
              id="tab-auth-login"
              onClick={() => {
                setActiveTab('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'login'
                  ? 'bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Masuk</span>
            </button>

            <button
              type="button"
              id="tab-auth-register-tenant"
              onClick={() => {
                setActiveTab('register_tenant');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'register_tenant'
                  ? 'bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Daftar Tenant</span>
            </button>

            <button
              type="button"
              id="tab-auth-join-staff"
              onClick={() => {
                setActiveTab('join_staff');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'join_staff'
                  ? 'bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Staff via Kode</span>
            </button>
          </div>
        </div>

        {/* Modal Body / Form Container */}
        <div className="p-6 overflow-y-auto space-y-4 text-slate-200">
          {/* Status Banners */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <div className="leading-relaxed font-medium">{successMessage}</div>
            </div>
          )}

          {/* TAB 1: MASUK (LOGIN) */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Role Toggle for Login */}
              <div className="flex items-center justify-between p-1 bg-white/5 rounded-xl border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setLoginSubRole('owner')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-center font-medium transition-all cursor-pointer ${
                    loginSubRole === 'owner'
                      ? 'bg-white/15 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pemilik / Admin Tenant
                </button>
                <button
                  type="button"
                  onClick={() => setLoginSubRole('staff')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-center font-medium transition-all cursor-pointer ${
                    loginSubRole === 'staff'
                      ? 'bg-white/15 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Staff Organisasi (Kode Akses)
                </button>
              </div>

              {loginSubRole === 'staff' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Kode Akses Perusahaan (Company Code) *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      id="login-company-code-input"
                      value={loginCompanyCode}
                      onChange={(e) => setLoginCompanyCode(e.target.value.toUpperCase())}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#34D399] transition-all"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Bisnis / Akun Terdaftar *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    id="login-identifier-input"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399] transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Kata Sandi *
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Sandi Supabase / JWT Terverifikasi
                  </span>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    id="login-password-input"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399] transition-all"
                    required
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="submit-login-btn"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white font-bold text-xs shadow-md shadow-[#1FA35A]/25 hover:shadow-[#1FA35A]/40 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Memverifikasi Sesi...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Ruang Kerja</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: DAFTAR TENANT BARU */}
          {activeTab === 'register_tenant' && (
            <form onSubmit={handleRegisterTenantSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Legal Perusahaan *
                  </label>
                  <input
                    type="text"
                    id="register-legal-name-input"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Merek / Display Name *
                  </label>
                  <input
                    type="text"
                    id="register-display-name-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Pimpinan / Direktur *
                  </label>
                  <input
                    type="text"
                    id="register-owner-name-input"
                    value={ownerFullName}
                    onChange={(e) => setOwnerFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email Bisnis Resmi *
                  </label>
                  <input
                    type="email"
                    id="register-owner-email-input"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Pilih Paket Layanan Awal *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(plans.length > 0
                    ? plans
                    : [
                        { plan_code: 'FREE_TRIAL', display_name: 'Free Trial', price_monthly: '0' },
                        { plan_code: 'STARTER', display_name: 'Standar Operasional', price_monthly: '990000' },
                        { plan_code: 'PRO', display_name: 'Professional Autonomous', price_monthly: '1999000' },
                      ]
                  ).map((plan) => (
                    <button
                      key={plan.plan_code}
                      type="button"
                      onClick={() => setSelectedPlanCode(plan.plan_code)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                        selectedPlanCode === plan.plan_code
                          ? 'border-[#34D399] bg-[#34D399]/15 text-white shadow-sm'
                          : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <span className="font-bold block text-white">{plan.display_name}</span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {plan.price_monthly === '0' || plan.price_monthly === '0.00'
                          ? 'Gratis 14 Hari'
                          : `Rp ${Number(plan.price_monthly).toLocaleString('id-ID')}/bln`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-300 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#34D399] shrink-0" />
                <span>
                  Tenant Anda akan otomatis dilindungi oleh Row Level Security (RLS) terisolasi penuh di Supabase PostgreSQL.
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="submit-register-tenant-btn"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white font-bold text-xs shadow-md shadow-[#1FA35A]/25 hover:shadow-[#1FA35A]/40 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Mendaftarkan Tenant Baru ke Supabase...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-white" />
                    <span>Daftarkan Perusahaan & Buka Sistem</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 3: GABUNG STAFF VIA KODE */}
          {activeTab === 'join_staff' && (
            <form onSubmit={handleJoinStaffSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kode Akses Perusahaan (Company Code) *
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      id="staff-company-code-input"
                      value={staffCompanyCode}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setStaffCompanyCode(val);
                        if (val.length >= 4) {
                          handleVerifyCode(val);
                        } else {
                          setCodeVerification({ status: 'idle' });
                        }
                      }}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs font-mono tracking-wider focus:outline-none focus:border-[#34D399]"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleVerifyCode(staffCompanyCode)}
                    disabled={codeVerification.status === 'checking' || !staffCompanyCode.trim()}
                    className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-40"
                  >
                    {codeVerification.status === 'checking' ? 'Mengecek...' : 'Cek Kode'}
                  </button>
                </div>

                {/* Verification Status Badge */}
                {codeVerification.status === 'valid' && (
                  <div className="mt-2 p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-semibold">
                      Perusahaan Terverifikasi: {codeVerification.companyName}
                    </span>
                  </div>
                )}
                {codeVerification.status === 'invalid' && (
                  <div className="mt-2 p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{codeVerification.message}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Lengkap Staff *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    id="staff-full-name-input"
                    value={staffFullName}
                    onChange={(e) => setStaffFullName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email Kerja Resmi *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      id="staff-email-input"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399]"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Departemen / Posisi
                  </label>
                  <input
                    type="text"
                    id="staff-department-input"
                    value={staffDepartment}
                    onChange={(e) => setStaffDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#34D399]"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-300 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#60A5FA] shrink-0" />
                <span>
                  Pendaftaran staff akan diteruskan ke antrian persetujuan HR/Admin perusahaan terkait.
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="submit-join-staff-btn"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white font-bold text-xs shadow-md shadow-[#1FA35A]/25 hover:shadow-[#1FA35A]/40 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Memproses Permohonan Staff...</span>
                  </>
                ) : (
                  <>
                    <span>Kirim Pendaftaran Staff</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Bottom helper: Switch to full wizard if needed */}
          {onOpenFullWizard && (
            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
              <span>Membutuhkan panduan konfigurasi menyeluruh?</span>
              <button
                type="button"
                id="open-full-wizard-link"
                onClick={() => {
                  onClose();
                  onOpenFullWizard();
                }}
                className="text-[#34D399] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <span>Buka Wizard Onboarding Penuh</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
