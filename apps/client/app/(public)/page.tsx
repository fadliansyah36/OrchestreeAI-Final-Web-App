'use client';

import React from 'react';
import { PublicLandingScreen } from '../../components/landing/PublicLandingScreen';

export default function PublicPage() {
  const handleStartOnboarding = (planCode?: string) => {
    window.location.href = `/onboarding${planCode ? `?plan=${encodeURIComponent(planCode)}` : ''}`;
  };

  const handleOpenLogin = () => {
    window.location.href = '/login';
  };

  return (
    <PublicLandingScreen
      onStartOnboarding={handleStartOnboarding}
      onOpenLogin={handleOpenLogin}
    />
  );
}
