import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  Activity,
  Sparkles,
  Sun,
  Moon,
  Lock,
  Terminal,
  Home,
  LayoutGrid,
  Briefcase,
  Bell,
  User,
  ArrowLeft
} from 'lucide-react';
import { OrchNavBar, OrchBottomNav, AdminSuperHubScreen, OrchIntlProvider } from '@orchestree/ui';
import { PublicLandingScreen } from './components/landing/PublicLandingScreen';
import { OnboardingWizard } from './components/OnboardingWizard';
import { HomeOverviewScreen } from './components/HomeOverviewScreen';
import { AdminOverviewScreen } from './components/AdminOverviewScreen';
import { WorkforceHubScreen } from './components/WorkforceHubScreen';
import { KanbanBoardScreen } from './components/KanbanBoardScreen';
import { WebAuthnAttendanceScreen } from './components/WebAuthnAttendanceScreen';
import { BillingHubScreen } from './components/BillingHubScreen';
import { AdminConsoleMfa } from './components/AdminConsoleMfa';
import { FinancialCommandCenter } from './components/FinancialCommandCenter';
import { StartupGateReport } from './components/StartupGateReport';
import { ProactiveChannelsScreen } from './components/ProactiveChannelsScreen';
import { IntelligenceHubScreen } from './components/IntelligenceHubScreen';
import { LeadPipelineScreen } from './components/LeadPipelineScreen';
import { PersonaConfigurationScreen } from './components/PersonaConfigurationScreen';
import { ProductCatalogScreen } from './components/ProductCatalogScreen';
import { OrderManagementScreen } from './components/OrderManagementScreen';
import { CampaignBuilderScreen } from './components/CampaignBuilderScreen';
import { ServiceRequestScreen } from './components/ServiceRequestScreen';
import { RevenueIntelligenceScreen } from './components/RevenueIntelligenceScreen';
import { SalesCoachScreen } from './components/SalesCoachScreen';
import { MessageExperimentScreen } from './components/MessageExperimentScreen';
import { SalesGuardrailsScreen } from './components/SalesGuardrailsScreen';
import { UniversalSelectionHubScreen } from './components/UniversalSelectionHubScreen';
import { GenerativeStudioHubScreen } from './components/GenerativeStudioHubScreen';
import { AIDataPermissionScreen } from './components/AIDataPermissionScreen';
import { TokenOptimizationScreen } from './components/TokenOptimizationScreen';
import { AgentBlueprintCatalogScreen } from './components/AgentBlueprintCatalogScreen';
import { EnterpriseHubScreen } from './components/EnterpriseHubScreen';
import { IntegrationsHubScreen } from './components/IntegrationsHubScreen';
import { DataQualityCenterScreen } from './components/DataQualityCenterScreen';
import { OmnichannelHubScreen } from './components/OmnichannelHubScreen';
import { JobTitleReconciliationPanel } from './components/JobTitleReconciliationPanel';
import { TenantRegistrationResponse } from './types';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('orchestree_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    }
    return 'dark';
  });

  const [activeWorkspace, setActiveWorkspace] = useState<'client' | 'admin' | 'startup_gate'>('client');
  const [clientSubView, setClientSubView] = useState<string>('landing');
  const [adminSubView, setAdminSubView] = useState<string>('admin_overview');
  const [isNavMenuOpen, setIsNavMenuOpen] = useState<boolean>(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>('FREE_TRIAL');

  const [activeTenant, setActiveTenant] = useState<TenantRegistrationResponse | null>(() => {
    try {
      const saved = localStorage.getItem('orchestree_active_tenant');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Real-time badge counts
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [pendingTasksCount, setPendingTasksCount] = useState<number>(0);

  // Sync theme with DOM and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('orchestree_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Fetch real badge metrics for tenant
  useEffect(() => {
    if (activeWorkspace !== 'client' || !activeTenant?.tenant_id) return;
    const tid = activeTenant.tenant_id;

    const fetchBadges = async () => {
      try {
        const res = await fetch(`/api/v1/tenants/${tid}/performance/overview`);
        if (res.ok) {
          const data = await res.json();
          if (data?.alerts) {
            setUnreadAlertsCount(data.alerts.filter((a: any) => a.status === 'active').length);
          }
          if (data?.summary) {
            const pending = (data.summary.tasks_assigned || 0) - (data.summary.tasks_completed || 0);
            setPendingTasksCount(Math.max(0, pending));
          }
        }
      } catch {
        // keep existing counts
      }
    };

    fetchBadges();
  }, [activeWorkspace, activeTenant?.tenant_id]);

  const handleStartOnboarding = (planCode?: string) => {
    if (planCode) setSelectedPlanCode(planCode);
    setClientSubView('onboarding');
  };

  // Bottom Nav handlers
  const handleClientBottomNav = (id: string) => {
    if (id === 'home') setClientSubView('dashboard');
    else if (id === 'work') setClientSubView('kanban');
    else if (id === 'ask_ai') setClientSubView('dashboard'); // triggers Ask AI docked bar on home overview
    else if (id === 'activity') setClientSubView('proactive');
    else if (id === 'account') setClientSubView('billing');
  };

  const handleAdminBottomNav = (id: string) => {
    if (id === 'admin_overview') setAdminSubView('admin_overview');
    else if (id === 'admin_tenants') setAdminSubView('admin_tenants');
    else if (id === 'admin_system') setAdminSubView('admin_system');
    else if (id === 'admin_finance') setAdminSubView('admin_finance');
    else if (id === 'admin_account') setAdminSubView('admin_mfa');
  };

  // Determine active Bottom Nav item
  const getActiveClientBottomId = () => {
    if (clientSubView === 'dashboard') return 'home';
    if (clientSubView === 'workforce' || clientSubView === 'kanban' || clientSubView === 'attendance') return 'work';
    if (clientSubView === 'proactive' || clientSubView === 'service_requests') return 'activity';
    if (clientSubView === 'billing' || clientSubView === 'permissions') return 'account';
    return 'home';
  };

  const isPublicPage = activeWorkspace === 'client' && (clientSubView === 'landing' || clientSubView === 'onboarding');

  return (
    <OrchIntlProvider>
      <div className={`min-h-screen max-w-full overflow-x-hidden ${theme === 'dark' ? 'dark bg-[#0B1220] text-white' : 'bg-slate-50 text-slate-900'} transition-colors duration-200`}>
      {/* Platform Top Navigation Bar */}
      <nav
        id="platform-navbar"
        className="border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B1220]/90 backdrop-blur sticky top-0 z-30 w-full"
      >
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-4">
          {/* Logo Brand */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <button
              onClick={() => {
                setActiveWorkspace('client');
                setClientSubView(activeTenant ? 'dashboard' : 'landing');
              }}
              className="flex items-center gap-2 sm:gap-2.5 cursor-pointer text-left shrink-0"
              title="OrchestreeAI Beranda"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold text-sm sm:text-lg shadow-sm shrink-0">
                O
              </div>
              <div className="flex items-center">
                <span className="font-bold tracking-tight text-sm sm:text-lg text-slate-900 dark:text-white">
                  Orchestree<span className="text-emerald-500">.AI</span>
                </span>
                <span className="hidden lg:inline-block ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                  Sistem Operasi
                </span>
              </div>
            </button>
          </div>

          {/* Workspace Switcher */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-100 dark:bg-slate-900/90 p-0.5 sm:p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              id="workspace-btn-client"
              onClick={() => {
                setActiveWorkspace('client');
                if (clientSubView === 'landing' && activeTenant) {
                  setClientSubView('dashboard');
                }
              }}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeWorkspace === 'client'
                  ? 'bg-white dark:bg-emerald-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Ruang Kerja Tenant"
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Ruang Kerja Tenant</span>
              <span className="hidden sm:inline md:hidden">Tenant</span>
            </button>

            <button
              type="button"
              id="workspace-btn-admin"
              onClick={() => setActiveWorkspace('admin')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeWorkspace === 'admin'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Super Admin"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Super Admin</span>
              <span className="hidden sm:inline md:hidden">Admin</span>
            </button>

            <button
              type="button"
              id="workspace-btn-gate"
              onClick={() => setActiveWorkspace('startup_gate')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeWorkspace === 'startup_gate'
                  ? 'bg-white dark:bg-amber-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Gerbang Kesiapan"
            >
              <Terminal className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Gerbang Kesiapan</span>
              <span className="hidden sm:inline md:hidden">Kesiapan</span>
            </button>
          </div>

          {/* Right Action: Menu Trigger & Theme Toggle */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {!isPublicPage && (
              <button
                type="button"
                id="open-orch-navbar-btn"
                onClick={() => setIsNavMenuOpen(true)}
                className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shrink-0"
                title="Buka menu navigasi seluruh domain"
              >
                <LayoutGrid className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="hidden lg:inline">Menu Domain</span>
              </button>
            )}

            <button
              type="button"
              id="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label="Ganti tema tampilan"
              className="p-1.5 sm:p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* OrchNavBar Drawer: Navigasi Lengkap Seluruh Domain */}
      <OrchNavBar
        isOpen={isNavMenuOpen}
        onClose={() => setIsNavMenuOpen(false)}
        mode={activeWorkspace === 'admin' ? 'admin' : 'client'}
        currentRoute={activeWorkspace === 'admin' ? adminSubView : clientSubView}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={(route) => {
          if (activeWorkspace === 'admin') {
            setAdminSubView(route);
          } else {
            setClientSubView(route);
          }
        }}
        tenantTier="GROWTH"
      />

      {/* Main Content Area */}
      <main className="w-full min-w-0 max-w-full overflow-x-hidden pb-24 sm:pb-16">
        {/* Workspace: Client Tenant PWA */}
        {activeWorkspace === 'client' && (
          <div id="client-workspace-view">
            {clientSubView === 'landing' && (
              <PublicLandingScreen
                onStartOnboarding={handleStartOnboarding}
                onOpenLogin={() => setClientSubView('onboarding')}
                onViewStartupGate={() => setActiveWorkspace('startup_gate')}
                onLoginSuccess={(tenant) => {
                  setActiveTenant(tenant);
                  setClientSubView('dashboard');
                }}
              />
            )}

            {clientSubView === 'onboarding' && (
              <div className="py-4">
                <OnboardingWizard
                  initialPlanCode={selectedPlanCode}
                  onEnterDashboard={(tenant) => {
                    setActiveTenant(tenant);
                    setClientSubView('dashboard');
                  }}
                  onBackToLanding={() => setClientSubView('landing')}
                />
              </div>
            )}

            {/* Dashboard: HomeOverviewScreen */}
            {clientSubView === 'dashboard' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <HomeOverviewScreen
                  tenant={activeTenant}
                  onNavigateDetail={(target) => setClientSubView(target)}
                />
              </div>
            )}

            {clientSubView === 'workforce' && (
              <WorkforceHubScreen
                tenant={activeTenant}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {clientSubView === 'kanban' && (
              <KanbanBoardScreen
                tenantId={activeTenant?.tenant_id || 'tenant_default_01'}
                currentUserId={activeTenant?.membership_id || 'usr_default_admin'}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {clientSubView === 'attendance' && (
              <WebAuthnAttendanceScreen
                tenantId={activeTenant?.tenant_id || 'tenant_default_01'}
                membershipId={activeTenant?.membership_id || 'usr_default_admin'}
                userName={activeTenant?.owner_full_name || 'Anggota Organisasi'}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {clientSubView === 'billing' && (
              <BillingHubScreen
                tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                tenantName={activeTenant?.display_name || activeTenant?.legal_name || 'Organisasi Aktif'}
                userRole={activeTenant?.role || 'TENANT_OWNER'}
              />
            )}

            {clientSubView === 'proactive' && (
              <ProactiveChannelsScreen
                tenant={activeTenant}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {(clientSubView === 'omnichannel' || clientSubView === 'sales-marketing') && (
              <OmnichannelHubScreen
                tenant={activeTenant}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {clientSubView === 'analytics' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <HomeOverviewScreen
                  tenant={activeTenant}
                  onNavigateDetail={(target) => setClientSubView(target)}
                />
              </div>
            )}

            {clientSubView === 'intelligence' && (
              <IntelligenceHubScreen
                tenant={activeTenant}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {clientSubView === 'crm_pipeline' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <LeadPipelineScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                  onOpenPersonas={() => setClientSubView('crm_personas')}
                />
              </div>
            )}

            {clientSubView === 'crm_personas' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <PersonaConfigurationScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                  onBackToPipeline={() => setClientSubView('crm_pipeline')}
                />
              </div>
            )}

            {clientSubView === 'commerce_catalog' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <ProductCatalogScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                  onOpenOrders={() => setClientSubView('commerce_orders')}
                />
              </div>
            )}

            {clientSubView === 'commerce_orders' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <OrderManagementScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                  onOpenCatalog={() => setClientSubView('commerce_catalog')}
                />
              </div>
            )}

            {clientSubView === 'marketing_campaigns' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <CampaignBuilderScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                />
              </div>
            )}

            {clientSubView === 'service_requests' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <ServiceRequestScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                  onOpenInbox={() => setClientSubView('proactive')}
                />
              </div>
            )}

            {clientSubView === 'revenue_intelligence' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <RevenueIntelligenceScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                />
              </div>
            )}

            {clientSubView === 'sales_coach' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <SalesCoachScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                />
              </div>
            )}

            {clientSubView === 'message_experiments' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <MessageExperimentScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                />
              </div>
            )}

            {clientSubView === 'sales_guardrails' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <SalesGuardrailsScreen
                  tenantId={activeTenant?.tenant_id || 'tenant-alpha-001'}
                />
              </div>
            )}

            {clientSubView === 'selection' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <UniversalSelectionHubScreen
                  tenant={activeTenant}
                />
              </div>
            )}

            {clientSubView === 'generative' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <GenerativeStudioHubScreen
                  tenant={activeTenant}
                />
              </div>
            )}

            {clientSubView === 'permissions' && (
              <AIDataPermissionScreen
                tenantId={activeTenant?.tenant_id || 'd1159d6d-0044-42ea-8007-d549a0011402'}
                tenantName={activeTenant?.display_name || activeTenant?.legal_name || 'Organisasi Aktif'}
                userRole={activeTenant?.role || 'TENANT_OWNER'}
                userId={activeTenant?.user_id}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {clientSubView === 'tokenopt' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <TokenOptimizationScreen
                  tenantId={activeTenant?.tenant_id || 'd1159d6d-0044-42ea-8007-d549a0011402'}
                />
              </div>
            )}

            {clientSubView === 'agentcat' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <AgentBlueprintCatalogScreen
                  tenantId={activeTenant?.tenant_id || 'd1159d6d-0044-42ea-8007-d549a0011402'}
                  isSuperAdmin={false}
                />
              </div>
            )}

            {clientSubView === 'enterprise' && (
              <EnterpriseHubScreen
                tenant={activeTenant}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {clientSubView === 'integrations' && (
              <IntegrationsHubScreen
                tenant={activeTenant}
                onBack={() => setClientSubView('dashboard')}
              />
            )}

            {clientSubView === 'data_quality' && (
              <DataQualityCenterScreen
                tenant={activeTenant}
                onBack={() => setClientSubView('dashboard')}
              />
            )}
          </div>
        )}

        {/* Workspace: Super Admin Console */}
        {activeWorkspace === 'admin' && (
          <div id="admin-workspace-view" className="py-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {adminSubView === 'admin_overview' && (
              <AdminOverviewScreen
                onNavigateDetail={(route) => setAdminSubView(route)}
                onNavigateTab={(tab) => setAdminSubView(tab)}
              />
            )}

            {adminSubView === 'admin_super_hub' && (
              <AdminSuperHubScreen
                initialTab="overview"
                onNavigate={(tab) => {
                  if (tab === 'overview') setAdminSubView('admin_overview');
                }}
              />
            )}

            {adminSubView === 'admin_tenants' && (
              <AdminSuperHubScreen
                initialTab="tenants"
                onNavigate={(tab) => {
                  if (tab === 'overview') setAdminSubView('admin_overview');
                }}
              />
            )}

            {adminSubView === 'admin_prospects' && (
              <AdminSuperHubScreen
                initialTab="prospects-trial"
                onNavigate={(tab) => {
                  if (tab === 'overview') setAdminSubView('admin_overview');
                }}
              />
            )}

            {adminSubView === 'admin_model_routing' && (
              <AdminSuperHubScreen
                initialTab="llm-routing"
                onNavigate={(tab) => {
                  if (tab === 'overview') setAdminSubView('admin_overview');
                }}
              />
            )}

            {adminSubView === 'admin_system' && (
              <StartupGateReport />
            )}

            {adminSubView === 'admin_finance' && (
              <FinancialCommandCenter />
            )}

            {adminSubView === 'admin_mfa' && (
              <AdminConsoleMfa />
            )}

            {adminSubView === 'admin_agent_catalog' && (
              <AgentBlueprintCatalogScreen
                tenantId="d1159d6d-0044-42ea-8007-d549a0011402"
                isSuperAdmin={true}
              />
            )}

            {adminSubView === 'admin_tokenopt' && (
              <TokenOptimizationScreen
                tenantId="d1159d6d-0044-42ea-8007-d549a0011402"
              />
            )}

            {adminSubView === 'admin_mcp' && (
              <AdminSuperHubScreen
                initialTab="mcp-governance"
                onNavigate={(tab) => {
                  if (tab === 'overview') setAdminSubView('admin_overview');
                }}
              />
            )}

            {adminSubView === 'admin_master_data' && (
              <div className="py-4">
                <JobTitleReconciliationPanel
                  tenantId={activeTenant?.tenant_id || 'd1159d6d-0044-42ea-8007-d549a0011402'}
                  userRole="SUPER_ADMIN"
                />
              </div>
            )}

            {(adminSubView === 'admin_commercial') && (
              <FinancialCommandCenter />
            )}

            {(adminSubView === 'admin_security') && (
              <AdminConsoleMfa />
            )}

            {(adminSubView === 'admin_monitoring') && (
              <StartupGateReport />
            )}

            {adminSubView === 'admin_integrations' && (
              <IntegrationsHubScreen
                tenant={null}
                onBack={() => setAdminSubView('admin_overview')}
              />
            )}

            {adminSubView === 'admin_data_quality' && (
              <DataQualityCenterScreen
                tenant={null}
                onBack={() => setAdminSubView('admin_overview')}
              />
            )}
          </div>
        )}

        {/* Workspace: Fail-Closed Startup Gate Report */}
        {activeWorkspace === 'startup_gate' && (
          <div id="startup-gate-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <StartupGateReport />
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar (Persistent on Dashboard views) */}
      {!isPublicPage && (
        <OrchBottomNav
          mode={activeWorkspace === 'admin' ? 'admin' : 'client'}
          activeId={activeWorkspace === 'admin' ? adminSubView : getActiveClientBottomId()}
          onSelect={(id) => {
            if (activeWorkspace === 'admin') {
              handleAdminBottomNav(id);
            } else {
              handleClientBottomNav(id);
            }
          }}
          unreadCount={unreadAlertsCount}
          pendingTasksCount={pendingTasksCount}
        />
      )}
      </div>
    </OrchIntlProvider>
  );
}
