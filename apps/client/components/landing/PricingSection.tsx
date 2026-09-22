import React, { useState, useEffect } from 'react';
import {
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { SkeletonLoader, ErrorState } from '@orchestree/ui';

export interface SubscriptionPlanItem {
  id: string;
  plan_code: string;
  tier_level: number;
  display_name: string;
  price_monthly: number;
  currency: string;
}

interface PricingSectionProps {
  onSelectPlan: (planCode: string) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/public/subscription-plans');
      if (!res.ok) {
        throw new Error(`Gagal memuat paket langganan (${res.status} ${res.statusText})`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setPlans(data);
      } else {
        setPlans([]);
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat mengambil data paket langganan dari basis data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const formatPrice = (price: number, currency: string) => {
    if (price === 0) {
      return 'Rp 0';
    }
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency || 'IDR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getPlanPerks = (planCode: string) => {
    switch (planCode.toUpperCase()) {
      case 'TRIAL':
      case 'FREE_TRIAL':
        return [
          'Akses uji coba sistem mandiri',
          'Alokasi kuota komputasi awal',
          'Akses modul Company Brain dasar',
          'Integrasi webhook eksperimental',
        ];
      case 'STARTER':
        return [
          'Hingga 3 jabatan staf AI aktif',
          'Integrasi resmi WhatsApp Cloud API',
          'Isolasi basis data PostgreSQL RLS penuh',
          'Dukungan via tiket sistem standar',
        ];
      case 'PRO':
        return [
          'Hingga 7 jabatan staf AI kolaboratif',
          'Akses Multi-LLM Smart Router (NVIDIA & Gemini)',
          'Alur persetujuan manajer terkonfigurasi',
          'Jejak audit append-only permanen',
        ];
      case 'GROWTH':
        return [
          'Seluruh 15 jabatan staf AI tanpa batasan',
          'Kapasitas komputasi & memori Company Brain tinggi',
          'Integrasi multi-kanal WhatsApp & Telegram',
          'Dukungan teknis prioritas berdedikasi',
        ];
      case 'ENTERPRISE':
      default:
        return [
          'Ekosistem korporat terisolasi penuh',
          'Kustomisasi SOP dan wewenang khusus',
          'Audit kepatuhan dan SLA terjamin 99.9%',
          'Manajer akun teknis khusus',
        ];
    }
  };

  return (
    <section id="pricing" className="py-24 bg-[#0B1220] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#1FA35A]/30 text-xs font-semibold text-[#34D399] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>TRANSPARANSI INVESTASI OPERASIONAL</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Pilihan Paket Layanan Fleksibel
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Data harga dibaca secara langsung dari basis data aktif sistem. Pilih paket yang sesuai dengan kapasitas dan kebutuhan organisasi Anda.
          </p>
        </div>

        {/* Dynamic Content Rendering */}
        <div className="mt-16">
          {loading && (
            <div className="py-12 space-y-4 max-w-4xl mx-auto">
              <SkeletonLoader className="h-12 w-full" />
              <SkeletonLoader className="h-48 w-full" />
            </div>
          )}

          {error && !loading && (
            <div className="max-w-md mx-auto my-8">
              <ErrorState
                title="Gagal Memuat Paket Langganan"
                message={error}
                onRetry={fetchPlans}
              />
            </div>
          )}

          {!loading && !error && plans.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              Belum ada paket langganan yang dikonfigurasikan di basis data.
            </div>
          )}

          {!loading && !error && plans.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {plans.map((p) => {
                const isFeatured = p.plan_code.toUpperCase() === 'GROWTH' || p.plan_code.toUpperCase() === 'PRO';
                const perks = getPlanPerks(p.plan_code);

                return (
                  <div
                    key={p.id}
                    className={`rounded-3xl p-6 flex flex-col justify-between transition-all border ${
                      isFeatured
                        ? 'bg-gradient-to-b from-[#1FA35A]/15 via-white/[0.04] to-white/[0.02] border-[#1FA35A]/60 shadow-xl shadow-[#1FA35A]/10 scale-[1.02]'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      {isFeatured && (
                        <div className="inline-block px-2.5 py-0.5 rounded-full bg-[#1FA35A]/25 border border-[#1FA35A]/40 text-[#34D399] font-mono text-[10px] font-bold uppercase tracking-wider mb-3">
                          Rekomendasi
                        </div>
                      )}
                      <h3 className="text-lg font-extrabold text-white">{p.display_name}</h3>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mt-0.5">
                        Kode: {p.plan_code}
                      </p>

                      <div className="mt-5 pb-5 border-b border-white/10">
                        <span className="text-2xl sm:text-3xl font-extrabold text-white">
                          {formatPrice(p.price_monthly, p.currency)}
                        </span>
                        {p.price_monthly > 0 && (
                          <span className="text-xs text-slate-400 block mt-1 font-medium">per bulan</span>
                        )}
                      </div>

                      <div className="mt-6 space-y-3">
                        {perks.map((perk, perkIdx) => (
                          <div key={perkIdx} className="flex items-start space-x-2">
                            <Check className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" />
                            <span className="text-xs text-slate-300 leading-snug">{perk}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-8 pt-4">
                      <button
                        onClick={() => onSelectPlan(p.plan_code)}
                        className={`w-full py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                          isFeatured
                            ? 'bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white shadow-lg shadow-[#1FA35A]/25 hover:opacity-95'
                            : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                        }`}
                      >
                        <span>Pilih {p.display_name}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-12 text-center text-xs text-slate-400 max-w-xl mx-auto">
          Setiap paket dilengkapi jaminan privasi data Row-Level Security dan enkripsi TLS 1.3 standar perbankan.
        </div>
      </div>
    </section>
  );
};
