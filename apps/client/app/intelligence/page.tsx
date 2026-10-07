'use client';

import React from 'react';
import { IntelligenceHubScreen } from '../../components/IntelligenceHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function IntelligencePage() {
  return (
    <ClientDomainRoute
      title="Kecerdasan Eksternal"
      description="Riset pasar, kompetitor, prospecting, dan intelligence workspace."
    >
      {(session) => (
        <IntelligenceHubScreen
          tenant={session as any}
          onBack={() => window.location.assign('/')}
        />
      )}
    </ClientDomainRoute>
  );
}
