import React, { useState, useCallback } from 'react';
import { LandingHeader } from '../components/landing/LandingHeader';
import { HeroSection } from '../components/landing/HeroSection';
import { WorkforceUniverseDiagram } from '../components/landing/WorkforceUniverseDiagram';
import { ProblemSolutionSection } from '../components/landing/ProblemSolutionSection';
import { HowItWorksSteps } from '../components/landing/HowItWorksSteps';
import { HumanAiCollaborationSection } from '../components/landing/HumanAiCollaborationSection';
import { DayInTheLifeSection } from '../components/landing/DayInTheLifeSection';
import { AiEmployeeShowcase } from '../components/landing/AiEmployeeShowcase';
import { SocialCreativeWorkforceSection } from '../components/landing/SocialCreativeWorkforceSection';
import { OmnichannelSalesMarketingSection } from '../components/landing/OmnichannelSalesMarketingSection';
import { CompanyBrainWorkspaceSection } from '../components/landing/CompanyBrainWorkspaceSection';
import { EnterpriseWorkforceSection } from '../components/landing/EnterpriseWorkforceSection';
import { WorkforcePerformanceSection } from '../components/landing/WorkforcePerformanceSection';
import { RealtimeCockpitPreview } from '../components/landing/RealtimeCockpitPreview';
import { RoiCalculatorSection } from '../components/landing/RoiCalculatorSection';
import { SecurityTrustSection } from '../components/landing/SecurityTrustSection';
import { UseCasesSection } from '../components/landing/UseCasesSection';
import { MobileAppDownloadSection } from '../components/landing/MobileAppDownloadSection';
import { PricingSection } from '../components/landing/PricingSection';
import { FaqSection } from '../components/landing/FaqSection';
import { FooterCtaSection } from '../components/landing/FooterCtaSection';
import { ProspectRegistrationForm } from '../components/landing/ProspectRegistrationForm';
import { InterestOptionType } from '../types';

export const PublicLandingScreen: React.FC = () => {
  const [isProspectFormOpen, setIsProspectFormOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>(undefined);
  const [selectedInterestOption, setSelectedInterestOption] = useState<InterestOptionType>('direct_trial_or_subscription');

  const handleScrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleOpenProspectForm = useCallback((interest?: string) => {
    if (interest === 'demo_request' || interest === 'enterprise_discussion' || interest === 'direct_trial_or_subscription') {
      setSelectedInterestOption(interest as InterestOptionType);
    } else {
      setSelectedInterestOption('direct_trial_or_subscription');
    }
    setIsProspectFormOpen(true);
  }, []);

  const handleSelectPlan = useCallback((planId?: string) => {
    setSelectedPlanId(planId);
    setSelectedInterestOption('direct_trial_or_subscription');
    setIsProspectFormOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#071226] text-slate-100 selection:bg-[#08B85C]/30 selection:text-white font-sans">
      <LandingHeader
        onScrollToSection={handleScrollToSection}
        onOpenProspectForm={() => handleOpenProspectForm('direct_trial_or_subscription')}
      />

      <main>
        <HeroSection
          onScrollToSection={handleScrollToSection}
          onOpenProspectForm={handleOpenProspectForm}
        />

        <div id="workforce-universe">
          <WorkforceUniverseDiagram />
        </div>

        <ProblemSolutionSection />

        <div id="how-it-works">
          <HowItWorksSteps />
        </div>

        <HumanAiCollaborationSection />

        <DayInTheLifeSection />

        <div id="ai-employees">
          <AiEmployeeShowcase />
        </div>

        <SocialCreativeWorkforceSection />

        <div id="omnichannel-sales">
          <OmnichannelSalesMarketingSection />
        </div>

        <CompanyBrainWorkspaceSection />

        <div id="enterprise-workforce">
          <EnterpriseWorkforceSection />
        </div>

        <WorkforcePerformanceSection />

        <RealtimeCockpitPreview />

        <RoiCalculatorSection />

        <SecurityTrustSection />

        <UseCasesSection />

        <div id="mobile-app">
          <MobileAppDownloadSection />
        </div>

        <div id="pricing">
          <PricingSection onSelectPlan={handleSelectPlan} />
        </div>

        <div id="faq">
          <FaqSection />
        </div>

        <FooterCtaSection
          onOpenProspectForm={() => handleOpenProspectForm('direct_trial_or_subscription')}
        />
      </main>

      {isProspectFormOpen && (
        <ProspectRegistrationForm
          isOpen={isProspectFormOpen}
          onClose={() => setIsProspectFormOpen(false)}
          preselectedPlanId={selectedPlanId}
          preselectedInterestOption={selectedInterestOption}
        />
      )}
    </div>
  );
};
