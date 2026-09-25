import React, { useState } from 'react';
import {
  FeatureHubScreen,
  CategoryCard
} from '@orchestree/ui';
import {
  Building2,
  Users,
  Brain,
  MessageSquare,
  ShieldCheck,
  Coins,
  ArrowLeft,
  Sparkles,
  Activity,
  Bot
} from 'lucide-react';
import { TenantRegistrationResponse } from '@/apps/client/types';
import { WorkforceHubScreen } from './workforce/WorkforceHubScreen';
import { BillingHubScreen } from './billing/BillingHubScreen';
import { ProactiveChannelsScreen } from './ProactiveChannelsScreen';
import { IntelligenceHubScreen } from './IntelligenceHubScreen';
import { HomeOverviewScreen } from './workforce/HomeOverviewScreen';
import { IntegrationsHubScreen } from './IntegrationsHubScreen';
import { CampaignBuilderScreen } from './CampaignBuilderScreen';
import { ServiceRequestScreen } from './ServiceRequestScreen';
import { EnterpriseHubScreen } from './EnterpriseHubScreen';
import { AIDataPermissionScreen } from './AIDataPermissionScreen';
import { UniversalSelectionHubScreen } from './selection/UniversalSelectionHubScreen';


interface TenantFeatureHubShellProps {
  tenant: TenantRegistrationResponse | null;
  onBackToLanding: () => void;
  onOpenOnboarding: () => void;
}

export const TenantFeatureHubShell: React.FC<TenantFeatureHubShellProps> = ({
  tenant,
  onBackToLanding,
  onOpenOnboarding,
}) => {
  const [activeRoute, setActiveRoute] = useState<string>('/hub');
  const [tenantTier, setTenantTier] = useState<{ tier_level: number; plan_code: string; is_enterprise: boolean } | null>(null);

  React.useEffect(() => {
    const tid = tenant?.tenant_id || '';
    fetch(`/api/v1/tenants/${tid}/subscription/tier`)
      .then(r => r.json())
      .then(data => {
        if (data && typeof data.tier_level === 'number') {
          setTenantTier(data);
        }
      })
      .catch(() => {});
  }, [tenant?.tenant_id]);

  if (activeRoute.startsWith('/performance') || activeRoute.startsWith('/overview')) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-white">
        <div className="max-w-7xl mx-auto px-4 pt-6 pb-12">
          <button
            onClick={() => setActiveRoute('/hub')}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white mb-6 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Feature Hub
          </button>
          <HomeOverviewScreen
            tenant={tenant}
            onNavigateDetail={(route) => setActiveRoute(route)}
          />
        </div>
      </div>
    );
  }

  if (activeRoute.startsWith('/workforce')) {
    return (
      <WorkforceHubScreen
        tenant={tenant}
        onBack={() => setActiveRoute('/hub')}
      />
    );
  }

  if (activeRoute.startsWith('/intelligence') || activeRoute.startsWith('/competitor')) {
    return (
      <IntelligenceHubScreen
        tenant={tenant}
        onBack={() => setActiveRoute('/hub')}
        defaultTab="competitor"
      />
    );
  }

  if (activeRoute.startsWith('/knowledge') || activeRoute.startsWith('/brain')) {
    return (
      <IntelligenceHubScreen
        tenant={tenant}
        onBack={() => setActiveRoute('/hub')}
        defaultTab="brain"
      />
    );
  }

  if (activeRoute.startsWith('/channels')) {
    return (
      <ProactiveChannelsScreen
        tenant={tenant}
        onBack={() => setActiveRoute('/hub')}
      />
    );
  }

  if (activeRoute.startsWith('/finance') || activeRoute.startsWith('/billing')) {
    return (
      <div className="min-h-screen bg-[#070D18]">
        <div className="max-w-7xl mx-auto px-4 pt-6">
          <button
            onClick={() => setActiveRoute('/hub')}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white mb-4 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Feature Hub
          </button>
        </div>
        <BillingHubScreen
          tenantId={tenant?.tenant_id || ''}
          tenantName={tenant?.display_name || tenant?.legal_name || 'Organisasi Aktif'}
          userRole={tenant?.role || 'TENANT_OWNER'}
        />
      </div>
    );
  }

  if (activeRoute.startsWith('/integrations') || activeRoute.startsWith('/connectors')) {
    return (
      <IntegrationsHubScreen
        tenant={tenant}
        onBack={() => setActiveRoute('/hub')}
      />
    );
  }

  if (activeRoute.startsWith('/marketing')) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-white">
        <div className="max-w-7xl mx-auto px-4 pt-6 pb-12">
          <button
            onClick={() => setActiveRoute('/hub')}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white mb-6 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Feature Hub
          </button>
          <CampaignBuilderScreen
            tenantId={tenant?.tenant_id || ''}
          />
        </div>
      </div>
    );
  }

  if (activeRoute.startsWith('/support') || activeRoute.startsWith('/service')) {
    return (
      <div className="min-h-screen bg-[#0B1220] text-white">
        <div className="max-w-7xl mx-auto px-4 pt-6 pb-12">
          <button
            onClick={() => setActiveRoute('/hub')}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white mb-6 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Feature Hub
          </button>
          <ServiceRequestScreen
            tenantId={tenant?.tenant_id || ''}
            onOpenInbox={() => setActiveRoute('/channels/integrations')}
          />
        </div>
      </div>
    );
  }

  if (activeRoute.startsWith('/enterprise')) {
    let defaultTab: 'chief_of_staff' | 'integration_fabric' | 'context_fabric' | 'enforcement' = 'chief_of_staff';
    if (activeRoute.includes('integration-fabric')) defaultTab = 'integration_fabric';
    if (activeRoute.includes('context-fabric')) defaultTab = 'context_fabric';
    if (activeRoute.includes('enforcement')) defaultTab = 'enforcement';

    return (
      <EnterpriseHubScreen
        tenant={tenant}
        onBack={() => {
          setActiveRoute('/hub');
          const tid = tenant?.tenant_id || '';
          fetch(`/api/v1/tenants/${tid}/subscription/tier`)
            .then(r => r.json())
            .then(data => {
              if (data && typeof data.tier_level === 'number') {
                setTenantTier(data);
              }
            })
            .catch(() => {});
        }}
        defaultTab={defaultTab}
      />
    );
  }

  if (activeRoute.startsWith('/security') || activeRoute.startsWith('/permissions')) {
    return (
      <AIDataPermissionScreen
        tenantId={tenant?.tenant_id || ''}
        tenantName={tenant?.display_name || tenant?.legal_name || 'Organisasi Aktif'}
        userRole={tenant?.role || 'TENANT_OWNER'}
        userId={tenant?.user_id}
        onBack={() => setActiveRoute('/hub')}
      />
    );
  }

  if (activeRoute.startsWith('/selection')) {
    return (
      <UniversalSelectionHubScreen
        tenantId={tenant?.tenant_id || ''}
        onBack={() => setActiveRoute('/hub')}
      />
    );
  }

  const isEnterprise = tenantTier?.is_enterprise ?? false;

  const categoryCards: CategoryCard[] = [
    {
      key: 'chief_of_staff',
      label: 'AI Chief of Staff & Morning Briefing (Arya)',
      icon: 'sparkles',
      route: '/enterprise/chief-of-staff',
      badgeCount: isEnterprise ? 1 : undefined,
      isLocked: !isEnterprise,
      tierRequired: 'ENTERPRISE',
      onUpgradeClick: () => setActiveRoute('/enterprise/chief-of-staff'),
    },
    {
      key: 'integration_fabric',
      label: 'Integration Fabric & CDC Real-Time (SAP/ERP)',
      icon: 'layers',
      route: '/enterprise/integration-fabric',
      badgeCount: isEnterprise ? 2 : undefined,
      isLocked: !isEnterprise,
      tierRequired: 'ENTERPRISE',
      onUpgradeClick: () => setActiveRoute('/enterprise/integration-fabric'),
    },
    {
      key: 'context_fabric',
      label: 'Company Context Fabric & AI Specialist (CFO)',
      icon: 'brain',
      route: '/enterprise/context-fabric',
      isLocked: !isEnterprise,
      tierRequired: 'ENTERPRISE',
      onUpgradeClick: () => setActiveRoute('/enterprise/context-fabric'),
    },
    {
      key: 'service',
      label: 'Layanan Pelanggan & Pengawasan Refund',
      icon: 'sparkles',
      route: '/support/service-requests',
      badgeCount: 2,
    },
    {
      key: 'marketing',
      label: 'Pemasaran, Kalender Konten & Marketplace',
      icon: 'sparkles',
      route: '/marketing/campaigns',
      badgeCount: 3,
    },
    {
      key: 'selection',
      label: 'Universal Selection, Dynamic Analytics & Insights',
      icon: 'sparkles',
      route: '/selection',
      badgeCount: 5,
    },
    {
      key: 'integrations',
      label: 'Integrasi Pihak Ketiga & Observasi Kerja',
      icon: 'sparkles',
      route: '/integrations',
      badgeCount: 9,
    },
    {
      key: 'performance',
      label: 'Evaluasi & Skor Kinerja Karyawan',
      icon: 'trending',
      route: '/performance',
    },
    {
      key: 'team',
      label: 'Staf AI & Tenaga Kerja',
      icon: 'users',
      route: '/workforce/staff',
      badgeCount: 15,
    },
    {
      key: 'operations',
      label: 'Orkestrasi & Alur Kerja',
      icon: 'briefcase',
      route: '/orchestrations/active',
      badgeCount: 3,
    },
    {
      key: 'intelligence',
      label: 'Intelijen Pesaing & Radar Pasar',
      icon: 'sparkles',
      route: '/intelligence',
      badgeCount: 4,
    },
    {
      key: 'brain',
      label: 'Company Brain & Memori',
      icon: 'brain',
      route: '/knowledge/brain',
    },
    {
      key: 'channels',
      label: 'Kanal WhatsApp & Telegram',
      icon: 'sparkles',
      route: '/channels/integrations',
    },
    {
      key: 'security',
      label: 'Keamanan & Izin Data AI (ABAC)',
      icon: 'shield',
      route: '/security/permissions',
      badgeCount: 8,
    },
    {
      key: 'billing',
      label: 'Pengukuran Kredit & Kuota',
      icon: 'credit',
      route: '/finance/credits',
    },
  ];

  const analyticsSlot = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
        <span className="text-xs font-semibold text-slate-400">Organisasi Terdaftar</span>
        <div className="text-lg font-bold text-white mt-1">
          {tenant?.display_name || 'Organisasi Aktif'}
        </div>
        <span className="text-[11px] text-[#34D399] font-mono mt-1 block">
          ID: {tenant?.tenant_id ? tenant.tenant_id.substring(0, 13) + '...' : 'Terhubung'}
        </span>
      </div>

      <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
        <span className="text-xs font-semibold text-slate-400">Status Akses Data</span>
        <div className="text-lg font-bold text-[#34D399] mt-1 flex items-center space-x-1.5">
          <ShieldCheck className="w-4 h-4 text-[#34D399]" />
          <span>Isolasi RLS Aktif</span>
        </div>
        <span className="text-[11px] text-slate-400 mt-1 block">Role: {tenant?.role || 'owner'}</span>
      </div>

      <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
        <span className="text-xs font-semibold text-slate-400">Jabatan AI Tersedia</span>
        <div className="text-lg font-bold text-white mt-1 flex items-center space-x-1.5">
          <Bot className="w-4 h-4 text-[#60A5FA]" />
          <span>15 Staf Terstandarisasi</span>
        </div>
        <span className="text-[11px] text-[#60A5FA] mt-1 block">Multi-LLM Smart Router</span>
      </div>

      <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
        <span className="text-xs font-semibold text-slate-400">Status Gateway Sistem</span>
        <div className="text-lg font-bold text-emerald-400 mt-1 flex items-center space-x-1.5">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>Operasional Normal</span>
        </div>
        <span className="text-[11px] text-slate-400 mt-1 block">TLS 1.3 & Supabase Auth</span>
      </div>
    </div>
  );

  const insightFeed = (
    <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-transparent border border-emerald-500/20">
      <div className="flex items-center space-x-2 text-xs font-bold text-[#34D399] mb-1">
        <Sparkles className="w-4 h-4" />
        <span>REKOMENDASI SISTEM ORKESTRASI</span>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">
        Selamat datang di ruang kerja <strong className="text-white">{tenant?.display_name || 'Organisasi Anda'}</strong>. Anda dapat mulai mengonfigurasikan Company Brain atau menghubungkan WhatsApp Cloud API untuk mengaktifkan staf AI komersial.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1220] text-white">
      {/* Top Bar for Tenant Shell */}
      <div className="border-b border-white/10 bg-[#0B1B2B]/80 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToLanding}
            className="text-xs font-semibold text-slate-300 hover:text-white flex items-center space-x-1 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Halaman Utama</span>
          </button>
          <span className="text-slate-600">|</span>
          <span className="text-xs font-bold text-white flex items-center space-x-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#34D399]" />
            <span>{tenant?.display_name || 'Organisasi Aktif'}</span>
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenOnboarding}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs text-slate-200 cursor-pointer"
          >
            Kelola Kode & Anggota
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <FeatureHubScreen
          domain="client"
          analyticsSlot={analyticsSlot}
          categoryCards={categoryCards}
          insightFeed={insightFeed}
          onNavigate={(route) => setActiveRoute(route)}
        />
      </div>
    </div>
  );
};
