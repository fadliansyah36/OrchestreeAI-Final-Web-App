import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Layers,
  Sparkles,
  Calendar,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  IndustryCatalogItem,
  CommercialPlanItem,
  InterestOptionType,
  ProspectRegistrationRequest
} from '../../types';

interface ProspectRegistrationFormProps {
  isOpen?: boolean;
  onClose?: () => void;
  preselectedPlanId?: string;
  preselectedInterestOption?: InterestOptionType;
}

export const ProspectRegistrationForm: React.FC<ProspectRegistrationFormProps> = ({
  isOpen = true,
  onClose,
  preselectedPlanId,
  preselectedInterestOption = 'direct_trial_or_subscription'
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResponse, setSuccessResponse] = useState<{
    confirmationMessage: string;
    companyName: string;
    fullName: string;
  } | null>(null);

  // Dynamic catalogs
  const [industries, setIndustries] = useState<IndustryCatalogItem[]>([]);
  const [plans, setPlans] = useState<CommercialPlanItem[]>([]);

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [address, setAddress] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [industryCategoryId, setIndustryCategoryId] = useState('');
  const [companySizeRange, setCompanySizeRange] = useState('11-50');

  const [interestOption, setInterestOption] = useState<InterestOptionType>(preselectedInterestOption);
  const [interestedPlanId, setInterestedPlanId] = useState<string>(preselectedPlanId || '');

  // Load catalogs on mount
  useEffect(() => {
    let isMounted = true;
    const loadCatalogs = async () => {
      setLoading(true);
      try {
        const [indList, planList] = await Promise.all([
          api.getPublicIndustries().catch(() => []),
          api.getPublicPlans().catch(() => [])
        ]);
        if (isMounted) {
          setIndustries(indList);
          setPlans(planList);
          if (preselectedPlanId) {
            setInterestedPlanId(preselectedPlanId);
          } else if (planList.length > 0 && !interestedPlanId) {
            // default to popular plan if available
            const popular = planList.find((p) => p.planCode.toLowerCase() === 'growth') || planList[0];
            setInterestedPlanId(popular.id);
          }
        }
      } catch (err) {
        console.warn('Error loading dynamic catalogs:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadCatalogs();
    return () => {
      isMounted = false;
    };
  }, [preselectedPlanId]);

  if (!isOpen) return null;

  const validateStep1 = () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMsg('Nama lengkap wajib diisi minimal 2 karakter.');
      return false;
    }
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMsg('Format alamat email bisnis tidak valid.');
      return false;
    }
    const cleanPhone = phoneNumber.replace(/[\s-]/g, '');
    if (!/^(\+62|62|0)[0-9]{8,15}$/.test(cleanPhone)) {
      setErrorMsg('Format nomor HP/WhatsApp tidak valid (contoh: 081987654321 atau +6281987654321).');
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const validateStep2 = () => {
    if (!companyName.trim() || companyName.trim().length < 2) {
      setErrorMsg('Nama perusahaan wajib diisi minimal 2 karakter.');
      return false;
    }
    if (!jobTitle.trim()) {
      setErrorMsg('Jabatan / Posisi wajib diisi.');
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    setErrorMsg(null);
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setErrorMsg(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1() || !validateStep2()) return;

    setSubmitting(true);
    setErrorMsg(null);

    const payload: ProspectRegistrationRequest = {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim(),
      whatsappNumber: (whatsappNumber || phoneNumber).trim(),
      address: address.trim() || undefined,
      companyName: companyName.trim(),
      jobTitle: jobTitle.trim(),
      industryCategoryId: industryCategoryId || undefined,
      companySizeRange: companySizeRange || undefined,
      interestOption: interestOption,
      interestedPlanId: interestOption === 'direct_trial_or_subscription' ? (interestedPlanId || undefined) : undefined
    };

    try {
      const res = await api.submitProspectRegistration(payload);
      setSuccessResponse({
        confirmationMessage: res.confirmationMessage,
        companyName: payload.companyName,
        fullName: payload.fullName
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat mengirim pendaftaran. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const defaultIndustryFallback = [
    { id: 'ind-tech', industry_name: 'Teknologi Informasi & Software' },
    { id: 'ind-fin', industry_name: 'Keuangan & Perbankan (Fintech/BPR)' },
    { id: 'ind-mfg', industry_name: 'Manufaktur & Pabrikasi' },
    { id: 'ind-ret', industry_name: 'Retail, Grosir & E-Commerce' },
    { id: 'ind-hlth', industry_name: 'Kesehatan, Rumah Sakit & Farmasi' },
    { id: 'ind-log', industry_name: 'Logistik, Transportasi & Ekspedisi' },
    { id: 'ind-edu', industry_name: 'Pendidikan & Pelatihan' },
    { id: 'ind-prof', industry_name: 'Konsultan & Jasa Profesional' },
    { id: 'ind-oth', industry_name: 'Lainnya / Sektor Bisnis Lain' }
  ];

  const industryOptions = industries.length > 0 ? industries : defaultIndustryFallback;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#071226] border border-white/15 rounded-3xl shadow-2xl overflow-hidden my-8 text-white">
        {/* Modal Top Header */}
        <div className="relative px-6 py-5 border-b border-white/10 bg-gradient-to-r from-[#0B1A3A] to-[#071226] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#08B85C] to-[#1976E8] flex items-center justify-center shadow-lg shadow-[#08B85C]/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
                <span>Pendaftaran Prospek & Kuesioner Minat</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#08B85C]/20 text-[#08B85C] border border-[#08B85C]/30 font-bold">
                  Eksklusif 36 Slot
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Lengkapi kuesioner singkat ini agar tim kurasi OrchestreeAI dapat memetakan kebutuhan operasional Anda.
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Tutup Form"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Disclaimer Warning Notice (Explicit Requirement) */}
        <div className="bg-[#16B7D9]/10 border-b border-[#16B7D9]/20 px-6 py-2.5 flex items-center space-x-2.5 text-xs text-[#16B7D9]">
          <ShieldCheck className="w-4 h-4 shrink-0 text-[#16B7D9]" />
          <span className="leading-snug font-medium">
            <strong>Tanpa Biaya & Tanpa Kartu Kredit.</strong> Ini murni kuesioner asesmen kelayakan. Tidak ada redirect ke pembayaran atau checkout apapun.
          </span>
        </div>

        {/* Success View */}
        {successResponse ? (
          <div className="p-8 sm:p-10 text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-[#08B85C]/20 border border-[#08B85C]/40 text-[#08B85C] flex items-center justify-center mx-auto shadow-xl shadow-[#08B85C]/20">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white">Pendaftaran Berhasil Dikirim!</h3>
              <p className="text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
                {successResponse.confirmationMessage}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 max-w-md mx-auto text-left text-xs text-slate-300 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Pendaftar:</span>
                <strong className="text-white font-semibold">{successResponse.fullName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Perusahaan:</span>
                <strong className="text-white font-semibold">{successResponse.companyName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Opsi Minat:</span>
                <strong className="text-[#16B7D9] font-semibold">
                  {interestOption === 'schedule_meeting_presentation'
                    ? 'Presentasi Solusi Enterprise'
                    : 'Seleksi 36 Slot Trial 7 Hari'}
                </strong>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={onClose || (() => window.location.reload())}
                className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white font-bold text-sm shadow-xl shadow-[#08B85C]/25 hover:brightness-110 cursor-pointer transition-all"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Step Progression Tabs */}
            <div className="px-6 pt-5 pb-3 border-b border-white/10 flex items-center justify-between text-xs font-semibold text-slate-400">
              {[
                { step: 1, label: 'Kontak Diri' },
                { step: 2, label: 'Perusahaan' },
                { step: 3, label: 'Opsi Minat' },
                { step: 4, label: 'Konfirmasi' }
              ].map((item) => (
                <div
                  key={item.step}
                  className={`flex items-center space-x-2 transition-colors ${
                    currentStep === item.step
                      ? 'text-[#16B7D9] font-bold'
                      : currentStep > item.step
                      ? 'text-[#08B85C]'
                      : 'text-slate-500'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                      currentStep === item.step
                        ? 'bg-[#16B7D9] text-black shadow-md shadow-[#16B7D9]/30'
                        : currentStep > item.step
                        ? 'bg-[#08B85C] text-white'
                        : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    {currentStep > item.step ? '✓' : item.step}
                  </div>
                  <span className="hidden sm:inline">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Error Notification */}
            {errorMsg && (
              <div className="m-6 mb-0 p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Step 1: Data Diri & Kontak */}
            {currentStep === 1 && (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <User className="w-4 h-4 text-[#16B7D9]" />
                    <span>Langkah 1: Data Diri & Kontak</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Pastikan nomor WhatsApp dan email aktif untuk konfirmasi jadwal atau status slot trial Anda.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Lengkap <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Budi Santoso"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#16B7D9] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Email Bisnis / Kantor <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="budi@perusahaan.co.id"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#16B7D9] transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Nomor HP / WhatsApp <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="081987654321"
                        value={phoneNumber}
                        onChange={(e) => {
                          setPhoneNumber(e.target.value);
                          if (!whatsappNumber) setWhatsappNumber(e.target.value);
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#16B7D9] transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Nomor WhatsApp Khusus (Opsional)
                      </label>
                      <input
                        type="tel"
                        placeholder="Sama dengan HP jika kosong"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#16B7D9] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Alamat Kantor / Kota Domisili (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Jakarta Selatan / Surabaya"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#16B7D9] transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Profil Perusahaan */}
            {currentStep === 2 && (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-[#16B7D9]" />
                    <span>Langkah 2: Profil Perusahaan & Industri</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Kategori industri membantu kami mencocokkan AI Agent spesialis (misal: AI Sales, AI Support, AI HR, atau Finance).
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Perusahaan / Organisasi <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: PT Tri Mitra Logistik"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#16B7D9] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Jabatan / Posisi Anda <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: CEO, Direktur Operasional, Head of IT, HR Manager"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-[#16B7D9] transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Sektor / Kategori Industri
                      </label>
                      <select
                        value={industryCategoryId}
                        onChange={(e) => setIndustryCategoryId(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#0B1A3A] border border-white/15 text-white text-xs focus:outline-none focus:border-[#16B7D9] transition-all"
                      >
                        <option value="">-- Pilih Sektor Industri --</option>
                        {industryOptions.map((ind) => (
                          <option key={ind.id} value={ind.id}>
                            {ind.industry_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Jumlah Karyawan / Ukuran Tim
                      </label>
                      <select
                        value={companySizeRange}
                        onChange={(e) => setCompanySizeRange(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#0B1A3A] border border-white/15 text-white text-xs focus:outline-none focus:border-[#16B7D9] transition-all"
                      >
                        <option value="1-10">1 - 10 Karyawan</option>
                        <option value="11-50">11 - 50 Karyawan</option>
                        <option value="51-200">51 - 200 Karyawan</option>
                        <option value="201-500">201 - 500 Karyawan</option>
                        <option value=">500">&gt; 500 Karyawan (Enterprise)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Opsi Pilihan Kebutuhan & Minat */}
            {currentStep === 3 && (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-[#16B7D9]" />
                    <span>Langkah 3: Opsi Minat & Kebutuhan</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Pilih jalur keterlibatan yang Anda inginkan bersama tim OrchestreeAI.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  {/* Option 1: Schedule Presentation */}
                  <label
                    onClick={() => setInterestOption('schedule_meeting_presentation')}
                    className={`block p-4 rounded-2xl border transition-all cursor-pointer ${
                      interestOption === 'schedule_meeting_presentation'
                        ? 'bg-[#1976E8]/15 border-[#1976E8] ring-1 ring-[#1976E8]'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center ${
                          interestOption === 'schedule_meeting_presentation'
                            ? 'border-[#1976E8] bg-[#1976E8]'
                            : 'border-slate-500'
                        }`}
                      >
                        {interestOption === 'schedule_meeting_presentation' && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-[#1976E8]" />
                          <h4 className="text-sm font-bold text-white">
                            Jadwalkan Presentasi & Meeting Solusi Enterprise
                          </h4>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Dapatkan sesi konsultasi langsung dan demo arsitektur sistem kolaborasi Staf Manusia + AI Agent yang disesuaikan dengan alur kerja departemen Anda.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Option 2: Direct Trial 7 Days */}
                  <label
                    onClick={() => setInterestOption('direct_trial_or_subscription')}
                    className={`block p-4 rounded-2xl border transition-all cursor-pointer ${
                      interestOption === 'direct_trial_or_subscription'
                        ? 'bg-[#08B85C]/15 border-[#08B85C] ring-1 ring-[#08B85C]'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center ${
                          interestOption === 'direct_trial_or_subscription'
                            ? 'border-[#08B85C] bg-[#08B85C]'
                            : 'border-slate-500'
                        }`}
                      >
                        {interestOption === 'direct_trial_or_subscription' && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <Sparkles className="w-4 h-4 text-[#08B85C]" />
                          <h4 className="text-sm font-bold text-white">
                            Ikut Seleksi 36 Slot Trial 7 Hari (Atau Langganan Langsung)
                          </h4>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#08B85C]/20 text-[#08B85C] border border-[#08B85C]/30 font-bold">
                            Kuota 36 Slot
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Uji coba gratis 7 hari dengan kuota 1,000 AI Credits. Super Admin kami akan memilih pendaftar yang memenuhi kriteria kesiapan integrasi bisnis.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Plan Selector if Option 2 */}
                  {interestOption === 'direct_trial_or_subscription' && (
                    <div className="mt-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">
                        Paket Komersial yang Menjadi Preferensi Anda:
                      </label>
                      <select
                        value={interestedPlanId}
                        onChange={(e) => setInterestedPlanId(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#0B1A3A] border border-white/15 text-white text-xs focus:outline-none focus:border-[#08B85C] transition-all"
                      >
                        <option value="">-- Trial Umum (Default 7 Hari / 1,000 Credits) --</option>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.planName} ({p.creditAllocation.toLocaleString('id-ID')} Credits/bln - {p.humanSeatLimit} Staf Manusia, {p.aiAgentLimit} AI Agents)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Konfirmasi & Kirim */}
            {currentStep === 4 && (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-[#08B85C]" />
                    <span>Langkah 4: Review & Konfirmasi Pendaftaran</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Mohon periksa ringkasan data sebelum mengirimkan kuesioner.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 text-xs space-y-2.5">
                  <div className="grid grid-cols-2 gap-2 border-b border-white/10 pb-2">
                    <div>
                      <span className="text-slate-400 block">Nama Lengkap:</span>
                      <strong className="text-white">{fullName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Email Bisnis:</span>
                      <strong className="text-white">{email}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">No. WhatsApp:</span>
                      <strong className="text-white">{phoneNumber}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Domisili:</span>
                      <strong className="text-white">{address || '-'}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-b border-white/10 pb-2">
                    <div>
                      <span className="text-slate-400 block">Perusahaan:</span>
                      <strong className="text-white">{companyName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Jabatan:</span>
                      <strong className="text-white">{jobTitle}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Ukuran Tim:</span>
                      <strong className="text-white">{companySizeRange} karyawan</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Sektor Industri:</span>
                      <strong className="text-white">
                        {industryOptions.find((i) => i.id === industryCategoryId)?.industry_name || 'Umum / Terbuka'}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block">Opsi yang Dipilih:</span>
                    <strong className="text-[#16B7D9] block mt-0.5">
                      {interestOption === 'schedule_meeting_presentation'
                        ? 'Jadwalkan Presentasi & Meeting Solusi Enterprise'
                        : 'Seleksi 36 Slot Trial 7 Hari (1,000 Credits)'}
                    </strong>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#08B85C]/10 border border-[#08B85C]/20 text-[11px] text-slate-300 leading-relaxed">
                  <span className="text-[#08B85C] font-bold">Catatan Kurasi:</span> Khusus 36 slot Trial 7 Hari akan dipilih sendiri oleh Super Admin OrchestreeAI. Pendaftar tidak dibatasi, namun pengaktifan tenant akan dikurasi secara bertahap.
                </div>
              </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="px-6 py-4 border-t border-white/10 bg-black/30 flex items-center justify-between">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali</span>
                </button>
              ) : (
                <div />
              )}

              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white text-xs font-bold flex items-center space-x-1.5 shadow-lg shadow-[#08B85C]/20 hover:brightness-110 transition-all cursor-pointer"
                >
                  <span>Lanjutkan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white text-xs font-extrabold flex items-center space-x-2 shadow-xl shadow-[#08B85C]/30 hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mengirimkan Kuesioner...</span>
                    </>
                  ) : (
                    <>
                      <span>Kirim Pendaftaran Sekarang</span>
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
