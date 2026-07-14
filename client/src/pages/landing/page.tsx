import React from 'react';
import { LandingNav } from '../../components/landing/LandingNav';
import { HeroSection } from '../../components/landing/HeroSection';
import { ProblemSection } from '../../components/landing/ProblemSection';
import { HowItWorksSection } from '../../components/landing/HowItWorksSection';
import { ServicesSection } from '../../components/landing/ServicesSection';
import { DemoSection } from '../../components/landing/DemoSection';
import { DocumentsSection } from '../../components/landing/DocumentsSection';
import { VoiceSection } from '../../components/landing/VoiceSection';
import { ClearanceSection } from '../../components/landing/ClearanceSection';
import { IntegrationsSection } from '../../components/landing/IntegrationsSection';
import { ProofSection } from '../../components/landing/ProofSection';
import { FinalCtaSection } from '../../components/landing/FinalCtaSection';
import { LandingFooter } from '../../components/landing/LandingFooter';

export function LandingPage() {
  return (
    <main className="bg-[#FBFBFF]">
      <LandingNav />
      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <ServicesSection />
      <DemoSection />
      <DocumentsSection />
      <VoiceSection />
      <ClearanceSection />
      <IntegrationsSection />
      <ProofSection />
      <FinalCtaSection />
      <LandingFooter />
    </main>
  );
}
