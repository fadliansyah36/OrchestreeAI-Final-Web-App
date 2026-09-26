'use client';

import React, { useEffect, useState } from 'react';
import { LiveAiCognitiveMonitoringScreen } from '../../../components/LiveAiCognitiveMonitoringScreen';
import { EmptyState } from '@orchestree/ui';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function AdminCognitiveMonitoringPage() {
  const [isAdminAuth, setIsAdminAuth] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem('orchestree_admin_token') || localStorage.getItem('sb-access-token');
      const isMfa = localStorage.getItem('orchestree_mfa_verified') === 'true';
      setIsAdminAuth(Boolean(token && isMfa));
    } catch {
      setIsAdminAuth(false);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#070D18] text-white">
      <div className="max-w-7xl mx-auto pt-6 px-4 md:px-6 mb-2 flex items-center justify-between">
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
      ) : isAdminAuth ? (
        <LiveAiCognitiveMonitoringScreen />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="admin-cognitive-monitoring-auth-guard"
            icon={ShieldAlert}
            title="Otentikasi Super Admin & MFA Diperlukan"
            description="Pusat pemantauan kognitif live seluruh staf AI lintas tenant memerlukan hak akses Super Admin dengan verifikasi MFA aktif."
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
