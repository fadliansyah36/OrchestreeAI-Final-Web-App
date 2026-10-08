import { apiClient } from '@orchestree/api-client';
'use client';

import React, { useEffect, useState } from 'react';
import { EmptyState } from '@orchestree/ui';
import { AdminSuperHubScreen } from '../components/AdminSuperHubScreen';
import { ShieldCheck, Lock, ShieldAlert } from 'lucide-react';

export default function AdminHomePage() {
  const [isAdminAuth, setIsAdminAuth] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    apiClient.fetch('/api/v1/admin/hub-overview', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!cancelled) setIsAdminAuth(response.ok);
      })
      .catch(() => {
        if (!cancelled) setIsAdminAuth(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen pb-16 bg-[#070D18]">
      {/* Super Admin Top Bar */}
      <header className="border-b border-slate-800 bg-[#0B1220]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-white text-base">
                Orchestree<span className="text-blue-500">.AI</span>
              </span>
              <span className="ml-2 text-xs uppercase px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/60 font-semibold tracking-wider">
                Super Admin Console
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/admin/cognitive-monitoring"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-800/70 px-3 py-1.5 rounded-xl transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Monitoring Kognitif Live</span>
            </a>
            <a
              href="/admin/analytics"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 hover:text-white bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 px-3 py-1.5 rounded-xl transition"
            >
              <span>Analisis Platform</span>
            </a>
            <div className="flex items-center gap-2 text-xs font-medium text-amber-300 bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-xl">
              <Lock className="w-3.5 h-3.5" />
              <span>MFA Diwajibkan</span>
            </div>
          </div>
        </div>
      </header>

      {/* Complete Admin Super Hub Screen or Authenticated Guard */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi protokol keamanan Super Admin...</div>
      ) : isAdminAuth ? (
        <AdminSuperHubScreen initialTab="overview" />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="admin-mfa-required-guard"
            icon={ShieldAlert}
            title="Otentikasi Super Admin & MFA Diperlukan"
            description="Area kendali platform global dilindungi secara ketat. Sesi administratif aktif dan verifikasi dua faktor (MFA) wajib dipenuhi."
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
