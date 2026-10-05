'use client';

import React from 'react';
import { useAdminSession } from '../../../lib/useAdminSession';
import { PlatformAnalyticsHubScreen } from '../../../components/PlatformAnalyticsHubScreen';
import { EmptyState } from '@orchestree/ui';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function AdminAnalyticsPage() {
  const { loading, isPlatformAdmin } = useAdminSession();

  return (
    <main className="min-h-screen p-6 md:p-8 bg-[#070D18] text-white">
      <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Konsol Utama</span>
        </a>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm font-sans">
          Memverifikasi protokol otorisasi Super Admin...
        </div>
      ) : isPlatformAdmin ? (
        <div className="max-w-7xl mx-auto">
          <PlatformAnalyticsHubScreen />
        </div>
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="admin-analytics-auth-guard"
            icon={ShieldAlert}
            title="Otentikasi Super Admin & MFA Diperlukan"
            description="Pusat pemantauan kinerja platform, audit biaya komputasi, dan agregasi data lintas organisasi memerlukan hak Super Admin dengan verifikasi MFA aktif."
            actionLabel="Masuk Konsol Resmi"
            onAction={() => {
              window.location.href = '/login?admin=1';
            }}
          />
        </div>
      )}
    </main>
  );
}
