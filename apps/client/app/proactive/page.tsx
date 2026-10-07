'use client';

import React from 'react';
import { ProactiveChannelsScreen } from '../../components/ProactiveChannelsScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function ClientProactivePage() {
  return (
    <ClientDomainRoute
      title="Agen Proaktif"
      description="Konfigurasi kanal proaktif dan pekerjaan terjadwal organisasi."
    >
      {(session) => (
        <div className="mx-auto max-w-[1440px] px-4 pt-6 sm:px-6 lg:px-8">
          <ProactiveChannelsScreen
            tenant={session}
            onBack={() => window.location.assign('/overview')}
          />
        </div>
      )}
    </ClientDomainRoute>
  );
}
