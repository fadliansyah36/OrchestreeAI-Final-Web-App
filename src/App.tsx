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
  UserPlus,
  Home,
  LayoutGrid
} from 'lucide-react';
import { PublicLandingScreen } from './components/landing/PublicLandingScreen';
import { OnboardingWizard } from './components/OnboardingWizard';
import { TenantFeatureHubShell } from './components/TenantFeatureHubShell';
import { WorkforceHubScreen } from './components/WorkforceHubScreen';
import { KanbanBoardScreen } from './components/KanbanBoardScreen';
import { WebAuthnAttendanceScreen } from './components/WebAuthnAttendanceScreen';
import { BillingHubScreen } from './components/BillingHubScreen';
import { AdminConsoleMfa } from './components/AdminConsoleMfa';
import { StartupGateReport } from './components/StartupGateReport';
import { ProactiveChannelsScreen } from './components/ProactiveChannelsScreen';
import { IntelligenceHubScreen } from './components/IntelligenceHubScreen';
import { LeadPipelineScreen } from './components/LeadPipelineScreen';
import { PersonaConfigurationScreen } from './components/PersonaConfigurationScreen';
import { ProductCatalogScreen } from './components/ProductCatalogScreen';
import { OrderManagementScreen } from './components/OrderManagementScreen';
import { TenantRegistrationResponse } from './types';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeWorkspace, setActiveWorkspace] = useState<'client' | 'admin' | 'startup_gate'>('client');
  const [clientSubView, setClientSubView] = useState<'landing' | 'onboarding' | 'dashboard' | 'workforce' | 'kanban' | 'attendance' | 'billing' | 'proactive' | 'intelligence' | 'crm_pipeline' | 'crm_personas' | 'commerce_catalog' | 'commerce_orders'>('landing');
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>('FREE_TRIAL');
  const [activeTenant, setActiveTenant] = useState<TenantRegistrationResponse | null>(() => {
    const saved = localStorage.getItem('orchestree_active_tenant');
    return saved ? JSON.parse(saved) : null;
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const handleStartOnboarding = (planCode?: string) => {
    if (planCode) setSelectedPlanCode(planCode);
    setClientSubView('onboarding');
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#0B1220] text-white' : 'bg-slate-50 text-slate-900'} transition-colors duration-200`}>
      {/* Platform Top Navigation Bar */}
      <nav id="platform-navbar" className="border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B1220]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setActiveWorkspace('client');
                setClientSubView('landing');
              }}
              className="flex items-center gap-3 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                O
              </div>
              <div>
                <span className="font-bold tracking-tight text-lg text-slate-900 dark:text-white">
                  Orchestree<span className="text-emerald-500">.AI</span>
                </span>
                <span className="hidden sm:inline-block ml-2 text-[11px] uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                  Operating System
                </span>
              </div>
            </button>
          </div>

          {/* Workspace Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              id="workspace-btn-client"
              onClick={() => setActiveWorkspace('client')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeWorkspace === 'client'
                  ? 'bg-white dark:bg-emerald-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Ruang Kerja Tenant</span>
              <span className="md:hidden">Tenant</span>
            </button>

            <button
              type="button"
              id="workspace-btn-admin"
              onClick={() => setActiveWorkspace('admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeWorkspace === 'admin'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Super Admin</span>
              <span className="md:hidden">Admin</span>
            </button>

            <button
              type="button"
              id="workspace-btn-gate"
              onClick={() => setActiveWorkspace('startup_gate')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeWorkspace === 'startup_gate'
                  ? 'bg-white dark:bg-amber-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Startup Gate</span>
              <span className="md:hidden">Gate</span>
            </button>
          </div>

          {/* Theme Switcher & Status */}
          <div className="flex items-center gap-2">
            {activeWorkspace === 'client' && (
              <div className="hidden lg:flex items-center space-x-1 border-r border-slate-200 dark:border-slate-800 pr-3">
                <button
                  onClick={() => setClientSubView('landing')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'landing'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Homepage
                </button>
                <button
                  onClick={() => setClientSubView('onboarding')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'onboarding'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Onboarding
                </button>
                <button
                  onClick={() => setClientSubView('dashboard')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'dashboard'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Feature Hub
                </button>
                <button
                  onClick={() => setClientSubView('workforce')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'workforce'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Workforce Hub
                </button>
                <button
                  onClick={() => setClientSubView('kanban')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'kanban'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Papan Kanban
                </button>
                <button
                  onClick={() => setClientSubView('attendance')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'attendance'
                      ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Presensi WebAuthn
                </button>
                <button
                  onClick={() => setClientSubView('billing')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'billing'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Kredit & Billing
                </button>
                <button
                  onClick={() => setClientSubView('proactive')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'proactive'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Kanal & Proaktif
                </button>
                <button
                  onClick={() => setClientSubView('intelligence')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'intelligence'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Company Brain
                </button>
                <button
                  onClick={() => setClientSubView('crm_pipeline')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'crm_pipeline'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pipeline CRM
                </button>
                <button
                  onClick={() => setClientSubView('crm_personas')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'crm_personas'
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Persona AI
                </button>
                <button
                  onClick={() => setClientSubView('commerce_catalog')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'commerce_catalog'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Katalog Produk
                </button>
                <button
                  onClick={() => setClientSubView('commerce_orders')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    clientSubView === 'commerce_orders'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pesanan Pelanggan
                </button>
              </div>
            )}
            <button
              type="button"
              id="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label="Ganti tema tampilan"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="w-full">
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

            {clientSubView === 'dashboard' && (
              <TenantFeatureHubShell
                tenant={activeTenant}
                onBackToLanding={() => setClientSubView('landing')}
                onOpenOnboarding={() => setClientSubView('onboarding')}
              />
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
                onBack={() => setClientSubView('workforce')}
              />
            )}

            {clientSubView === 'attendance' && (
              <WebAuthnAttendanceScreen
                tenantId={activeTenant?.tenant_id || 'tenant_default_01'}
                membershipId={activeTenant?.membership_id || 'usr_default_admin'}
                userName={activeTenant?.owner_full_name || 'Anggota Organisasi'}
                onBack={() => setClientSubView('workforce')}
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
          </div>
        )}

        {/* Workspace: Super Admin Console with Mandatory MFA */}
        {activeWorkspace === 'admin' && (
          <div id="admin-workspace-view" className="py-2 max-w-7xl mx-auto">
            <div className="px-4 md:px-6 mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 bg-blue-950/40 border border-blue-900/60 px-3 py-1 rounded-lg">
                <Lock className="w-3.5 h-3.5" />
                <span>Konsol Kontrol Terisolasi • Autentikasi Dua Faktor Wajib (AAL2)</span>
              </div>
            </div>
            <AdminConsoleMfa />
          </div>
        )}

        {/* Workspace: Fail-Closed Startup Gate Report */}
        {activeWorkspace === 'startup_gate' && (
          <div id="startup-gate-view" className="max-w-7xl mx-auto">
            <StartupGateReport />
          </div>
        )}
      </main>
    </div>
  );
}
