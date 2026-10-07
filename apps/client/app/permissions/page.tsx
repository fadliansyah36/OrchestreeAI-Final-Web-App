'use client';

import React from 'react';
import { AIDataPermissionScreen } from '../../components/AIDataPermissionScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function PermissionsPage() {
  return (
    <ClientDomainRoute
      title="Izin & Privasi Data AI"
      description="Kebijakan akses data AI dan permission tenant melalui konteks server."
    >
      {(session) => (
        <AIDataPermissionScreen
          tenantId={session.tenant_id}
          tenantName={session.tenant_display_name || session.tenant_legal_name || undefined}
          userRole={session.roles[0] || 'TENANT_MEMBER'}
          onBack={() => window.location.assign('/')}
        />
      )}
    </ClientDomainRoute>
  );
}
