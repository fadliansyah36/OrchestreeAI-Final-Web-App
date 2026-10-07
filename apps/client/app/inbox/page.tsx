'use client';

import React from 'react';
import { SalesMarketingHubScreen } from '../../components/omnichannel/SalesMarketingHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function ClientInboxPage() {
  return (
    <ClientDomainRoute
      title="Inbox & Aktivitas"
      description="Pusat komunikasi pelanggan dan aktivitas yang membutuhkan perhatian."
    >
      {(session) => <SalesMarketingHubScreen tenantId={session.tenant_id || ''} />}
    </ClientDomainRoute>
  );
}
