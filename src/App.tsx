import React, { useState, useEffect } from 'react';
import { PublicLandingScreen } from '@/apps/client/components/landing/PublicLandingScreen';
import { OnboardingWizard } from '@/apps/client/components/OnboardingWizard';
import { TenantFeatureHubShell } from '@/apps/client/components/TenantFeatureHubShell';
import { StartupGateReport } from '@/apps/client/components/StartupGateReport';
import { TenantRegistrationResponse } from '@/apps/client/types';

export default function App() {

  const [view, setView] = useState<'landing' | 'onboarding' | 'dashboard' | 'startup_gate'>('landing');
  const [currentTenant, setCurrentTenant] = useState<TenantRegistrationResponse | null>(null);
  const [initialPlanCode, setInitialPlanCode] = useState<string>('FREE_TRIAL');

  // Cek jika ada tenant aktif yang tersimpan di localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('orchestree_current_tenant');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.tenant_id) {
          setCurrentTenant(parsed);
        }
      }
    } catch {
      // Abaikan jika localStorage tidak dapat dibaca
    }
  }, []);

  const handleStartOnboarding = (preselectedPlanCode?: string) => {
    if (preselectedPlanCode) {
      setInitialPlanCode(preselectedPlanCode);
    }
    setView('onboarding');
  };

  const handleLoginSuccess = (tenant: TenantRegistrationResponse) => {
    setCurrentTenant(tenant);
    try {
      localStorage.setItem('orchestree_current_tenant', JSON.stringify(tenant));
    } catch {}
    setView('dashboard');
  };

  const handleEnterDashboard = (tenant: TenantRegistrationResponse) => {
    setCurrentTenant(tenant);
    try {
      localStorage.setItem('orchestree_current_tenant', JSON.stringify(tenant));
    } catch {}
    setView('dashboard');
  };

  const handleBackToLanding = () => {
    setView('landing');
  };

  const handleOpenStartupGate = () => {
    setView('startup_gate');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 selection:bg-emerald-500/20 selection:text-emerald-300 font-sans antialiased">
      {view === 'landing' && (
        <PublicLandingScreen
          onStartOnboarding={handleStartOnboarding}
          onViewStartupGate={handleOpenStartupGate}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {view === 'onboarding' && (
        <div className="min-h-screen bg-neutral-950 py-10 px-4">
          <div className="max-w-5xl mx-auto mb-6 flex justify-between items-center">
            <button
              onClick={handleBackToLanding}
              className="text-xs font-mono text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              ← Kembali ke Beranda
            </button>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded-full">
              Orchestree Onboarding
            </span>
          </div>
          <OnboardingWizard
            initialPlanCode={initialPlanCode}
            onEnterDashboard={handleEnterDashboard}
            onBackToLanding={handleBackToLanding}
          />
        </div>
      )}

      {view === 'dashboard' && (
        <TenantFeatureHubShell
          tenant={currentTenant}
          onBackToLanding={handleBackToLanding}
          onOpenOnboarding={() => setView('onboarding')}
        />
      )}

      {view === 'startup_gate' && (
        <div className="min-h-screen bg-neutral-950 py-10 px-4">
          <div className="max-w-5xl mx-auto mb-6 flex justify-between items-center">
            <button
              onClick={handleBackToLanding}
              className="text-xs font-mono text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              ← Kembali ke Beranda
            </button>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2.5 py-1 rounded-full">
              Fail-Closed Startup Gate Status
            </span>
          </div>
          <StartupGateReport />
        </div>
      )}
    </div>
  );
}
