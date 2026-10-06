'use client';

import React from 'react';
import { useAuthSession } from '../../lib/useAuthSession';
import { AccessTierConfigScreen } from '../../components/settings/AccessTierConfigScreen';
import { EmptyState } from '@orchestree/ui';
import { ShieldAlert } from 'lucide-react';

export default function SettingsPage() {
  const { session, loading } = useAuthSession();

  if (loading) return <main className="min-h-screen bg-[#0B1220] text-white p-8 text-sm text-slate-400">Memverifikasi sesi aman...</main>;
  if (!session) return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      <div className="max-w-xl mx-auto pt-16 px-4">
        <EmptyState id="auth-required-settings" icon={ShieldAlert} title="Sesi Terautentikasi Diperlukan" description="Pengaturan akun memerlukan sesi organisasi terverifikasi." actionLabel="Masuk ke Portal Resmi" onAction={() => { window.location.href = '/'; }} />
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#0B1220] text-white pb-16">
      <AccessTierConfigScreen tenantId={session.tenant_id || ''} onBack={() => { window.location.href = '/'; }} />
    </main>
  );
}
