'use client';

import React from 'react';
import { BillingHubScreen } from '../../components/billing/BillingHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function ClientBillingPage() {
  return (
    <ClientDomainRoute
      title="Kredit & Langganan"
      description="Saldo kredit, paket, invoice, dan lifecycle billing workspace."
    >
      {(session) => (
        <BillingHubScreen
          tenantId={session.tenant_id}
          tenantName={session.tenant_display_name || session.tenant_legal_name || 'Organisasi'}
        />
      )}
    </ClientDomainRoute>
  );
}
