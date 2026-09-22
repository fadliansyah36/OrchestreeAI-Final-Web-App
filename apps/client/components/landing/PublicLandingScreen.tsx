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

interface PublicLandingScreenProps {
  onStartOnboarding: (preselectedPlanCode?: string) => void;
  onOpenLogin: () => void;
  onViewStartupGate?: () => void;
}

export const PublicLandingScreen: React.FC<PublicLandingScreenProps> = ({
  onStartOnboarding,
  onOpenLogin,
  onViewStartupGate,
}) => {
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);

  const handleScrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleSelectPlan = useCallback(
    (planCode: string) => {
      onStartOnboarding(planCode);
    },
    [onStartOnboarding]
  );

  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-100 selection:bg-[#1FA35A]/30 selection:text-white font-sans">
      <LandingHeader
        onScrollToSection={handleScrollToSection}
        onOpenRegister={() => onStartOnboarding('FREE_TRIAL')}
        onOpenLogin={onOpenLogin}
        onOpenProspectModal={() => setIsProspectModalOpen(true)}
      />

      <main>
        <HeroSection
          onScrollToSection={handleScrollToSection}
          onOpenRegister={() => onStartOnboarding('FREE_TRIAL')}
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
          onOpenRegister={() => onStartOnboarding('FREE_TRIAL')}
          onOpenProspectModal={() => setIsProspectModalOpen(true)}
          onViewStartupGate={onViewStartupGate}
        />
      </main>

      <ProspectRegistrationModal
        isOpen={isProspectModalOpen}
        onClose={() => setIsProspectModalOpen(false)}
      />
    </div>
  );
};
