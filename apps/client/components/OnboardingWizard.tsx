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
  ArrowLeft,
  UserCheck,
  Briefcase,
  AlertCircle,
  Sparkles,
  Database,
  BrainCircuit,
  CreditCard,
  Zap,
  HelpCircle,
  CheckSquare,
  Radio,
  FileText,
  Lock,
  ExternalLink,
} from 'lucide-react';
import {
  TenantRegistrationResponse,
  JoinCompanyResponse,
  CompanyCodeResponse,
  HRApprovalItem,
  TenantMemberItem,
  PersonaQuestionItem,
  PersonaSessionResponse,
  SubmitPersonaAnswerResponse,
  CompletePersonaSessionResponse,
  PaidPlanCheckoutResponse,
} from '@/apps/client/types';

interface OnboardingWizardProps {
  initialPlanCode?: string;
  onEnterDashboard?: (tenant: TenantRegistrationResponse) => void;
  onBackToLanding?: () => void;
}

export type OnboardingStep =
  | 'choose_flow'
  | 'create_tenant'
  | 'join_company'
  | 'persona_onboarding'
  | 'company_brain_synthesis'
  | 'pricing_checkout'
  | 'tenant_active';

export function OnboardingWizard({
  initialPlanCode = 'FREE_TRIAL',
  onEnterDashboard,
  onBackToLanding,
}: OnboardingWizardProps = {}) {
  const [selectedPlanCode, setSelectedPlanCode] = useState(initialPlanCode);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('choose_flow');
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

  // Persona Onboarding States
  const [personaSession, setPersonaSession] = useState<PersonaSessionResponse | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentAnswer, setCurrentAnswer] = useState<any>('');
  const [clarificationPrompt, setClarificationPrompt] = useState<string | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState<string>('');
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [synthesisResult, setSynthesisResult] = useState<CompletePersonaSessionResponse | null>(null);

  // Paid Plan / Checkout States
  const [checkoutPending, setCheckoutPending] = useState<PaidPlanCheckoutResponse | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<boolean>(false);

  // Company Codes & HR Queue & Members
  const [companyCodes, setCompanyCodes] = useState<CompanyCodeResponse[]>([]);
  const [hrQueue, setHrQueue] = useState<HRApprovalItem[]>([]);
  const [members, setMembers] = useState<TenantMemberItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Check initial active tenant
  useEffect(() => {
    if (activeTenant?.tenant_id) {
      if (activeTenant.status === 'active') {
        setCurrentStep('tenant_active');
        fetchTenantData(activeTenant.tenant_id);
      } else {
        // Resume persona session if not yet completed
        checkAndResumePersona(activeTenant.tenant_id);
      }
    }
  }, [activeTenant?.tenant_id]);

  const checkAndResumePersona = async (tenantId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/onboarding/persona/session?tenant_id=${tenantId}`, {
        headers: {
          'X-Tenant-Id': tenantId,
        },
      });
      if (res.ok) {
        const data: PersonaSessionResponse = await res.json();
        setPersonaSession(data);
        setAnswers(data.responses || {});
        if (data.status === 'completed') {
          setCurrentStep('pricing_checkout');
        } else {
          setCurrentStep('persona_onboarding');
          const idx = Math.min(data.current_question_index || 0, Math.max(0, data.questions.length - 1));
          setCurrentQuestionIndex(idx);
          const currentQ = data.questions[idx];
          if (currentQ && data.responses && data.responses[currentQ.id]) {
            setCurrentAnswer(data.responses[currentQ.id]);
          }
        }
      } else {
        setCurrentStep('tenant_active');
        fetchTenantData(tenantId);
      }
    } catch {
      setCurrentStep('tenant_active');
      fetchTenantData(tenantId);
    } finally {
      setIsLoading(false);
    }
  };

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

  // STEP 1: Registrasi Tenant Baru
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

      const data: TenantRegistrationResponse = await response.json();
      if (!response.ok) {
        throw new Error((data as any).error || 'Pendaftaran perusahaan gagal diproses.');
      }

      setActiveTenant(data);
      localStorage.setItem('orchestree_active_tenant', JSON.stringify(data));
      setFeedbackMessage({
        type: 'success',
        text: `Organisasi ${data.display_name} berhasil didaftarkan! Melanjutkan ke Kuesioner Persona...`,
      });

      // Fetch initial persona questions and session
      await checkAndResumePersona(data.tenant_id);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
      setIsLoading(false);
    }
  };

  // STEP 2: Submit Jawaban Persona
  const handleSaveQuestionResponse = async (skipClarification: boolean = false) => {
    if (!personaSession || !activeTenant) return;
    const currentQ = personaSession.questions[currentQuestionIndex];
    if (!currentQ) return;

    // Validasi jawaban jika pertanyaan wajib
    if (currentQ.is_required) {
      if (currentQ.question_type === 'multi_choice') {
        if (!Array.isArray(currentAnswer) || currentAnswer.length === 0) {
          setFeedbackMessage({ type: 'error', text: 'Pertanyaan ini wajib dijawab. Pilih minimal satu opsi.' });
          return;
        }
      } else {
        if (!currentAnswer || String(currentAnswer).trim() === '') {
          setFeedbackMessage({ type: 'error', text: 'Pertanyaan ini wajib diisi sebelum melanjutkan.' });
          return;
        }
      }
    }

    setIsLoading(true);
    setFeedbackMessage(null);

    try {
      const nextIdx = currentQuestionIndex + 1;
      const res = await fetch('/api/v1/onboarding/persona/response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenant.tenant_id,
        },
        body: JSON.stringify({
          session_id: personaSession.session_id,
          question_id: currentQ.id,
          answer_value: currentAnswer,
          next_index: nextIdx,
          skip_clarification: skipClarification,
        }),
      });

      const data: SubmitPersonaAnswerResponse = await res.json();
      if (!res.ok) {
        throw new Error((data as any).detail || 'Gagal menyimpan jawaban persona.');
      }

      // Simpan jawaban lokal
      setAnswers((prev) => ({ ...prev, [currentQ.id]: currentAnswer }));

      // Cek apakah butuh klarifikasi esai (Node 2)
      if (data.clarification_needed && data.clarification_question && !skipClarification) {
        setClarificationPrompt(data.clarification_question);
        setClarificationAnswer('');
        setIsLoading(false);
        return;
      }

      // Reset klarifikasi jika ada
      setClarificationPrompt(null);
      setClarificationAnswer('');

      // Cek apakah sudah di pertanyaan terakhir
      if (nextIdx >= personaSession.questions.length) {
        // Melanjutkan ke grounding Company Brain
        handleTriggerCompanyBrainSynthesis(personaSession.session_id);
      } else {
        setCurrentQuestionIndex(nextIdx);
        const nextQ = personaSession.questions[nextIdx];
        if (nextQ && answers[nextQ.id] !== undefined) {
          setCurrentAnswer(answers[nextQ.id]);
        } else {
          setCurrentAnswer(nextQ.question_type === 'multi_choice' ? [] : '');
        }
        setIsLoading(false);
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
      setIsLoading(false);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0 && personaSession) {
      const prevIdx = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prevIdx);
      const prevQ = personaSession.questions[prevIdx];
      if (prevQ && answers[prevQ.id] !== undefined) {
        setCurrentAnswer(answers[prevQ.id]);
      } else {
        setCurrentAnswer(prevQ.question_type === 'multi_choice' ? [] : '');
      }
      setClarificationPrompt(null);
      setFeedbackMessage(null);
    }
  };

  // STEP 3: Company Brain Grounding Synthesis
  const handleTriggerCompanyBrainSynthesis = async (sessionId: string) => {
    if (!activeTenant) return;
    setCurrentStep('company_brain_synthesis');
    setIsSynthesizing(true);
    setFeedbackMessage(null);

    try {
      const res = await fetch('/api/v1/onboarding/persona/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenant.tenant_id,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data: CompletePersonaSessionResponse = await res.json();
      if (!res.ok) {
        throw new Error((data as any).detail || 'Gagal menyintesis Company Brain.');
      }

      setSynthesisResult(data);
      setFeedbackMessage({
        type: 'success',
        text: 'Profil persona organisasi berhasil diintegrasikan ke Company Brain!',
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Sintesis Company Brain mengalami kendala: ${err.message}. Data Anda tetap aman.`,
      });
    } finally {
      setIsSynthesizing(false);
    }
  };

  // STEP 4A: Aktivasi Uji Coba Gratis 14 Hari
  const handleActivateTrial = async () => {
    if (!activeTenant) return;
    setCheckoutLoading(true);
    setFeedbackMessage(null);

    try {
      const res = await fetch('/api/v1/onboarding/checkout/trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenant.tenant_id,
        },
        body: JSON.stringify({ tenant_id: activeTenant.tenant_id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Aktivasi uji coba gratis gagal diproses.');
      }

      // Update tenant status menjadi active
      const updatedTenant: TenantRegistrationResponse = {
        ...activeTenant,
        status: 'active',
      };
      setActiveTenant(updatedTenant);
      localStorage.setItem('orchestree_active_tenant', JSON.stringify(updatedTenant));

      setFeedbackMessage({
        type: 'success',
        text: 'Selamat! Uji coba gratis 14 hari dengan 100 Saldo Kredit AI telah aktif.',
      });

      setCurrentStep('tenant_active');
      fetchTenantData(activeTenant.tenant_id);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setCheckoutLoading(false);
    }
  };

  // STEP 4B: Checkout Paket Berbayar (Midtrans)
  const handlePaidPlanCheckout = async (planCode: string) => {
    if (!activeTenant) return;
    setCheckoutLoading(true);
    setFeedbackMessage(null);

    try {
      const res = await fetch('/api/v1/onboarding/checkout/paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenant.tenant_id,
        },
        body: JSON.stringify({
          plan_code: planCode,
          payment_gateway: 'midtrans',
          tenant_id: activeTenant.tenant_id,
        }),
      });

      const data: PaidPlanCheckoutResponse = await res.json();
      if (!res.ok) {
        throw new Error((data as any).detail || 'Gagal membuat tagihan pembayaran paket.');
      }

      setCheckoutPending(data);
      setFeedbackMessage({
        type: 'success',
        text: `Faktur tagihan ${data.invoice_number} berhasil dibuat. Silakan selesaikan pembayaran melalui portal Midtrans.`,
      });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Periksa status pembayaran faktur nyata ke backend
  const handleCheckPaymentStatus = async () => {
    if (!activeTenant || !checkoutPending) return;
    setCheckoutLoading(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch(`/api/v1/billing/invoices?tenant_id=${activeTenant.tenant_id}`, {
        headers: { 'X-Tenant-Id': activeTenant.tenant_id },
      });
      if (res.ok) {
        const invoices = await res.json();
        const currentInv = Array.isArray(invoices)
          ? invoices.find((inv: any) => inv.id === checkoutPending.invoice_id || inv.invoice_number === checkoutPending.invoice_number)
          : null;
        if (currentInv && (currentInv.status === 'paid' || currentInv.status === 'settled')) {
          await fetchTenantData(activeTenant.tenant_id);
          setCheckoutPending(null);
          setCurrentStep('tenant_active');
          setFeedbackMessage({
            type: 'success',
            text: 'Pembayaran langganan terkonfirmasi oleh sistem! Layanan organisasi Anda kini aktif sepenuhnya.',
          });
        } else {
          setFeedbackMessage({
            type: 'info',
            text: 'Status pembayaran belum terkonfirmasi oleh gateway. Silakan selesaikan transaksi pada portal pembayaran atau periksa kembali sesaat lagi.',
          });
        }
      } else {
        setFeedbackMessage({ type: 'error', text: 'Gagal memverifikasi status pembayaran ke server.' });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Gagal memeriksa status pembayaran terkini.' });
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Gabung Perusahaan via Kode (Staf)
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
    setPersonaSession(null);
    setCompanyCodes([]);
    setHrQueue([]);
    setMembers([]);
    setCurrentStep('choose_flow');
  };

  const currentQuestion = personaSession?.questions?.[currentQuestionIndex];
  const progressPercent = personaSession?.questions?.length
    ? Math.round(((currentQuestionIndex + 1) / personaSession.questions.length) * 100)
    : 0;

  return (
    <div id="onboarding-wizard-container" className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Banner Notifikasi Feedback */}
      {feedbackMessage && (
        <div
          id="onboarding-feedback-alert"
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs md:text-sm ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
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

      {/* ========================================================================= */}
      {/* 1. PEMILIHAN JALUR MASUK (CHOOSE FLOW)                                     */}
      {/* ========================================================================= */}
      {currentStep === 'choose_flow' && (
        <div id="onboarding-choose-view" className="py-6 space-y-8 text-center max-w-3xl mx-auto">
          {onBackToLanding && (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={onBackToLanding}
                className="text-xs font-semibold text-slate-500 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
              >
                ← Kembali ke Halaman Utama
              </button>
            </div>
          )}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
              <Shield className="w-3.5 h-3.5" />
              <span>Sistem Multi-Tenant Terisolasi & RLS Nyata</span>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white">
              Selamat Datang di Orchestree.AI
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-xl mx-auto">
              Daftarkan entitas bisnis baru atau ajukan pendaftaran staf ke dalam organisasi kerja yang sudah terdaftar.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {/* Opsi A: Buat Organisasi Baru */}
            <div
              id="card-choose-create-tenant"
              onClick={() => setCurrentStep('create_tenant')}
              className="p-6 rounded-2xl border border-slate-800 bg-[#0B1220] hover:border-emerald-500/50 hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Buat Organisasi Baru</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Daftarkan entitas bisnis baru. Anda otomatis disematkan sebagai Pemilik Organisasi dengan hak penuh mengelola kuesioner profil, Company Brain, paket langganan, dan tim kerja.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition-transform">
                <span>Mulai Pendaftaran Organisasi</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Opsi B: Gabung dengan Kode Perusahaan */}
            <div
              id="card-choose-join-tenant"
              onClick={() => setCurrentStep('join_company')}
              className="p-6 rounded-2xl border border-slate-800 bg-[#0B1220] hover:border-sky-500/50 hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Gabung via Kode Organisasi</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Sudah memiliki kode akses 8 karakter dari administrator organisasi Anda? Masukkan kode untuk mengajukan pendaftaran staf dan menunggu verifikasi HR resmi.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-sky-400 group-hover:translate-x-1 transition-transform">
                <span>Masukkan Kode Akses</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FORMULIR PENDAFTARAN TENANT BARU                                       */}
      {/* ========================================================================= */}
      {currentStep === 'create_tenant' && (
        <div id="onboarding-create-tenant-form-view" className="max-w-xl mx-auto py-4">
          <button
            type="button"
            onClick={() => setCurrentStep('choose_flow')}
            className="text-xs font-semibold text-slate-500 hover:text-white mb-4 flex items-center gap-1.5"
          >
            ← Kembali ke Pemilihan Opsi
          </button>

          <div className="p-6 rounded-2xl border border-slate-800 bg-[#0B1220] shadow-xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span>Pendaftaran Entitas Organisasi Baru</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Data akan langsung dicatat ke dalam database terisolasi dengan penegakan keamanan tingkat baris.
              </p>
            </div>

            <form onSubmit={handleRegisterTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Badan Hukum Perusahaan (Legal Name)
                </label>
                <input
                  type="text"
                  id="input-legal-name"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  aria-label="Nama Legal Perusahaan"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Tampilan Organisasi (Brand Name)
                </label>
                <input
                  type="text"
                  id="input-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  aria-label="Nama Tampilan Organisasi"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Lengkap Pemilik
                  </label>
                  <input
                    type="text"
                    id="input-owner-name"
                    value={ownerFullName}
                    onChange={(e) => setOwnerFullName(e.target.value)}
                    aria-label="Nama Lengkap Pemilik"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email Kontak Utama
                  </label>
                  <input
                    type="email"
                    id="input-owner-email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    aria-label="Email Kontak Utama"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  id="btn-submit-register-tenant"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  <span>Konfirmasi & Mulai Kuesioner Persona</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. KUESIONER PERSONA INTERAKTIF (MODAL PILIHAN GANDA & ESAI)               */}
      {/* ========================================================================= */}
      {currentStep === 'persona_onboarding' && personaSession && currentQuestion && (
        <div id="onboarding-persona-view" className="max-w-2xl mx-auto py-4 space-y-6">
          {/* Header Progress Bar */}
          <div className="p-5 rounded-2xl bg-[#0B1220] border border-slate-800 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-xs">
              <span className="px-2.5 py-0.5 rounded-full font-semibold uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-800 tracking-wider text-[11px]">
                {currentQuestion.category.replace(/_/g, ' ')}
              </span>
              <span className="text-slate-400 font-mono">
                Pertanyaan {currentQuestionIndex + 1} dari {personaSession.questions.length} ({progressPercent}%)
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Interactive Question Card */}
          <div className="p-6 md:p-8 rounded-2xl bg-[#0B1220] border border-slate-800 space-y-6 shadow-2xl">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5 font-mono">
                <span>{currentQuestion.question_key}</span>
                {currentQuestion.is_required && (
                  <span className="text-rose-400 font-semibold">• Pertanyaan Wajib</span>
                )}
              </div>
              <h3 className="text-lg md:text-xl font-bold text-white leading-snug">
                {currentQuestion.question_text}
              </h3>
            </div>

            {/* Render Tipe Respon: single_choice */}
            {currentQuestion.question_type === 'single_choice' && currentQuestion.options && (
              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const isSelected = currentAnswer === opt.value;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => setCurrentAnswer(opt.value)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md shadow-emerald-950/30'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <span className="text-xs md:text-sm font-medium">{opt.label}</span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-emerald-400 bg-emerald-500' : 'border-slate-600'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Render Tipe Respon: multi_choice */}
            {currentQuestion.question_type === 'multi_choice' && currentQuestion.options && (
              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const selectedArr = Array.isArray(currentAnswer) ? currentAnswer : [];
                  const isChecked = selectedArr.includes(opt.value);
                  const toggleOption = () => {
                    if (isChecked) {
                      setCurrentAnswer(selectedArr.filter((v: string) => v !== opt.value));
                    } else {
                      setCurrentAnswer([...selectedArr, opt.value]);
                    }
                  };
                  return (
                    <div
                      key={opt.value}
                      onClick={toggleOption}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'bg-purple-950/40 border-purple-500 text-white shadow-md shadow-purple-950/30'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <span className="text-xs md:text-sm font-medium">{opt.label}</span>
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isChecked ? 'border-purple-400 bg-purple-500 text-white' : 'border-slate-600'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Render Tipe Respon: essay */}
            {currentQuestion.question_type === 'essay' && (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  aria-label="Uraian Jawaban Esai"
                  className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs md:text-sm text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Jawaban yang deskriptif meningkatkan akurasi kueri RAG autonomous agents.</span>
                  <span>{typeof currentAnswer === 'string' ? currentAnswer.length : 0} karakter</span>
                </div>
              </div>
            )}

            {/* Kotak Klarifikasi AI Adaptif (Node 2) */}
            {clarificationPrompt && (
              <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-950/20 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                  <Sparkles className="w-4 h-4" />
                  <span>Pendalaman AI Adaptif (Model Router)</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{clarificationPrompt}</p>
                <input
                  type="text"
                  value={clarificationAnswer}
                  onChange={(e) => setClarificationAnswer(e.target.value)}
                  aria-label="Penjelasan Klarifikasi"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-amber-900/60 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (clarificationAnswer.trim()) {
                        setCurrentAnswer((prev: string) => `${prev} (Klarifikasi: ${clarificationAnswer.trim()})`);
                      }
                      handleSaveQuestionResponse(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
                  >
                    Kirim & Lanjutkan
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveQuestionResponse(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white text-xs"
                  >
                    Lewati Klarifikasi
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handlePrevQuestion}
                disabled={currentQuestionIndex === 0 || isLoading}
                className="px-4 py-2.5 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Sebelumnya</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveQuestionResponse(false)}
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition shadow-lg shadow-emerald-950/40 disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : currentQuestionIndex === personaSession.questions.length - 1 ? (
                  <Sparkles className="w-4 h-4" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                <span>
                  {currentQuestionIndex === personaSession.questions.length - 1
                    ? 'Selesaikan & Grounding ke Company Brain'
                    : 'Simpan & Lanjutkan'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. GROUNDING COMPANY BRAIN & SINTESIS PENGETAHUAN                         */}
      {/* ========================================================================= */}
      {currentStep === 'company_brain_synthesis' && (
        <div id="onboarding-brain-synthesis-view" className="max-w-xl mx-auto py-6 space-y-6">
          <div className="p-8 rounded-2xl bg-[#0B1220] border border-slate-800 text-center space-y-6 shadow-2xl">
            {isSynthesizing ? (
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center animate-pulse">
                  <BrainCircuit className="w-8 h-8 animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-white">Menyintesis Profil Company Brain...</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Orchestration Engine sedang menjalankan <span className="font-mono text-emerald-400">memory.write_persona_profile</span>, membentuk vektor embedding 1536 dimensi, dan mencadangkan data ke ruang terisolasi <span className="font-mono text-sky-400">internal_only</span>.
                </p>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-left space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Jawaban kuesioner tervalidasi lengkap</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Biaya inferensi ditanggung platform (<span className="font-mono text-emerald-300">platform_cost</span> 0 kredit)</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                    <span>Membuat representasi semantik RAG PGVector HNSW</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white">Company Brain Berhasil Diaktifkan!</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Seluruh preferensi operasional, sasaran bisnis, dan nada komunikasi organisasi Anda telah dipelajari oleh Orchestration Engine untuk memandu seluruh autonomous agents.
                </p>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-left text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">ID Dokumen Otomatis:</span>
                    <span className="font-mono text-emerald-400">{synthesisResult?.document_id?.slice(0, 18) || 'doc-grounding'}...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Boundary Scope:</span>
                    <span className="font-mono text-sky-400">internal_only (confidential)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kesiapan RAG:</span>
                    <span className="text-emerald-400 font-semibold">100% Siap Operasional</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentStep('pricing_checkout')}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2"
                >
                  <span>Lanjut ke Pemilihan Paket & Aktivasi</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. PRICING & CHECKOUT (TRIAL / PAKET BERBAYAR VIA MIDTRANS)                */}
      {/* ========================================================================= */}
      {currentStep === 'pricing_checkout' && (
        <div id="onboarding-pricing-checkout-view" className="max-w-4xl mx-auto py-4 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-extrabold text-white">Pilih Paket Layanan Organisasi</h2>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              Mulai dengan uji coba gratis 14 hari atau pilih paket berbayar untuk kapasitas tim dan alokasi kredit yang lebih tinggi.
            </p>
          </div>

          {/* Kartu Pending Checkout Midtrans jika sedang aktif */}
          {checkoutPending && (
            <div className="p-5 rounded-2xl border border-sky-500/40 bg-sky-950/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Tagihan Menunggu Pembayaran</h4>
                    <p className="text-xs text-slate-400">
                      Faktur: <span className="font-mono text-sky-400">{checkoutPending.invoice_number}</span> • Rp {checkoutPending.amount.toLocaleString('id-ID')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckoutPending(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Ganti Paket
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <a
                  href={checkoutPending.payment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  <span>Buka Portal Pembayaran Midtrans</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={handleCheckPaymentStatus}
                  disabled={checkoutLoading}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-950/40 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkoutLoading ? 'animate-spin' : ''}`} />
                  <span>{checkoutLoading ? 'Memeriksa...' : 'Periksa Status Pembayaran'}</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Opsi 1: Uji Coba Gratis 14 Hari (Free Trial) */}
            <div className="p-6 rounded-2xl bg-[#0B1220] border-2 border-emerald-500/80 shadow-2xl relative flex flex-col justify-between">
              <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider shadow">
                Direkomendasikan
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Akses Penuh</span>
                  <h3 className="text-xl font-bold text-white mt-1">Uji Coba Gratis 14 Hari</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">Rp 0</span>
                    <span className="text-xs text-slate-500">/ 14 hari</span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>100 Saldo Kredit AI gratis langsung dicairkan</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Company Brain aktif dengan boundary terisolasi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Akses seluruh domain operasional & autonomous agents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Tanpa kewajiban kartu kredit di awal</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={handleActivateTrial}
                  disabled={checkoutLoading}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {checkoutLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  <span>Mulai Uji Coba Gratis (14 Hari)</span>
                </button>
              </div>
            </div>

            {/* Opsi 2: Paket Berbayar Profesional */}
            <div className="p-6 rounded-2xl bg-[#0B1220] border border-slate-800 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Kapasitas Maksimal</span>
                  <h3 className="text-xl font-bold text-white mt-1">Paket Profesional</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">Rp 499.000</span>
                    <span className="text-xs text-slate-500">/ bulan</span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>5.000 Saldo Kredit AI bulanan (NVIDIA NIM / Gemini)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Integrasi WhatsApp Omnichannel & MTProto</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Dukungan prioritas & automasi workflow tanpa batas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Pembayaran resmi via Midtrans (QRIS, VA, Kartu)</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => handlePaidPlanCheckout('PRO')}
                  disabled={checkoutLoading}
                  className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold text-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {checkoutLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  <span>Pilih & Bayar Langsung (Midtrans)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. GABUNG PERUSAHAAN (JOIN COMPANY STATUS)                                 */}
      {/* ========================================================================= */}
      {currentStep === 'join_company' && (
        <div id="onboarding-join-company-view" className="max-w-xl mx-auto py-4">
          <button
            type="button"
            onClick={() => setCurrentStep('choose_flow')}
            className="text-xs font-semibold text-slate-500 hover:text-white mb-4 flex items-center gap-1.5"
          >
            ← Kembali ke Pemilihan Opsi
          </button>

          {!joinResult ? (
            <div className="p-6 rounded-2xl border border-slate-800 bg-[#0B1220] shadow-xl space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-sky-400" />
                  <span>Gabung dengan Kode Organisasi</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Masukkan kode akses 8 karakter yang diberikan oleh pengelola organisasi Anda.
                </p>
              </div>

              <form onSubmit={handleJoinCompany} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Kode Akses Perusahaan (8 Karakter)
                  </label>
                  <input
                    type="text"
                    id="input-company-code"
                    maxLength={8}
                    value={joinCompanyCode}
                    onChange={(e) => setJoinCompanyCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-base font-mono font-bold tracking-widest text-white uppercase focus:outline-none focus:border-sky-500"
                    aria-label="Kode Akses 8 Karakter"
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">Format: 8 karakter alfanumerik terdaftar</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Lengkap Anda</label>
                  <input
                    type="text"
                    id="input-join-fullname"
                    value={joinFullName}
                    onChange={(e) => setJoinFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-white focus:outline-none focus:border-sky-500"
                    aria-label="Nama Lengkap Staf"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Alamat Email Kerja</label>
                  <input
                    type="email"
                    id="input-join-email"
                    value={joinEmail}
                    onChange={(e) => setJoinEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-white focus:outline-none focus:border-sky-500"
                    aria-label="Alamat Email Kerja"
                    required
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    id="btn-submit-join-company"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition shadow-lg shadow-sky-950/40 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    <span>Kirim Pengajuan Masuk</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div id="join-pending-status-card" className="p-6 rounded-2xl border border-amber-500/30 bg-amber-950/20 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Status: Menunggu Persetujuan HR</h3>
                  <p className="text-xs text-slate-400">
                    ID Antrean: <span className="font-mono text-xs text-amber-300">{joinResult.queue_id}</span>
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama:</span>
                  <span className="font-semibold text-white">{joinFullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-semibold text-white">{joinEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pemberitahuan:</span>
                  <span className="text-amber-400 font-medium">Dalam antrean peninjauan HR</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Pengajuan Anda telah tercatat pada basis data operasional. Setelah disetujui, akun Anda otomatis aktif.
              </p>

              <button
                type="button"
                onClick={() => {
                  setJoinResult(null);
                  setCurrentStep('choose_flow');
                }}
                className="w-full py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                Kembali ke Beranda
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. RUANG KELOLA ORGANISASI AKTIF (TENANT ACTIVE)                          */}
      {/* ========================================================================= */}
      {currentStep === 'tenant_active' && activeTenant && (
        <div id="onboarding-tenant-active-workspace" className="space-y-6">
          {/* Header Identitas Tenant */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-[#0B1220] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xl border border-emerald-500/20">
                {activeTenant.display_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{activeTenant.display_name}</h2>
                  <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {activeTenant.role}
                  </span>
                  <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    Company Brain Aktif
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  ID Organisasi: <span className="font-mono text-emerald-400">{activeTenant.tenant_id}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onEnterDashboard && (
                <button
                  type="button"
                  onClick={() => onEnterDashboard(activeTenant)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 text-white text-xs font-bold shadow-md shadow-emerald-950/40 hover:opacity-95 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Buka Dashboard Utama</span>
                </button>
              )}

              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="px-3 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                >
                  Halaman Utama
                </button>
              )}

              <button
                type="button"
                onClick={() => fetchTenantData(activeTenant.tenant_id)}
                disabled={isLoading}
                className="px-3 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Segarkan</span>
              </button>

              <button
                type="button"
                onClick={handleExitTenant}
                className="px-3 py-2 rounded-xl border border-red-500/20 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition cursor-pointer"
              >
                Keluar
              </button>
            </div>
          </div>

          {/* Navigasi Tab Pengelolaan */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              id="tab-btn-overview"
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Ringkasan Organisasi
            </button>
            <button
              type="button"
              id="tab-btn-codes"
              onClick={() => setActiveTab('codes')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'codes'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kode Undangan Staf
            </button>
            <button
              type="button"
              id="tab-btn-queue"
              onClick={() => setActiveTab('hr_queue')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'hr_queue'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
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
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'members'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Daftar Staf ({members.length})
            </button>
          </div>

          {/* Konten Tab 1: Ringkasan */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl border border-slate-800 bg-[#0B1220] space-y-1">
                <span className="text-xs font-medium text-slate-400">Anggota Aktif</span>
                <div className="text-2xl font-bold text-white">{members.length}</div>
                <span className="text-[11px] text-emerald-400">Terdaftar di basis data terisolasi</span>
              </div>
              <div className="p-5 rounded-2xl border border-slate-800 bg-[#0B1220] space-y-1">
                <span className="text-xs font-medium text-slate-400">Antrean Verifikasi Pending</span>
                <div className="text-2xl font-bold text-amber-400">
                  {hrQueue.filter((q) => q.status === 'pending').length}
                </div>
                <span className="text-[11px] text-slate-500">Menunggu review HR</span>
              </div>
              <div className="p-5 rounded-2xl border border-slate-800 bg-[#0B1220] space-y-1">
                <span className="text-xs font-medium text-slate-400">Status Langganan</span>
                <div className="text-2xl font-bold text-emerald-400 uppercase">{activeTenant.status}</div>
                <span className="text-[11px] text-slate-500">Company Brain Grounding Aktif</span>
              </div>
            </div>
          )}

          {/* Konten Tab 2: Generator & Daftar Kode Perusahaan */}
          {activeTab === 'codes' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl border border-slate-800 bg-[#0B1220] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Buat Kode Undangan Baru</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Buat kode acak unik untuk dibagikan ke staf agar mereka dapat mengajukan pendaftaran tim.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-generate-company-code"
                  onClick={handleGenerateCode}
                  disabled={isLoading}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2 transition disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>Generate Kode</span>
                </button>
              </div>

              {companyCodes.length === 0 ? (
                <div className="p-8 rounded-2xl border border-slate-800 text-center space-y-2 text-slate-400 bg-[#0B1220]">
                  <KeyRound className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs">Belum ada kode undangan yang dibuat untuk organisasi ini.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {companyCodes.map((codeItem) => (
                    <div
                      key={codeItem.code}
                      className="p-4 rounded-xl border border-slate-800 bg-[#0B1220] flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="text-lg font-mono font-bold tracking-widest text-emerald-400">
                          {codeItem.code}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                          <span>Maks: {codeItem.max_uses ?? 'Tak Terbatas'} penggunaan</span>
                          <span>•</span>
                          <span>Status: {codeItem.status}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(codeItem.code)}
                        className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition"
                        title="Salin Kode"
                      >
                        {copiedCode === codeItem.code ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
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
            <div className="space-y-4">
              {hrQueue.length === 0 ? (
                <div className="p-8 rounded-2xl border border-slate-800 text-center space-y-2 text-slate-400 bg-[#0B1220]">
                  <Clock className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs">Tidak ada staf yang menunggu persetujuan HR saat ini.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 overflow-hidden bg-[#0B1220]">
                  {hrQueue.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-900/40 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">
                            {item.submitted_profile.full_name || 'Tanpa Nama'}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                              item.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : item.status === 'approved'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{item.submitted_profile.email || '-'}</p>
                      </div>

                      {item.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleReviewHR(item.id, 'approved')}
                            disabled={isLoading}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Setujui</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewHR(item.id, 'rejected')}
                            disabled={isLoading}
                            className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Tolak</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Konten Tab 4: Daftar Anggota Tim */}
          {activeTab === 'members' && (
            <div className="rounded-2xl border border-slate-800 overflow-hidden bg-[#0B1220]">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#0D1527] border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Nama Lengkap</th>
                    <th className="py-3 px-4">Peran</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {members.map((m) => (
                    <tr key={m.membership_id} className="hover:bg-slate-900/40">
                      <td className="py-3 px-4 font-semibold text-white">{m.full_name}</td>
                      <td className="py-3 px-4 capitalize font-mono text-emerald-400">{m.role}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
