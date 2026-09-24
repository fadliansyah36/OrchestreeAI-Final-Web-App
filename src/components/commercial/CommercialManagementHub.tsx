import React, { useState } from 'react';
import {
  DollarSign,
  Layers,
  Grid,
  Cpu,
  CreditCard,
  ShieldAlert,
  BarChart3,
  TrendingUp,
  Sparkles,
  Building2,
  Lock,
  ChevronRight
} from 'lucide-react';
import { FinancialCommandCenter } from '../FinancialCommandCenter';
import { SubscriptionPlanScreen } from './SubscriptionPlanScreen';
import { PlanFacilityMatrixScreen } from './PlanFacilityMatrixScreen';
import { CreditFormulaConfigScreen } from './CreditFormulaConfigScreen';
import { CreditTopupPackageScreen } from './CreditTopupPackageScreen';
import { TenantCreditOverrideScreen } from './TenantCreditOverrideScreen';

export type CommercialTab =
  | 'financial-summary'
  | 'subscription-plans'
  | 'facility-matrix'
  | 'credit-formula'
  | 'topup-packages'
  | 'credit-overrides';

interface CommercialManagementHubProps {
  initialTab?: CommercialTab;
}

export function CommercialManagementHub({ initialTab = 'financial-summary' }: CommercialManagementHubProps) {
  const [activeTab, setActiveTab] = useState<CommercialTab>(initialTab);

  const tabs: Array<{ id: CommercialTab; label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = [
    {
      id: 'financial-summary',
      label: 'Ringkasan Finansial',
      icon: DollarSign,
      description: 'Neraca likuiditas kredit, MRR, dan rekonsiliasi gateway',
    },
    {
      id: 'subscription-plans',
      label: 'Paket Langganan',
      icon: Layers,
      description: 'Pengaturan 5 tingkatan paket dan kuota',
    },
    {
      id: 'facility-matrix',
      label: 'Matriks Fasilitas',
      icon: Grid,
      description: 'Pemetaan hak akses fitur lintas paket',
    },
    {
      id: 'credit-formula',
      label: 'Formula Kredit AI',
      icon: Cpu,
      description: 'Baseline metering aktivitas & pengali model/alat',
    },
    {
      id: 'topup-packages',
      label: 'Paket Top-Up',
      icon: CreditCard,
      description: 'Katalog paket pembelian kredit on-demand',
    },
    {
      id: 'credit-overrides',
      label: 'Override & Penyesuaian',
      icon: ShieldAlert,
      description: 'Unlimited override & kompensasi saldo khusus',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Navigation */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0B1220] via-[#0E1726] to-[#0B1220] border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                Pusat Tata Kelola Komersial
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400 font-mono">Real Ledger Enforcement</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Manajemen Komersial & Likuiditas AI</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Pusat kendali penetapan harga paket, matriks fitur, formula penagihan kredit otonom, dan hak istimewa akun organisasi.
            </p>
          </div>
        </div>

        {/* Tab Pills */}
        <div className="relative z-10 flex items-center gap-2 overflow-x-auto pt-6 mt-2 border-t border-slate-800/80">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40 border border-emerald-500'
                    : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Screen Rendering */}
      <div>
        {activeTab === 'financial-summary' && <FinancialCommandCenter />}
        {activeTab === 'subscription-plans' && <SubscriptionPlanScreen />}
        {activeTab === 'facility-matrix' && <PlanFacilityMatrixScreen />}
        {activeTab === 'credit-formula' && <CreditFormulaConfigScreen />}
        {activeTab === 'topup-packages' && <CreditTopupPackageScreen />}
        {activeTab === 'credit-overrides' && <TenantCreditOverrideScreen />}
      </div>
    </div>
  );
}
