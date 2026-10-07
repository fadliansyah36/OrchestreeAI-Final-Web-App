'use client';

import React from 'react';
import { SalesMarketingHubScreen } from '../../components/omnichannel/SalesMarketingHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function SalesMarketingPage() {
  return (
    <ClientDomainRoute
      title="Sales & Marketing"
      description="Pipeline penjualan, pemasaran, CRM, dan operasi customer."
    >
      {(session) => <SalesMarketingHubScreen tenantId={session.tenant_id || ''} />}
    </ClientDomainRoute>
  );
}
