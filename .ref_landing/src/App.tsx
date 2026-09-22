import React, { useState } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext';
import { DashboardErrorBoundary } from './components/ErrorBoundary';
import { AdminSidebar, AdminScreenType } from './components/layout/AdminSidebar';
import { AdminHeader } from './components/layout/AdminHeader';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardOverviewScreen } from './screens/DashboardOverviewScreen';
import { AdminAnalyticsDashboardScreen } from './screens/AdminAnalyticsDashboardScreen';
import { TenantManagementScreen } from './screens/TenantManagementScreen';
import { LlmProviderManagementScreen } from './screens/LlmProviderManagementScreen';
import { McpToolRegistryManagementScreen } from './screens/McpToolRegistryManagementScreen';
import { ThirdPartyAppRegistryManagementScreen } from './screens/ThirdPartyAppRegistryManagementScreen';
import { MasterDataManagementScreen } from './screens/MasterDataManagementScreen';
import { SkillPluginManagementScreen } from './screens/SkillPluginManagementScreen';
import { UsageCostDashboardScreen } from './screens/UsageCostDashboardScreen';
import { SecurityAuditCenterScreen } from './screens/SecurityAuditCenterScreen';
import { WorkflowTracingScreen } from './screens/WorkflowTracingScreen';
import { MemoryManagementScreen } from './screens/MemoryManagementScreen';
import { DeadLetterAndReplayScreen } from './screens/DeadLetterAndReplayScreen';
import { PaymentReconciliationScreen } from './screens/PaymentReconciliationScreen';
import { CommercialPlanManagementScreen } from './screens/CommercialPlanManagementScreen';
import { CreditMeteringConfigurationScreen } from './screens/CreditMeteringConfigurationScreen';
import { TenantCreditOverrideScreen } from './screens/TenantCreditOverrideScreen';
import { FinancialCommandCenterScreen } from './screens/FinancialCommandCenterScreen';
import { ProspectManagementScreen } from './screens/ProspectManagementScreen';
import { PublicLandingScreen } from './screens/PublicLandingScreen';
import { TenantWorkforceMonitoringScreen } from './screens/TenantWorkforceMonitoringScreen';
import { SystemMonitoringCenterScreen } from './screens/SystemMonitoringCenterScreen';

function isAdminPath(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();

  return (
    path.startsWith('/admin') ||
    hash.startsWith('#/admin') ||
    hash.startsWith('#admin') ||
    search.includes('admin=true') ||
    search.includes('view=admin')
  );
}

const MainDashboardApp: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<AdminScreenType>('overview');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-mono">Memverifikasi Sesi Super Admin...</p>
        </div>
      </div>
    );
  }

  // Enforce SUPER_ADMIN Role & MFA Check (Fail-Closed Architecture)
  if (!user || user.role !== 'SUPER_ADMIN' || !user.isMfaVerified) {
    return <LoginScreen />;
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'overview':
        return <AdminAnalyticsDashboardScreen />;
      case 'system_monitoring':
        return <SystemMonitoringCenterScreen />;
      case 'tenant_workforce':
        return <TenantWorkforceMonitoringScreen />;
      case 'prospect_registrations':
        return <ProspectManagementScreen />;
      case 'commercial_plans':
        return <CommercialPlanManagementScreen />;
      case 'credit_metering':
        return <CreditMeteringConfigurationScreen />;
      case 'tenant_credit_override':
        return <TenantCreditOverrideScreen />;
      case 'financial_command_center':
        return <FinancialCommandCenterScreen />;
      case 'payment_reconciliation':
        return <PaymentReconciliationScreen />;
      case 'dead_letter_queue':
        return <DeadLetterAndReplayScreen />;
      case 'tenants':
        return <TenantManagementScreen />;
      case 'llm_providers':
        return <LlmProviderManagementScreen />;
      case 'mcp_tools':
        return <McpToolRegistryManagementScreen />;
      case 'app_registry':
        return <ThirdPartyAppRegistryManagementScreen />;
      case 'master_data':
        return <MasterDataManagementScreen />;
      case 'skill_plugins':
        return <SkillPluginManagementScreen />;
      case 'usage_cost':
        return <UsageCostDashboardScreen />;
      case 'security_audit':
        return <SecurityAuditCenterScreen />;
      case 'workflow_tracing':
        return <WorkflowTracingScreen />;
      case 'memory_management':
        return <MemoryManagementScreen />;
      default:
        return <DashboardOverviewScreen />;
    }
  };

  const getScreenTitle = () => {
    switch (currentScreen) {
      case 'overview':
        return { title: 'Platform Analytics & Intelligence', subtitle: 'SSOT cross-tenant revenue, usage credit, token consumption, dan evaluasi Human vs AI' };
      case 'system_monitoring':
        return { title: 'System Monitoring Center & Health Gate', subtitle: 'Telemetri pod Kubernetes, latensi LLM circuit breaker, antrean DLQ, dan security gate' };
      case 'tenant_workforce':
        return { title: 'Cross-Tenant Workforce & Department Telemetry', subtitle: 'Visibilitas adopsi 14 divisi bisnis, distribusi 15 AI Job Titles, dan rasio Human-to-AI' };
      case 'prospect_registrations':
        return { title: 'Prospect Registrations & 36 Trial Allocation', subtitle: 'Pendaftar kuesioner publik, seleksi 36 slot trial 7 hari, aktivasi tenant trial 1,000 credit, dan penjadwalan demo' };
      case 'commercial_plans':
        return { title: 'Commercial Plans & Feature Entitlements', subtitle: 'Manajemen paket komersial, harga publik, limit seat/agent, dan matriks hak akses' };
      case 'credit_metering':
        return { title: 'Credit Metering & Multiplier Rules', subtitle: 'Konfigurasi base work unit dan faktor pengali (complexity, model, tool, execution)' };
      case 'tenant_credit_override':
        return { title: 'Tenant Credit Wallet & Override', subtitle: 'Inspeksi saldo wallet, manual credit adjustment ber-audit trail, dan ledger riwayat' };
      case 'financial_command_center':
        return { title: 'Financial Command Center', subtitle: 'Ringkasan MRR, ARR, peredaran kredit, margin kotor, dan peringkat konsumsi tenant' };
      case 'payment_reconciliation':
        return { title: 'Payment Reconciliation & Anomaly Review', subtitle: 'Rekonsiliasi transaksi gateway vs database lokal, deteksi order stuck, dan manual override Super Admin' };
      case 'dead_letter_queue':
        return { title: 'Dead-Letter Queue & Workflow Replay', subtitle: 'Pemulihan kegagalan idempotensi, inspeksi error payload, dan replay eksekusi' };
      case 'workflow_tracing':
        return { title: 'Workflow Tracing & Observability', subtitle: 'OpenTelemetry span per node, visualisasi durasi, dan kalibrasi confidence' };
      case 'memory_management':
        return { title: 'Memory Management & Decay', subtitle: 'Consolidator threshold audit, linear & rolling decay, serta hybrid search re-ranking' };
      case 'tenants':
        return { title: 'Tenant Management', subtitle: 'Manajemen isolasi data organisasi dan alokasi resource' };
      case 'llm_providers':
        return { title: 'LLM Providers', subtitle: 'Konfigurasi provider AI, latensi, dan failover sequence' };
      case 'mcp_tools':
        return { title: 'MCP Tool Registry', subtitle: 'Model Context Protocol sandbox functions & risk gating' };
      case 'app_registry':
        return { title: 'Third-Party App Registry', subtitle: 'Konektor OAuth, ERP, CRM, dan gateway marketplace' };
      case 'master_data':
        return { title: 'Master Data & Industry Presets', subtitle: 'Template industri, default role, dan prompt guardrails' };
      case 'skill_plugins':
        return { title: 'Skill Plugin Registry', subtitle: 'Marketplace WASM & Python sandbox extension plugins' };
      case 'usage_cost':
        return { title: 'Usage & Cost Intelligence', subtitle: 'Analisis konsumsi token MTD dan efisiensi biaya routing' };
      case 'security_audit':
        return { title: 'Security & Sentinel Audit Center', subtitle: 'Log forensik akses, pelanggaran ABAC, dan mitigasi risiko' };
    }
  };

  const { title, subtitle } = getScreenTitle();

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <AdminSidebar currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminHeader title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto bg-slate-950/70">
          <DashboardErrorBoundary key={currentScreen}>
            {renderScreen()}
          </DashboardErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => isAdminPath());

  React.useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminRoute(isAdminPath());
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  if (!isAdminRoute) {
    return <PublicLandingScreen />;
  }

  return (
    <AuthProvider>
      <MainDashboardApp />
    </AuthProvider>
  );
}
