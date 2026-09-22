'use client';

import React from 'react';
import { BillingHubScreen } from '../../components/billing/BillingHubScreen';

export default function ClientBillingPage() {
  // Read current active tenant from localStorage or fallback
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenant_id') || 'tenant-alpha-001' : 'tenant-alpha-001';
  const tenantName = typeof window !== 'undefined' ? localStorage.getItem('tenant_display_name') || 'Organisasi Aktif' : 'Organisasi Aktif';

  return (
    <main className="min-h-screen bg-[#070D18]">
      <BillingHubScreen tenantId={tenantId} tenantName={tenantName} />
    </main>
  );
}
