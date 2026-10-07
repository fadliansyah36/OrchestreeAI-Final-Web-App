'use client';

import React from 'react';
import { UniversalSelectionHubScreen } from '../../components/selection/UniversalSelectionHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function SelectionPage() {
  return (
    <ClientDomainRoute
      title="Seleksi Cerdas"
      description="Seleksi dan pencocokan pekerja manusia maupun AI berdasarkan data organisasi yang tersedia."
    >
      {(session) => <UniversalSelectionHubScreen tenantId={session.tenant_id} />}
    </ClientDomainRoute>
  );
}
