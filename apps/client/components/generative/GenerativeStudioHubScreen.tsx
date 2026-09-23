'use client';

import React from 'react';
import { GenerativeStudioHubScreen } from '../../../../src/components/GenerativeStudioHubScreen';

export function ClientGenerativeStudioScreen() {
  const tenant = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('orchestree_active_tenant') || '{}')
    : null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <GenerativeStudioHubScreen tenant={tenant} />
    </div>
  );
}
export default ClientGenerativeStudioScreen;
