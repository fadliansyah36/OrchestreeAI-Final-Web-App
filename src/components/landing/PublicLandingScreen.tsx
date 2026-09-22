import React, { useState, useCallback } from 'react';
import { LandingHeader } from './LandingHeader';
import { HeroSection } from './HeroSection';
import { ProductPillarsSection } from './ProductPillarsSection';
import { ProblemSolutionSection } from './ProblemSolutionSection';
import { HowItWorksSteps } from './HowItWorksSteps';
import { UseCasesSection } from './UseCasesSection';
import { SecurityTrustSection } from './SecurityTrustSection';
import { PricingSection } from './PricingSection';
import { FaqSection } from './FaqSection';
import { FooterCtaSection } from './FooterCtaSection';
import { ProspectRegistrationModal } from './ProspectRegistrationModal';
import { AuthModalCard, AuthModalMode } from './AuthModalCard';
import { TenantRegistrationResponse } from '../../types';

interface PublicLandingScreenProps {
  onStartOnboarding: (preselectedPlanCode?: string) => void;
  onOpenLogin?: () => void;
  onViewStartupGate?: () => void;
  onLoginSuccess?: (tenant: TenantRegistrationResponse) => void;
}

export const PublicLandingScreen: React.FC<PublicLandingScreenProps> = ({
  onStartOnboarding,
  onOpenLogin,
  onViewStartupGate,
  onLoginSuccess,
}) => {
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [selectedPlanCode, setSelectedPlanCode] = useState('FREE_TRIAL');

  const handleScrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleOpenLoginModal = useCallback(() => {
    setAuthModalMode('login');
    setIsAuthModalOpen(true);
  }, []);

  const handleOpenRegisterModal = useCallback((planCode?: string) => {
    if (planCode) setSelectedPlanCode(planCode);
    setAuthModalMode('register_tenant');
    setIsAuthModalOpen(true);
  }, []);

  const handleSelectPlan = useCallback(
    (planCode: string) => {
      handleOpenRegisterModal(planCode);
    },
    [handleOpenRegisterModal]
  );

  const handleAuthSuccess = useCallback(
    (tenant: TenantRegistrationResponse) => {
      if (onLoginSuccess) {
        onLoginSuccess(tenant);
      } else {
        onStartOnboarding();
      }
    },
    [onLoginSuccess, onStartOnboarding]
  );

  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-100 selection:bg-[#1FA35A]/30 selection:text-white font-sans">
      <LandingHeader
        onScrollToSection={handleScrollToSection}
        onOpenRegister={() => handleOpenRegisterModal('FREE_TRIAL')}
        onOpenLogin={handleOpenLoginModal}
        onOpenProspectModal={() => setIsProspectModalOpen(true)}
      />

      <main>
        <HeroSection
          onScrollToSection={handleScrollToSection}
          onOpenRegister={() => handleOpenRegisterModal('FREE_TRIAL')}
          onOpenProspectModal={() => setIsProspectModalOpen(true)}
        />

        <ProductPillarsSection />

        <ProblemSolutionSection />

        <HowItWorksSteps />

        <UseCasesSection />

        <SecurityTrustSection />

        <PricingSection onSelectPlan={handleSelectPlan} />

        <FaqSection />

        <FooterCtaSection
          onOpenRegister={() => handleOpenRegisterModal('FREE_TRIAL')}
          onOpenProspectModal={() => setIsProspectModalOpen(true)}
          onViewStartupGate={onViewStartupGate}
        />
      </main>

      {/* Prospect Demo Registration Modal */}
      <ProspectRegistrationModal
        isOpen={isProspectModalOpen}
        onClose={() => setIsProspectModalOpen(false)}
      />

      {/* Interactive Authentication & Registration Modal Card */}
      <AuthModalCard
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        initialPlanCode={selectedPlanCode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        onOpenFullWizard={() => onStartOnboarding(selectedPlanCode)}
      />
    </div>
  );
};
