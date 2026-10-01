import React, { useState } from 'react';
import {
  MessageSquare,
  Users,
  Share2,
  Layers,
  TrendingUp,
  Sliders,
  ShoppingBag,
  FileCheck,
  Megaphone,
  Headphones,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { LeadPipelineScreen } from './sales/LeadPipelineScreen';
import { PersonaConfigurationScreen } from './sales/PersonaConfigurationScreen';
import { ProductCatalogScreen } from './sales/ProductCatalogScreen';
import { OrderManagementScreen } from './sales/OrderManagementScreen';
import { CampaignBuilderScreen } from './CampaignBuilderScreen';
import { ServiceRequestScreen } from './ServiceRequestScreen';
import { SalesCoachScreen } from './SalesCoachScreen';
import { SalesGuardrailsScreen } from './SalesGuardrailsScreen';
import { RevenueIntelligenceScreen } from './RevenueIntelligenceScreen';
import { MessageExperimentScreen } from './MessageExperimentScreen';
import { OmnichannelInboxScreen } from './omnichannel/OmnichannelInboxScreen';
import { CustomerMergeReviewScreen } from './omnichannel/CustomerMergeReviewScreen';
import { ChannelAccountsScreen } from './omnichannel/ChannelAccountsScreen';
import { TenantRegistrationResponse } from '@/types';

export type OmnichannelTab =
  | 'INBOX'
  | 'PIPELINE'
  | 'PERSONAS'
  | 'CHANNELS'
  | 'MERGE_REVIEWS'
  | 'CATALOG'
  | 'ORDERS'
  | 'CAMPAIGNS'
  | 'SERVICES'
  | 'COACH'
  | 'GUARDRAILS'
  | 'REVENUE';

export interface OmnichannelHubScreenProps {
  tenant: TenantRegistrationResponse | null;
  initialTab?: OmnichannelTab;
  onBack?: () => void;
}

export const OmnichannelHubScreen: React.FC<OmnichannelHubScreenProps> = ({
  tenant,
  initialTab = 'INBOX',
  onBack
}) => {
  const [activeTab, setActiveTab] = useState<OmnichannelTab>(initialTab);
  const tenantId = tenant?.tenant_id || '';

  return (
    <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 w-full min-w-0 max-w-full overflow-hidden">
      {/* Top Banner & Header */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 w-full min-w-0">
        <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label="Kembali ke Beranda"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-sm shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h1 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight break-words">
                Pusat Penjualan &amp; Omnichannel
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                Layanan Customer Eksternal
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Pipeline CRM, AI handoff ke staf manusia, inbox percakapan pelanggan, dan katalog produk.
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900/90 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 self-start md:self-auto overflow-x-auto max-w-full w-full md:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('INBOX')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'INBOX'
                ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Kotak Masuk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PIPELINE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'PIPELINE'
                ? 'bg-white dark:bg-emerald-600 text-emerald-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Pipeline CRM</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PERSONAS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'PERSONAS'
                ? 'bg-white dark:bg-purple-600 text-purple-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Persona AI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CHANNELS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'CHANNELS'
                ? 'bg-white dark:bg-sky-600 text-sky-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Kanal Akun</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MERGE_REVIEWS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'MERGE_REVIEWS'
                ? 'bg-white dark:bg-amber-600 text-amber-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Review Merge</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CATALOG')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'CATALOG'
                ? 'bg-white dark:bg-teal-600 text-teal-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Katalog</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ORDERS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'ORDERS'
                ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Pesanan</span>
          </button>
        </div>
      </div>

      {/* Main Tab View */}
      {activeTab === 'INBOX' && (
        <OmnichannelInboxScreen tenantId={tenantId} />
      )}

      {activeTab === 'PIPELINE' && (
        <LeadPipelineScreen
          tenantId={tenantId}
          onOpenPersonas={() => setActiveTab('PERSONAS')}
        />
      )}

      {activeTab === 'PERSONAS' && (
        <PersonaConfigurationScreen
          tenantId={tenantId}
          onBackToPipeline={() => setActiveTab('PIPELINE')}
        />
      )}

      {activeTab === 'CHANNELS' && (
        <ChannelAccountsScreen tenantId={tenantId} />
      )}

      {activeTab === 'MERGE_REVIEWS' && (
        <CustomerMergeReviewScreen tenantId={tenantId} />
      )}

      {activeTab === 'CATALOG' && (
        <ProductCatalogScreen
          tenantId={tenantId}
          onOpenOrders={() => setActiveTab('ORDERS')}
        />
      )}

      {activeTab === 'ORDERS' && (
        <OrderManagementScreen
          tenantId={tenantId}
          onOpenCatalog={() => setActiveTab('CATALOG')}
        />
      )}

      {activeTab === 'CAMPAIGNS' && (
        <CampaignBuilderScreen tenantId={tenantId} />
      )}

      {activeTab === 'SERVICES' && (
        <ServiceRequestScreen
          tenantId={tenantId}
          onOpenInbox={() => setActiveTab('INBOX')}
        />
      )}

      {activeTab === 'COACH' && (
        <SalesCoachScreen tenantId={tenantId} />
      )}

      {activeTab === 'GUARDRAILS' && (
        <SalesGuardrailsScreen tenantId={tenantId} />
      )}

      {activeTab === 'REVENUE' && (
        <RevenueIntelligenceScreen tenantId={tenantId} />
      )}
    </div>
  );
};
