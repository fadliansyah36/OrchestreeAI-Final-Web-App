'use client';

import React from 'react';
import { SalesMarketingHubScreen } from '../../components/omnichannel/SalesMarketingHubScreen';

export default function ClientOmnichannelPage() {
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenant_id') || 'tenant-alpha-001' : 'tenant-alpha-001';

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B1220]">
      <SalesMarketingHubScreen tenantId={tenantId} />
    </main>
  );
}
