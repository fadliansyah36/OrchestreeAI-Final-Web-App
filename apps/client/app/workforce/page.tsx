'use client';

import React from 'react';
import { WorkforceHubScreen } from '../../components/workforce/WorkforceHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function WorkforcePage() {
  return (
    <ClientDomainRoute
      title="Tenaga Kerja"
      description="Departemen, staf, AI Agent, dan struktur kerja organisasi."
    >
      {(session) => (
        <WorkforceHubScreen
          tenant={session as any}
          onBack={() => window.location.assign('/')}
        />
      )}
    </ClientDomainRoute>
  );
}
