'use client';

import React from 'react';
import { ProactiveChannelsScreen } from '../../../../src/components/ProactiveChannelsScreen';
import { ArrowLeft, Megaphone } from 'lucide-react';

export default function ClientProactivePage() {
  const activeTenant = {
    tenant_id: typeof window !== 'undefined' ? localStorage.getItem('tenant_id') || 'tenant-alpha-001' : 'tenant-alpha-001',
    membership_id: 'member-001',
    user_id: 'usr-admin-001',
    legal_name: 'PT Nusantara Jaya Digital',
    display_name: 'Nusantara Digital',
    role: 'TENANT_OWNER'
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B1220] pb-16">
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
        <ProactiveChannelsScreen
          tenant={activeTenant as any}
          onBack={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/overview';
            }
          }}
        />
      </div>
    </main>
  );
}
