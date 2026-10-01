'use client';

import React from 'react';
import { GenerativeStudioHubScreen } from '../../components/generative/GenerativeStudioHubScreen';
import { useAuthSession } from '../../lib/useAuthSession';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export default function GenerativePage() {
  const { session: activeTenant, loading } = useAuthSession();

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B1220]">
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi sesi kreatif...</div>
      ) : activeTenant ? (
        <GenerativeStudioHubScreen tenant={activeTenant} />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="auth-required-generative"
            icon={ShieldAlert}
            title="Sesi Terautentikasi Diperlukan"
            description="Studio kreatif dan aset generatif hanya dapat diakses melalui portal resmi dengan sesi aktif."
            actionLabel="Masuk ke Portal Resmi"
            onAction={() => {
              window.location.href = '/';
            }}
          />
        </div>
      )}
    </main>
  );
}
