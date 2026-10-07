'use client';

import React from 'react';
import { GenerativeStudioHubScreen } from '../../components/generative/GenerativeStudioHubScreen';
import { ClientDomainRoute } from '../../components/ClientDomainRoute';

export default function GenerativePage() {
  return (
    <ClientDomainRoute
      title="Studio Kreatif"
      description="Prompt, template, Brand Asset Lock, credit flow, dan generative artifact."
    >
      {(session) => <GenerativeStudioHubScreen tenant={session as any} />}
    </ClientDomainRoute>
  );
}
