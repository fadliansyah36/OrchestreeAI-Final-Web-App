'use client';

import React from 'react';
import { AccessTierConfigScreen } from '../../components/settings/AccessTierConfigScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function SettingsPage() {
  return (
    <ClientDomainRoute
      title="Pengaturan"
      description="Konfigurasi akun, akses, dan governance workspace."
    >
      {(session) => (
        <AccessTierConfigScreen
          tenantId={session.tenant_id || ''}
          onBack={() => window.location.assign('/')}
        />
      )}
    </ClientDomainRoute>
  );
}
