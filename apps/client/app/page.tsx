'use client';

import React from 'react';
import { FeatureHubScreen, CategoryCard, EmptyState } from '@orchestree/ui';
import { Activity, Sparkles, Building2, ShieldAlert, Loader2 } from 'lucide-react';
import { useAuthSession } from '../lib/useAuthSession';

export default function ClientHomePage() {
  const { session, loading } = useAuthSession();

  const workspaceName =
    session?.tenant_display_name ||
    session?.tenant_legal_name ||
    'Portal Orchestree.AI';

  const categoryCards: CategoryCard[] = [
    { key: 'overview', label: 'Pusat Evaluasi Kinerja (Overview)', icon: 'trending', route: '/overview' },
    { key: 'workforce', label: 'Manajemen Tenaga Kerja', icon: 'users', route: '/workforce' },
    { key: 'sales-marketing', label: 'Penjualan & Pemasaran', icon: 'trending', route: '/sales-marketing' },
    { key: 'intelligence', label: 'Riset Pasar & Kompetitor', icon: 'brain', route: '/intelligence' },
    { key: 'enterprise', label: 'Operasional Enterprise', icon: 'shield', route: '/enterprise', tierRequired: 'ENTERPRISE' },
    { key: 'generative', label: 'Studio Kreatif Generatif', icon: 'sparkles', route: '/generative' },
    { key: 'omnichannel', label: 'Omnichannel & Percakapan', icon: 'briefcase', route: '/omnichannel' },
    { key: 'inbox', label: 'Inbox & Notifikasi', icon: 'activity', route: '/inbox' },
    { key: 'proactive', label: 'Proactive Agent', icon: 'activity', route: '/proactive' },
    { key: 'selection', label: 'Seleksi Data Cerdas', icon: 'search', route: '/selection' },
    { key: 'billing', label: 'Kredit & Langganan', icon: 'credit', route: '/billing' },
    { key: 'integrations', label: 'Integrations & MCP', icon: 'layers', route: '/integrations' },
    { key: 'permissions', label: 'Permissions & Access', icon: 'shield', route: '/permissions' },
    { key: 'settings', label: 'Pengaturan Akun', icon: 'settings', route: '/settings' },
  ];

  const analyticsSlot = loading ? (
    <div role="status" aria-live="polite" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1220] p-5 shadow-sm">
      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Memuat konteks workspace...
      </div>
    </div>
  ) : session ? (
    <div id="workspace-context" className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-[#0B1220] p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Activity className="w-4 h-4" />
            Workspace terverifikasi
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white truncate">{workspaceName}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {session.roles.length > 0 ? `Role: ${session.roles.join(', ')}` : 'Role organisasi belum tersedia pada sesi ini.'}
          </p>
        </div>
        <div className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
          {session.capabilities.length} capability tersedia
        </div>
      </div>
    </div>
  ) : (
    <EmptyState
      id="workspace-session-required"
      icon={ShieldAlert}
      title="Workspace belum terautentikasi"
      description="Modul aplikasi tersedia dari Hub, tetapi data organisasi dan operasi tenant hanya ditampilkan setelah sesi terverifikasi."
    />
  );

  const insightFeed = (
    <EmptyState
      id="insights-empty-state"
      icon={Sparkles}
      title="Belum Ada Rekomendasi Pintar"
      description="Rekomendasi hanya akan ditampilkan ketika backend memiliki insight operasional nyata untuk workspace ini."
    />
  );

  return (
    <main className="min-h-screen pb-16 bg-slate-50 dark:bg-[#0B1220]">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0B1220]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div aria-hidden="true" className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">O</div>
            <div className="min-w-0">
              <span className="font-bold tracking-tight text-slate-900 dark:text-white text-base">
                Orchestree<span className="text-emerald-500">.AI</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold tracking-wider">
                Ruang Kerja Perusahaan
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl shrink-0">
            <Building2 className="w-3.5 h-3.5" />
            <span className="max-w-[180px] truncate">{workspaceName}</span>
          </div>
        </div>
      </header>

      <FeatureHubScreen
        domain="Pusat Kendali Tenaga Kerja"
        analyticsSlot={analyticsSlot}
        categoryCards={categoryCards}
        insightFeed={insightFeed}
        onNavigate={(route) => {
          if (typeof window !== 'undefined') window.location.assign(route);
        }}
      />
    </main>
  );
}
