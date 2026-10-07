'use client';

import React from 'react';
import { IntegrationsHubScreen } from '../../components/IntegrationsHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function IntegrationsPage() {
  return (
    <ClientDomainRoute
      title="Integrations & MCP"
      description="Katalog aplikasi dan koneksi integrasi yang tersedia untuk workspace."
    >
      {(session) => (
        <IntegrationsHubScreen
          tenant={session as any}
          onBack={() => window.location.assign('/')}
        />
      )}
    </ClientDomainRoute>
  );
}
