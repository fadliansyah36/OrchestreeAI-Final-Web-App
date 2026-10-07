'use client';

import React from 'react';
import { EnterpriseHubScreen } from '../../components/EnterpriseHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function EnterprisePage() {
  return (
    <ClientDomainRoute
      title="Enterprise AI Workforce"
      description="Context Fabric, Integration Fabric, Chief of Staff, reporting, dan governance enterprise."
    >
      {(session) => (
        <EnterpriseHubScreen
          tenant={session as any}
          onBack={() => window.location.assign('/')}
        />
      )}
    </ClientDomainRoute>
  );
}
