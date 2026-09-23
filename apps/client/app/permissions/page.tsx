'use client';

import React from 'react';
import { AIDataPermissionScreen } from '../../components/AIDataPermissionScreen';
import { Building2, ArrowLeft } from 'lucide-react';

export default function PermissionsPage() {
  const activeTenant = {
    tenant_id: 'd1159d6d-0044-42ea-8007-d549a0011402',
    legal_name: 'PT Nusantara Jaya Digital',
    display_name: 'Nusantara Digital',
    slug: 'nusantara-digital',
    email: 'admin@nusantara.digital',
    role: 'TENANT_OWNER',
  };

  return (
    <main className="min-h-screen bg-[#0B1220] pb-16 text-white">
      <AIDataPermissionScreen
        tenantId={activeTenant.tenant_id}
        tenantName={activeTenant.display_name}
        userRole={activeTenant.role}
        onBack={() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        }}
      />
    </main>
  );
}
