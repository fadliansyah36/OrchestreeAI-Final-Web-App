import React from 'react';
import {
  ShieldCheck,
  Check,
  X,
  Crown,
  Sparkles,
  ArrowUpRight,
  Layers,
  Lock,
  Zap,
} from 'lucide-react';

export interface SubscriptionPlan {
  id: string;
  plan_code: string;
  tier_level: number;
  display_name: string;
  monthly_price_idr: number | null;
  ai_credit_allowance: number | null;
  human_staff_limit: number | null;
  ai_agent_limit: number | null;
  is_trial: boolean;
  trial_duration_days: number | null;
  is_custom_quote: boolean;
  display_order: number;
  currency?: string;
  facilities: Record<string, string>;
}

interface PlanFacilitiesScreenProps {
  plans: SubscriptionPlan[];
  activePlanCode?: string;
  onUpgradeClick?: (planCode: string) => void;
}

export function PlanFacilitiesScreen({
  plans,
  activePlanCode = 'TRIAL',
  onUpgradeClick,
}: PlanFacilitiesScreenProps) {
  // 21 Fasilitas Platform Resmi OrchestreeAI
  const facilityCatalog = [
    { key: 'crm_leads', label: 'CRM Leads & Pipeline Manajemen Pelanggan' },
    { key: 'omnichannel_chat', label: 'Omnichannel Chat WhatsApp & Medsos' },
    { key: 'generative_studio', label: 'Studio Konten & Kreatif Generatif' },
    { key: 'universal_selection', label: 'Seleksi Cerdas Dokumen & Kandidat' },
    { key: 'autonomous_swarm', label: 'Kolaborasi Multi-Agen Otonom' },
    { key: 'priority_support', label: 'Dukungan Prioritas SLA 24/7' },
    { key: 'custom_domain', label: 'Kustom Domain Organisasi & SSL Dedicated' },
  ];

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'unlimited':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Check className="w-3 h-3 text-emerald-400" />
            <span>Tanpa Batas</span>
          </span>
        );
      case 'advanced':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
            <Check className="w-3 h-3 text-cyan-400" />
            <span>Lengkap</span>
          </span>
        );
      case 'basic':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full">
            <Check className="w-3 h-3 text-slate-400" />
            <span>Standar</span>
          </span>
        );
      case 'limited':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            <span>Terbatas</span>
          </span>
        );
      case 'none':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Terkunci</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <span>Paket Berlangganan & Matriks Fasilitas Platform</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Transparansi penuh fasilitas platform. Fasilitas yang belum tersedia pada paket Anda ditampilkan jelas dengan opsi upgrade langsung.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Paket Aktif Saat Ini: <strong className="text-white uppercase">{activePlanCode}</strong></span>
        </div>
      </div>

      {/* Grid Kartu Paket */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => {
          const isActive = p.plan_code.toUpperCase() === activePlanCode.toUpperCase();
          const isEnterprise = p.tier_level >= 3;

          return (
            <div
              key={p.id}
              className={`rounded-2xl p-6 border flex flex-col justify-between transition-all ${
                isActive
                  ? 'bg-slate-850 border-emerald-500 ring-1 ring-emerald-500 shadow-xl shadow-emerald-500/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {p.plan_code}
                  </span>
                  {isActive && (
                    <span className="px-2 py-0.5 bg-emerald-500 text-slate-950 font-bold text-[10px] rounded-full">
                      Paket Aktif
                    </span>
                  )}
                </div>

                <h4 className="text-lg font-bold text-white mt-1">{p.display_name}</h4>

                <div className="mt-4">
                  {p.is_custom_quote ? (
                    <div>
                      <span className="text-2xl font-bold text-white">Hubungi Tim</span>
                      <span className="text-xs text-slate-400 block mt-0.5">Penawaran Kustom Korporat</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-2xl font-bold text-white">
                        Rp {p.monthly_price_idr?.toLocaleString('id-ID') || 0}
                      </span>
                      <span className="text-xs text-slate-400 block mt-0.5">/ bulan operasional</span>
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-2.5 text-xs text-slate-300 border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Alokasi Kredit AI:</span>
                    <span className="font-semibold text-emerald-400">
                      {p.ai_credit_allowance?.toLocaleString('id-ID') || '50.000'} AI Credits
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Limit Agen AI:</span>
                    <span className="font-semibold text-white">{p.ai_agent_limit || 1} Agen</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Limit Staf Manusia:</span>
                    <span className="font-semibold text-white">{p.human_staff_limit || 3} Pengguna</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800">
                {isActive ? (
                  <div className="w-full py-2 px-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-xl text-center">
                    Paket Sedang Aktif
                  </div>
                ) : (
                  <button
                    onClick={() => onUpgradeClick && onUpgradeClick(p.plan_code)}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-slate-700 hover:border-slate-600"
                  >
                    <span>Pilih Paket Ini</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabel Matriks Fasilitas Lengkap (Prinsip Transparansi) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="text-base font-bold text-white">Matriks Hak Akses Fasilitas Platform</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Rincian ketersediaan fitur berdasarkan tingkat paket langganan organisasi.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-5 font-semibold">Fasilitas Platform</th>
                {plans.map((p) => (
                  <th key={p.id} className="py-3 px-4 font-semibold text-center whitespace-nowrap">
                    {p.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {facilityCatalog.map((fac) => (
                <tr key={fac.key} className="hover:bg-slate-850/50 transition-colors">
                  <td className="py-3 px-5 font-medium text-slate-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{fac.label}</span>
                    </div>
                  </td>
                  {plans.map((p) => {
                    const level = p.facilities?.[fac.key] || 'none';
                    const isLocked = level === 'none';

                    return (
                      <td key={p.id} className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {getLevelBadge(level)}
                          {isLocked && p.plan_code.toUpperCase() === activePlanCode.toUpperCase() && (
                            <button
                              onClick={() => onUpgradeClick && onUpgradeClick('PRO')}
                              className="text-[10px] text-amber-400 hover:text-amber-300 underline font-medium mt-0.5"
                            >
                              Tingkatkan Paket
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
