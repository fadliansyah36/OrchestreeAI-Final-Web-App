'use client';

import React from 'react';
import { SalesMarketingHubScreen } from '../../components/omnichannel/SalesMarketingHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function ClientOmnichannelPage() {
  return (
    <ClientDomainRoute
      title="Penjualan & Omnichannel"
      description="Pipeline sales, customer conversation, channel operations, dan handoff."
    >
      {(session) => <SalesMarketingHubScreen tenantId={session.tenant_id || ''} />}
    </ClientDomainRoute>
  );
}
