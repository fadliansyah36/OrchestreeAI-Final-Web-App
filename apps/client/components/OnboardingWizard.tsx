import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  KeyRound,
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Shield,
  ArrowRight,
  UserCheck,
  Briefcase,
  AlertCircle
} from 'lucide-react';
import {
  TenantRegistrationResponse,
  JoinCompanyResponse,
  CompanyCodeResponse,
  HRApprovalItem,
  TenantMemberItem
} from '@/apps/client/types';

interface OnboardingWizardProps {
  initialPlanCode?: string;
  onEnterDashboard?: (tenant: TenantRegistrationResponse) => void;
  onBackToLanding?: () => void;
}

export function OnboardingWizard({
  initialPlanCode = 'FREE_TRIAL',
  onEnterDashboard,
  onBackToLanding,
}: OnboardingWizardProps = {}) {
  const [selectedPlanCode, setSelectedPlanCode] = useState(initialPlanCode);
  const [currentStep, setCurrentStep] = useState<'choose_flow' | 'create_tenant' | 'join_company' | 'tenant_active'>('choose_flow');
  const [activeTab, setActiveTab] = useState<'overview' | 'codes' | 'hr_queue' | 'members'>('overview');

  // Form states - Create Tenant
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  // Form states - Join Company
  const [joinCompanyCode, setJoinCompanyCode] = useState('');
  const [joinFullName, setJoinFullName] = useState('');
  const [joinEmail, setJoinEmail] = useState('');

  // Active Tenant Context
  const [activeTenant, setActiveTenant] = useState<TenantRegistrationResponse | null>(() => {
    const saved = localStorage.getItem('orchestree_active_tenant');
    return saved ? JSON.parse(saved) : null;
  });

  // Join status state
  const [joinResult, setJoinResult] = useState<JoinCompanyResponse | null>(null);

  // Company Codes & HR Queue & Members
  const [companyCodes, setCompanyCodes] = useState<CompanyCodeResponse[]>([]);
  const [hrQueue, setHrQueue] = useState<HRApprovalItem[]>([]);
  const [members, setMembers] = useState<TenantMemberItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (activeTenant?.tenant_id) {
      setCurrentStep('tenant_active');
      fetchTenantData(activeTenant.tenant_id);
    }
  }, [activeTenant?.tenant_id]);

  const fetchTenantData = async (tenantId: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch HR Queue
      const queueRes = await fetch('/api/v1/onboarding/hr-approvals?status=all', {
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (queueRes.ok) {
        const qData = await queueRes.json();
        setHrQueue(qData);
      }

      // 2. Fetch Members
      const membersRes = await fetch(`/api/v1/tenants/${tenantId}/members`, {
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setMembers(mData);
      }
    } catch (err: any) {
      console.error('Gagal mengambil data tenant:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalName.trim() || !displayName.trim() || !ownerFullName.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Semua kolom wajib diisi secara lengkap.' });
      return;
    }

    setIsLoading(true);
    setFeedbackMessage(null);

    const generatedOwnerId = crypto.randomUUID();

    try {
      const response = await fetch('/api/v1/onboarding/tenants', {
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

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Pendaftaran perusahaan gagal diproses.');
      }

      setActiveTenant(data);
      localStorage.setItem('orchestree_active_tenant', JSON.stringify(data));
      setFeedbackMessage({ type: 'success', text: `Perusahaan ${data.display_name} berhasil didaftarkan!` });
      setCurrentStep('tenant_active');
      fetchTenantData(data.tenant_id);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCompanyCode.trim() || !joinFullName.trim() || !joinEmail.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Kode perusahaan, nama, dan email wajib diisi.' });
      return;
    }

    setIsLoading(true);
    setFeedbackMessage(null);

    const generatedUserId = crypto.randomUUID();

    try {
      const response = await fetch('/api/v1/onboarding/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_code: joinCompanyCode.trim().toUpperCase(),
          full_name: joinFullName.trim(),
          email: joinEmail.trim(),
          auth_user_id: generatedUserId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Pengajuan pendaftaran gagal.');
      }

      setJoinResult(data);
      setFeedbackMessage({ type: 'success', text: data.message });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    if (!activeTenant?.tenant_id) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/onboarding/company-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenant.tenant_id,
        },
        body: JSON.stringify({ expires_in_days: 14, max_uses: 25 }),
      });
      const data = await res.json();
      if (res.ok) {
        setCompanyCodes((prev) => [data, ...prev]);
        setFeedbackMessage({ type: 'success', text: `Kode baru dibuat: ${data.code}` });
      } else {
        throw new Error(data.error || 'Gagal membuat kode.');
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewHR = async (queueId: string, decision: 'approved' | 'rejected') => {
    if (!activeTenant?.tenant_id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/onboarding/hr-approvals/${queueId}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenant.tenant_id,
        },
        body: JSON.stringify({
          decision,
          reason: decision === 'approved' ? 'Disetujui oleh Owner' : 'Tidak memenuhi kualifikasi unit kerja',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage({ type: 'success', text: data.message });
        fetchTenantData(activeTenant.tenant_id);
      } else {
        throw new Error(data.error || 'Review gagal.');
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleExitTenant = () => {
    localStorage.removeItem('orchestree_active_tenant');
    setActiveTenant(null);
    setCompanyCodes([]);
    setHrQueue([]);
    setMembers([]);
    setCurrentStep('choose_flow');
  };

  return (
    <div id="onboarding-wizard-container" className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Banner Notifikasi Feedback */}
      {feedbackMessage && (
        <div
          id="onboarding-feedback-alert"
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Alur 1: Pemilihan Model Masuk */}
      {currentStep === 'choose_flow' && (
        <div id="onboarding-choose-view" className="py-6 space-y-8 text-center max-w-3xl mx-auto">
          {onBackToLanding && (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={onBackToLanding}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
              >
                ← Kembali ke Halaman Utama
              </button>
            </div>
          )}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mb-3">
              <Shield className="w-3.5 h-3.5" />
              <span>Sistem Akses Multi-Tenant Aman</span>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Selamat Datang di Orchestree.AI
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Silakan pilih opsi untuk mendirikan organisasi baru atau bergabung ke tim kerja yang telah terdaftar.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {/* Opsi A: Buat Perusahaan Baru */}
            <div
              id="card-choose-create-tenant"
              onClick={() => setCurrentStep('create_tenant')}
              className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-emerald-500/50 hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Buat Perusahaan Baru
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Daftarkan entitas bisnis baru. Anda otomatis ditetapkan sebagai Pemilik Organisasi dengan hak penuh mengelola tim, kode akses, dan persetujuan staf.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform">
                <span>Mulai Pendaftaran Perusahaan</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Opsi B: Gabung dengan Kode Perusahaan */}
            <div
              id="card-choose-join-tenant"
              onClick={() => setCurrentStep('join_company')}
              className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-sky-500/50 hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Gabung dengan Kode Perusahaan
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Sudah memiliki kode 8 karakter dari administrator tim Anda? Masukkan kode untuk mengajukan pendaftaran staf dan menunggu verifikasi HR.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-sky-600 dark:text-sky-400 group-hover:translate-x-1 transition-transform">
                <span>Masukkan Kode Perusahaan</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alur 2: Formulir Buat Perusahaan Baru */}
      {currentStep === 'create_tenant' && (
        <div id="onboarding-create-tenant-form-view" className="max-w-xl mx-auto py-4">
          <button
            type="button"
            onClick={() => setCurrentStep('choose_flow')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white mb-4 flex items-center gap-1.5"
          >
            ← Kembali ke Pemilihan Opsi
          </button>

          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-500" />
                Pendaftaran Perusahaan Baru
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Data akan langsung dicatat ke dalam database terisolasi dengan penegakan keamanan tingkat baris.
              </p>
            </div>

            <form onSubmit={handleRegisterTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Badan Hukum Perusahaan (Legal Name)
                </label>
                <input
                  type="text"
                  id="input-legal-name"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Contoh: PT Sumber Daya Digital Nusantara</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Tampilan Organisasi (Display Name)
                </label>
                <input
                  type="text"
                  id="input-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Contoh: Digital Nusantara</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Lengkap Pemilik
                  </label>
                  <input
                    type="text"
                    id="input-owner-name"
                    value={ownerFullName}
                    onChange={(e) => setOwnerFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Kontak Utama
                  </label>
                  <input
                    type="email"
                    id="input-owner-email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  id="btn-submit-register-tenant"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Konfirmasi & Buat Organisasi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alur 3: Formulir Gabung dengan Kode Perusahaan */}
      {currentStep === 'join_company' && (
        <div id="onboarding-join-company-view" className="max-w-xl mx-auto py-4">
          <button
            type="button"
            onClick={() => setCurrentStep('choose_flow')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white mb-4 flex items-center gap-1.5"
          >
            ← Kembali ke Pemilihan Opsi
          </button>

          {!joinResult ? (
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-sky-500" />
                  Gabung dengan Kode Organisasi
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Masukkan kode akses 8 karakter yang diberikan oleh pengelola organisasi Anda.
                </p>
              </div>

              <form onSubmit={handleJoinCompany} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kode Akses Perusahaan (8 Karakter)
                  </label>
                  <input
                    type="text"
                    id="input-company-code"
                    maxLength={8}
                    value={joinCompanyCode}
                    onChange={(e) => setJoinCompanyCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-base font-mono font-bold tracking-widest text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Format: 8 digit alfanumerik Base32</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Lengkap Anda
                  </label>
                  <input
                    type="text"
                    id="input-join-fullname"
                    value={joinFullName}
                    onChange={(e) => setJoinFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Alamat Email Kerja
                  </label>
                  <input
                    type="email"
                    id="input-join-email"
                    value={joinEmail}
                    onChange={(e) => setJoinEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    id="btn-submit-join-company"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    <span>Kirim Pengajuan Masuk</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Tampilan Status Nyata Antrean HR */
            <div id="join-pending-status-card" className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Status: Menunggu Persetujuan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ID Antrean Resmi: <span className="font-mono text-xs">{joinResult.queue_id}</span>
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama Terdaftar:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{joinFullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{joinEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pemberitahuan:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Dalam peninjauan Pengelola Organisasi</span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Pengajuan Anda telah tercatat pada basis data operasional. Setelah disetujui, akun Anda otomatis aktif dengan peran staf standar.
              </p>

              <button
                type="button"
                onClick={() => {
                  setJoinResult(null);
                  setCurrentStep('choose_flow');
                }}
                className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Kembali ke Beranda
              </button>
            </div>
          )}
        </div>
      )}

      {/* Alur 4: Dasbor Pengelolaan Organisasi Aktif (Sebagai Owner) */}
      {currentStep === 'tenant_active' && activeTenant && (
        <div id="onboarding-tenant-active-workspace" className="space-y-6">
          {/* Header Identitas Tenant */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xl">
                {activeTenant.display_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {activeTenant.display_name}
                  </h2>
                  <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {activeTenant.role}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ID Organisasi: <span className="font-mono">{activeTenant.tenant_id}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onEnterDashboard && (
                <button
                  type="button"
                  onClick={() => onEnterDashboard(activeTenant)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 hover:opacity-95 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Buka Feature Hub Tenant</span>
                </button>
              )}

              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Halaman Utama
                </button>
              )}

              <button
                type="button"
                onClick={() => fetchTenantData(activeTenant.tenant_id)}
                disabled={isLoading}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Segarkan Data</span>
              </button>

              <button
                type="button"
                onClick={handleExitTenant}
                className="px-3 py-2 rounded-xl border border-red-500/20 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                Ganti Organisasi
              </button>
            </div>
          </div>

          {/* Navigasi Tab Pengelolaan */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button
              type="button"
              id="tab-btn-overview"
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Ringkasan Organisasi
            </button>
            <button
              type="button"
              id="tab-btn-codes"
              onClick={() => setActiveTab('codes')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'codes'
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Kode Undangan Perusahaan
            </button>
            <button
              type="button"
              id="tab-btn-queue"
              onClick={() => setActiveTab('hr_queue')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'hr_queue'
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Antrean Persetujuan HR</span>
              {hrQueue.filter((q) => q.status === 'pending').length > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {hrQueue.filter((q) => q.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              type="button"
              id="tab-btn-members"
              onClick={() => setActiveTab('members')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'members'
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Daftar Anggota Tim ({members.length})
            </button>
          </div>

          {/* Konten Tab 1: Ringkasan */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1">
                <span className="text-xs font-medium text-slate-500">Anggota Aktif</span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{members.length}</div>
                <span className="text-[11px] text-emerald-500">Terdaftar di basis data terisolasi</span>
              </div>
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1">
                <span className="text-xs font-medium text-slate-500">Antrean Verifikasi Pending</span>
                <div className="text-2xl font-bold text-amber-500">
                  {hrQueue.filter((q) => q.status === 'pending').length}
                </div>
                <span className="text-[11px] text-slate-400">Menunggu review Administrator</span>
              </div>
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1">
                <span className="text-xs font-medium text-slate-500">Status Langganan</span>
                <div className="text-2xl font-bold text-emerald-500 uppercase">{activeTenant.status}</div>
                <span className="text-[11px] text-slate-400">Tingkat paket operasional</span>
              </div>
            </div>
          )}

          {/* Konten Tab 2: Generator & Daftar Kode Perusahaan */}
          {activeTab === 'codes' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Buat Kode Undangan Baru
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Menghasilkan kode unik 8 karakter aman secara acak kriptografis (CSPRNG).
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-generate-company-code"
                  onClick={handleGenerateCode}
                  disabled={isLoading}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Kode 8 Karakter</span>
                </button>
              </div>

              {companyCodes.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30">
                  <KeyRound className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Belum Ada Kode Undangan yang Dihasilkan pada Sesi Ini
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Klik tombol di atas untuk membuat kode akses pertama Anda.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {companyCodes.map((codeItem) => (
                    <div
                      key={codeItem.code}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-mono font-bold text-sm">
                          #
                        </div>
                        <div>
                          <div className="text-base font-mono font-extrabold tracking-wider text-slate-900 dark:text-white">
                            {codeItem.code}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Kedaluwarsa: {new Date(codeItem.expires_at).toLocaleDateString()} • Maksimal {codeItem.max_uses || 'Tak Terbatas'} Penggunaan
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(codeItem.code)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
                      >
                        {copiedCode === codeItem.code ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-500">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin Kode</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Konten Tab 3: Antrean Persetujuan HR */}
          {activeTab === 'hr_queue' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Pendaftaran baru memerlukan verifikasi Administrator sebelum mendapatkan akses ke lingkungan kerja.
              </div>

              {hrQueue.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30">
                  <UserCheck className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Tidak Ada Permintaan Pendaftaran Tertunda
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Saat calon staf mendaftar melalui kode perusahaan, datanya akan tampil di sini.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
                  {hrQueue.map((item) => (
                    <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {item.submitted_profile?.full_name || 'Calon Anggota'}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                              item.status === 'pending'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                : item.status === 'approved'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                            }`}
                          >
                            {item.status === 'pending'
                              ? 'Menunggu Review'
                              : item.status === 'approved'
                              ? 'Disetujui'
                              : 'Ditolak'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Email: {item.submitted_profile?.email || '-'} • Diajukan: {new Date(item.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {item.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleReviewHR(item.id, 'approved')}
                            disabled={isLoading}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center gap-1 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Setujui</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewHR(item.id, 'rejected')}
                            disabled={isLoading}
                            className="px-3 py-1.5 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Tolak</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Diproses pada {item.reviewed_at ? new Date(item.reviewed_at).toLocaleDateString() : '-'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Konten Tab 4: Anggota Tim */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                {members.map((m) => (
                  <div key={m.membership_id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300">
                        {m.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {m.full_name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {m.role_description} • Status: <span className="text-emerald-500 font-medium">{m.status}</span>
                        </div>
                      </div>
                    </div>

                    <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
