import React, { useState, useEffect } from 'react';
import {
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  Bot,
  Layers,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  PhoneCall
} from 'lucide-react';
import { SkeletonLoader, ErrorState } from '@orchestree/ui';

export interface SubscriptionPlanItem {
  id: string;
  plan_code: string;
  tier_level: number;
  display_name: string;
  price_monthly: number | null;
  monthly_price_idr: number | null;
  ai_credit_allowance: number | null;
  human_staff_limit: number | null;
  ai_agent_limit: number | null;
  is_trial: boolean;
  trial_duration_days: number | null;
  is_custom_quote: boolean;
  display_order: number;
  currency: string;
}

export interface FacilityCatalogItem {
  facility_key: string;
  display_name: string;
  display_order: number;
  levels: Record<string, string>;
}

interface PricingSectionProps {
  onSelectPlan: (planCode: string) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [facilities, setFacilities] = useState<FacilityCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showMatrixTable, setShowMatrixTable] = useState<boolean>(false);

  const fetchPricingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, matrixRes] = await Promise.all([
        fetch('/api/v1/public/subscription-plans'),
        fetch('/api/v1/public/plan-facility-matrix'),
      ]);

      if (!plansRes.ok) {
        throw new Error(`Gagal memuat paket langganan (${plansRes.status})`);
      }
      if (!matrixRes.ok) {
        throw new Error(`Gagal memuat matriks fasilitas (${matrixRes.status})`);
      }

      const plansData = await plansRes.json();
      const matrixData = await matrixRes.json();

      if (Array.isArray(plansData)) {
        setPlans(plansData);
      } else {
        setPlans([]);
      }

      if (matrixData && Array.isArray(matrixData.facilities)) {
        setFacilities(matrixData.facilities);
      } else {
        setFacilities([]);
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kendala koneksi saat memuat data paket langganan dari basis data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPricingData();
  }, []);

  const formatPriceDisplay = (plan: SubscriptionPlanItem) => {
    if (plan.is_custom_quote || plan.monthly_price_idr === null || plan.plan_code.toLowerCase() === 'custom') {
      return {
        main: 'By Request',
        sub: 'Hubungi tim untuk penawaran khusus',
        isCustom: true,
      };
    }

    const price = plan.monthly_price_idr !== null ? plan.monthly_price_idr : (plan.price_monthly ?? 0);
    if (price === 0 || plan.is_trial) {
      return {
        main: 'Rp 0',
        sub: plan.trial_duration_days ? `Uji coba ${plan.trial_duration_days} hari gratis` : 'Uji coba gratis',
        isCustom: false,
      };
    }

    const formatted = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: plan.currency || 'IDR',
      maximumFractionDigits: 0,
    }).format(price);

    return {
      main: formatted,
      sub: 'per bulan (tagihan periodik)',
      isCustom: false,
    };
  };

  const getLevelBadge = (level: string) => {
    const lvl = (level || '').toLowerCase();
    switch (lvl) {
      case 'unlimited':
      case 'enterprise':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Enterprise</span>;
      case 'advanced':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Lanjutan</span>;
      case 'basic':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/30">Standar</span>;
      case 'limited':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">Terbatas</span>;
      case 'custom':
        return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">Kustom</span>;
      case 'none':
      default:
        return <span className="text-slate-600 text-xs">-</span>;
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
            Nilai investasi dan hak akses fasilitas disinkronisasi langsung dari basis data aktif sistem.
            Pilih paket yang sesuai dengan kapasitas operasional dan target pertumbuhan organisasi Anda.
          </p>
        </div>

        {/* Dynamic Content */}
        <div className="mt-16">
          {loading && (
            <div className="py-12 space-y-4 max-w-4xl mx-auto">
              <SkeletonLoader className="h-12 w-full" />
              <SkeletonLoader className="h-64 w-full" />
            </div>
          )}

          {error && !loading && (
            <div className="max-w-md mx-auto my-8">
              <ErrorState
                title="Gagal Memuat Paket Langganan"
                message={error}
                onRetry={fetchPricingData}
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
                const code = p.plan_code.toLowerCase();
                const isFeatured = code === 'professional' || code === 'starter';
                const isCustom = p.is_custom_quote || p.monthly_price_idr === null || code === 'custom';
                const priceInfo = formatPriceDisplay(p);

                // Ambil fasilitas aktif untuk paket ini dari matriks fasilitas
                const activeFacilities = facilities.filter(f => {
                  const level = f.levels[code] || f.levels[p.plan_code] || 'none';
                  return level !== 'none';
                });

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
                      <div className="flex items-center justify-between mb-3">
                        {isFeatured ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#1FA35A]/25 border border-[#1FA35A]/40 text-[#34D399] font-mono text-[10px] font-bold uppercase tracking-wider">
                            Paling Diminati
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                            Tingkat {p.tier_level}
                          </span>
                        )}
                        <span className="text-[10px] font-mono uppercase text-slate-500">
                          {p.plan_code}
                        </span>
                      </div>

                      <h3 className="text-xl font-extrabold text-white">{p.display_name}</h3>

                      {/* Display Harga */}
                      <div className="mt-4 pb-4 border-b border-white/10">
                        <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                          {priceInfo.main}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 font-medium leading-relaxed">
                          {priceInfo.sub}
                        </p>
                      </div>

                      {/* Batas Alokasi & Kuota (Real dari Database) */}
                      <div className="mt-5 space-y-2.5 py-3 border-b border-white/5 text-xs text-slate-300">
                        <div className="flex items-center space-x-2">
                          <Zap className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                          <span>
                            {p.ai_credit_allowance !== null
                              ? `${Number(p.ai_credit_allowance).toLocaleString('id-ID')} AI Credits / bln`
                              : 'Alokasi Kredit Fleksibel'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>
                            {p.human_staff_limit !== null
                              ? `Hingga ${p.human_staff_limit} Staf Manusia`
                              : 'Kapasitas Staf Kustom'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>
                            {p.ai_agent_limit !== null
                              ? `Hingga ${p.ai_agent_limit} AI Agent`
                              : 'AI Agent Fleksibel & Dedicated'}
                          </span>
                        </div>
                      </div>

                      {/* Fasilitas Dinamis dari plan_facility_matrix */}
                      <div className="mt-5 space-y-2">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                          Fasilitas Termasuk:
                        </p>
                        {activeFacilities.slice(0, 5).map((fac) => {
                          const level = fac.levels[code] || fac.levels[p.plan_code] || 'basic';
                          return (
                            <div key={fac.facility_key} className="flex items-start space-x-2 text-xs">
                              <Check className="w-3.5 h-3.5 text-[#34D399] shrink-0 mt-0.5" />
                              <div className="flex-1 leading-snug text-slate-300 flex items-center justify-between">
                                <span className="line-clamp-1 mr-1">{fac.display_name}</span>
                                {getLevelBadge(level)}
                              </div>
                            </div>
                          );
                        })}
                        {activeFacilities.length > 5 && (
                          <div className="text-[11px] text-[#34D399] font-medium pt-1">
                            +{activeFacilities.length - 5} fasilitas operasional lainnya
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tombol Aksi CTA */}
                    <div className="mt-8 pt-4">
                      {isCustom ? (
                        <button
                          onClick={() => onSelectPlan('custom')}
                          className="w-full py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/20 hover:opacity-95"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Hubungi Kami</span>
                        </button>
                      ) : p.is_trial ? (
                        <button
                          onClick={() => onSelectPlan(p.plan_code)}
                          className="w-full py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer bg-white/10 hover:bg-white/15 text-white border border-white/20"
                        >
                          <span>Mulai Uji Coba {p.trial_duration_days || 7} Hari</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => onSelectPlan(p.plan_code)}
                          className={`w-full py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                            isFeatured
                              ? 'bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white shadow-lg shadow-[#1FA35A]/25 hover:opacity-95'
                              : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                          }`}
                        >
                          <span>Pilih Paket {p.display_name}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Toggle Matriks Komparasi Lengkap */}
          {!loading && !error && facilities.length > 0 && plans.length > 0 && (
            <div className="mt-12 text-center">
              <button
                onClick={() => setShowMatrixTable(!showMatrixTable)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-white transition-all cursor-pointer"
              >
                <Layers className="w-4 h-4 text-[#34D399]" />
                <span>
                  {showMatrixTable ? 'Tutup Matriks Fasilitas Lengkap' : `Bandingkan Seluruh ${facilities.length} Fasilitas Layanan`}
                </span>
                {showMatrixTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {/* Tabel Matriks Komparasi 21 Fasilitas */}
              {showMatrixTable && (
                <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] shadow-2xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="p-4 font-bold text-white text-sm">Katalog Fasilitas Layanan</th>
                        {plans.map((p) => (
                          <th key={p.id} className="p-4 font-bold text-white text-center">
                            <div>{p.display_name}</div>
                            <div className="text-[10px] font-mono text-slate-400 font-normal">
                              {p.plan_code}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {facilities.map((fac) => (
                        <tr key={fac.facility_key} className="hover:bg-white/[0.03] transition-colors">
                          <td className="p-4 font-medium text-slate-200">
                            {fac.display_name}
                          </td>
                          {plans.map((p) => {
                            const code = p.plan_code.toLowerCase();
                            const lvl = fac.levels[code] || fac.levels[p.plan_code] || 'none';
                            return (
                              <td key={p.id} className="p-4 text-center">
                                {getLevelBadge(lvl)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-12 text-center text-xs text-slate-400 max-w-xl mx-auto flex items-center justify-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#34D399] shrink-0" />
          <span>
            Setiap paket dilengkapi jaminan privasi data Row-Level Security dan enkripsi TLS 1.3 standar perbankan.
          </span>
        </div>
      </div>
    </section>
  );
};
