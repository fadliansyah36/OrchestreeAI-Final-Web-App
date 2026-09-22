import React, { useState, useEffect, useMemo } from 'react';
import {
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { api, DEFAULT_COMMERCIAL_PLANS } from '../../lib/api';
import { CommercialPlanItem } from '../../types';
import { CANONICAL_PLANS } from './landingData';

interface PricingSectionProps {
  onSelectPlan?: (planId?: string) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [plans, setPlans] = useState<CommercialPlanItem[]>(() => api.getPlansFromLocalCache() || DEFAULT_COMMERCIAL_PLANS);
  const [lastUpdatedDate, setLastUpdatedDate] = useState<string>('Hari ini');

  const fetchPricing = async () => {
    try {
      const data = await api.getPublicPlans(false);
      if (Array.isArray(data) && data.length > 0) {
        setPlans(data);
        // Extract latest update timestamp if present
        const latestTime = data.reduce((latest, item) => {
          if (!item.updatedAt) return latest;
          const time = new Date(item.updatedAt).getTime();
          return time > latest ? time : latest;
        }, 0);
        if (latestTime > 0) {
          setLastUpdatedDate(new Date(latestTime).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }));
        }
      } else {
        setPlans(DEFAULT_COMMERCIAL_PLANS);
      }
    } catch (err: any) {
      console.warn('Could not fetch dynamic plans, using cached/fallback:', err);
      const cached = api.getPlansFromLocalCache();
      setPlans(cached);
    }
  };

  useEffect(() => {
    // 1. Initial fetch once on mount
    fetchPricing();

    // 2. Local cross-component update event listener (triggered only when Admin updates plans)
    const handlePriceSync = () => {
      fetchPricing();
    };
    window.addEventListener('orchestree:pricing-updated', handlePriceSync);

    return () => {
      window.removeEventListener('orchestree:pricing-updated', handlePriceSync);
    };
  }, []);

  // Merge backend data with canonical metadata to guarantee all 4 tiers are beautifully rendered
  const displayPlans = useMemo(() => {
    const activePlans = plans.length > 0 ? plans.filter((p) => p.isActive) : DEFAULT_COMMERCIAL_PLANS;

    // Ensure all 4 canonical codes are represented
    const planCodes = ['starter', 'growth', 'enterprise', 'custom'];
    
    return planCodes.map((code) => {
      const serverPlan = activePlans.find((p) => p.planCode.toLowerCase() === code);
      const matchingCanonical = CANONICAL_PLANS.find((c) => c.id.toLowerCase() === code);

      const baseMonthly = serverPlan?.price !== undefined && serverPlan?.price !== null
        ? serverPlan.price
        : matchingCanonical?.monthlyPriceIdr ?? 0;
      
      const isPriceVisible = serverPlan?.isPriceVisible ?? (code !== 'custom');
      const baseAnnual = Math.round(baseMonthly * 0.8);

      return {
        id: serverPlan?.planCode || code,
        backendId: serverPlan?.id || matchingCanonical?.id || code,
        name: serverPlan?.planName || matchingCanonical?.name || code.toUpperCase(),
        monthlyPriceIdr: isPriceVisible ? baseMonthly : 0,
        annualPriceIdr: isPriceVisible ? baseAnnual : 0,
        isPriceVisible,
        description: serverPlan?.description || matchingCanonical?.description || `Paket ${code} untuk otomatisasi workforce.`,
        aiWorkforceCount: serverPlan?.aiAgentLimit ?? matchingCanonical?.aiWorkforceCount ?? 1,
        humanSeatsCount: serverPlan?.humanSeatLimit ?? matchingCanonical?.humanSeatsCount ?? 3,
        taskMonthlyLimit: serverPlan?.creditAllocation
          ? `${serverPlan.creditAllocation.toLocaleString('id-ID')} Kredit Tugas`
          : (matchingCanonical?.taskMonthlyLimit ?? 'Sesuai SLA'),
        isPopular: code === 'growth',
        badge: serverPlan?.badge || matchingCanonical?.badge || (code === 'growth' ? 'Paling Populer' : undefined),
        features: (serverPlan?.features && serverPlan.features.length > 0)
          ? serverPlan.features
          : (matchingCanonical?.features ?? [
              `${serverPlan?.aiAgentLimit ?? 1} Staf AI Aktif Otomatis`,
              `${serverPlan?.humanSeatLimit ?? 3} Akun Staf Manusia`,
              'Isolasi Multi-Tenant Enkripsi Penuh',
              'Akses Company Brain & Memory Vault',
              'Dukungan SLA Standard',
            ]),
        updatedAt: serverPlan?.updatedAt,
      };
    });
  }, [plans]);

  const handleConsultation = (planName: string) => {
    if (onSelectPlan) {
      onSelectPlan('custom');
      return;
    }
    const faqElem = document.getElementById('faq');
    if (faqElem) {
      faqElem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="pricing" className="py-24 bg-gradient-to-b from-[#071226] via-[#0B1835] to-[#071226] text-white border-t border-white/10 relative overflow-hidden">
      {/* Ambient background glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-[#08B85C]/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-[#1976E8]/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>TRANSPARENT ENTERPRISE PRICING</span>
          </div>
          
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Investasi Terjangkau untuk Skala Produktivitas 10x Lipat
          </h2>
          
          <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed">
            Pilih paket yang sesuai dengan skala bisnis Anda. Tarif transparan, isolasi multi-tenant terenkripsi, dan akses langsung ke ekosistem AI Workforce.
          </p>

          {/* Simple & Safe Public Update Indicator */}
          <div className="mt-5 inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs text-slate-300 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
            <span>Tarif resmi diperbarui: <strong className="text-white font-medium">{lastUpdatedDate}</strong></span>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="mt-8 inline-flex items-center p-1.5 rounded-2xl bg-white/5 border border-white/10">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-white/20 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tagihan Bulanan
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
                billingCycle === 'annual'
                  ? 'bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Tagihan Tahunan</span>
              <span className="px-2 py-0.5 rounded-full bg-black/30 text-white text-[10px] uppercase font-mono tracking-wider font-semibold">
                Hemat 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {displayPlans.map((plan) => {
            const hasNumericPrice = plan.isPriceVisible && plan.monthlyPriceIdr > 0;
            const price = billingCycle === 'annual' ? plan.annualPriceIdr : plan.monthlyPriceIdr;
            const originalMonthlyPrice = plan.monthlyPriceIdr;

            return (
              <div
                key={plan.id}
                className={`p-6 sm:p-7 rounded-3xl border transition-all flex flex-col justify-between relative ${
                  plan.isPopular
                    ? 'bg-gradient-to-b from-[#0B1835] to-[#071226] border-[#08B85C] shadow-2xl shadow-[#08B85C]/20 ring-1 ring-[#08B85C]'
                    : 'bg-white/[0.03] border-white/10 hover:border-white/25 hover:bg-white/[0.05]'
                }`}
              >
                {/* Popular Badge */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                    {plan.badge}
                  </div>
                )}

                <div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-extrabold text-white">{plan.name}</h3>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">
                        {plan.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-snug min-h-[36px]">{plan.description}</p>
                  </div>

                  {/* Price Block */}
                  <div className="mt-6 pb-6 border-b border-white/10">
                    {hasNumericPrice ? (
                      <>
                        <div className="flex items-baseline space-x-1">
                          <span className="text-xs font-semibold text-slate-400">Rp</span>
                          <span className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
                            {price.toLocaleString('id-ID')}
                          </span>
                        </div>
                        
                        <div className="mt-1 flex items-center space-x-2 text-[11px] text-slate-400 font-medium">
                          <span>/ bulan</span>
                          {billingCycle === 'annual' && (
                            <>
                              <span className="line-through text-slate-500 font-mono">
                                Rp {originalMonthlyPrice.toLocaleString('id-ID')}
                              </span>
                              <span className="text-emerald-400 font-semibold">(Hemat 20%)</span>
                            </>
                          )}
                        </div>

                        {billingCycle === 'annual' && (
                          <span className="text-[10px] text-slate-400 block mt-1 font-mono">
                            Ditagih tahunan (Rp {(price * 12).toLocaleString('id-ID')} / thn)
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline space-x-1">
                          <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
                            Hubungi Sales
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium block mt-1">
                          Kustom SLA & Infrastruktur Dedicated
                        </span>
                        <span className="text-[10px] text-cyan-400/90 block mt-1 font-mono">
                          Multi-Tenant Terisolasi / On-Premise
                        </span>
                      </>
                    )}
                  </div>

                  {/* Resource Limits Summary */}
                  <div className="py-4 space-y-2 text-xs font-mono border-b border-white/10">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Staf AI Aktif:</span>
                      <strong className="text-[#08B85C]">{plan.aiWorkforceCount} Agen AI</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Kapasitas Staf:</span>
                      <strong className="text-[#1976E8]">{plan.humanSeatsCount} Akun Manusia</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Batas Kuota Tugas:</span>
                      <strong className="text-white">{plan.taskMonthlyLimit}</strong>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="pt-5 space-y-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Fitur Termasuk:
                    </span>
                    <ul className="space-y-2 text-xs text-slate-300">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <Check className="w-4 h-4 text-[#08B85C] shrink-0 mt-0.5" />
                          <span className="leading-snug">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Card Informational CTA / Trial Selector */}
                <div className="pt-8">
                  <button
                    onClick={() => {
                      if (onSelectPlan) {
                        onSelectPlan(plan.backendId || plan.id);
                      } else {
                        handleConsultation(plan.name);
                      }
                    }}
                    className={`w-full py-3.5 rounded-2xl font-bold text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                      plan.isPopular
                        ? 'bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white shadow-xl shadow-[#08B85C]/25 hover:brightness-110 active:scale-[0.98]'
                        : 'bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/10 active:scale-[0.98]'
                    }`}
                  >
                    <span>{hasNumericPrice ? `Pilih Paket & Seleksi Trial ${plan.name}` : `Konsultasi Enterprise ${plan.name}`}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Enterprise Bottom Assurance Box */}
        <div className="mt-16 p-6 rounded-3xl bg-white/[0.02] border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[#08B85C]">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-bold text-white">
                Garansi Keamanan Kedaulatan Data Terisolasi
              </h4>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Setiap data tenant dienkripsi dengan kunci terpisah (AES-256), Row-Level Security (RLS) terisolasi, dan cadangan otomatis harian.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleConsultation('Custom Sovereign')}
            className="px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-all cursor-pointer shrink-0"
          >
            Pelajari Keamanan & SLA
          </button>
        </div>
      </div>
    </section>
  );
};
