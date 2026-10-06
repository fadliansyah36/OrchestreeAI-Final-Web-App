'use client';

import React from 'react';
import { useAuthSession } from '../../lib/useAuthSession';
import { WorkforceHubScreen } from '../../components/workforce/WorkforceHubScreen';
import { EmptyState } from '@orchestree/ui';
import { ShieldAlert } from 'lucide-react';

export default function WorkforcePage() {
  const { session, loading } = useAuthSession();

  if (loading) {
    return <main className="min-h-screen bg-[#0B1220] text-white p-8 text-sm text-slate-400">Memverifikasi sesi aman...</main>;
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[#0B1220] text-white">
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="auth-required-workforce"
            icon={ShieldAlert}
            title="Sesi Terautentikasi Diperlukan"
            description="Manajemen tenaga kerja memerlukan sesi organisasi yang telah diverifikasi."
            actionLabel="Masuk ke Portal Resmi"
            onAction={() => { window.location.href = '/'; }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-white pb-16">
      <WorkforceHubScreen
        tenant={session as any}
        onBack={() => { window.location.href = '/'; }}
      />
    </main>
  );
}
