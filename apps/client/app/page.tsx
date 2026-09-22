'use client';

import React from 'react';
import {
  FeatureHubScreen,
  CategoryCard,
  EmptyState,
} from '@orchestree/ui';
import { Activity, Sparkles, Building2 } from 'lucide-react';

export default function ClientHomePage() {
  const categoryCards: CategoryCard[] = [
    {
      key: 'overview',
      label: 'Pusat Evaluasi Kinerja (Overview)',
      icon: 'trending',
      route: '/overview',
      badgeCount: 0,
    },
    {
      key: 'workforce',
      label: 'Manajemen Tenaga Kerja',
      icon: 'users',
      route: '/workforce',
      badgeCount: 0,
    },
    {
      key: 'sales-marketing',
      label: 'Penjualan & Pemasaran',
      icon: 'trending',
      route: '/sales-marketing',
      badgeCount: 0,
    },
    {
      key: 'intelligence',
      label: 'Riset Pasar & Kompetitor',
      icon: 'brain',
      route: '/intelligence',
      badgeCount: 0,
    },
    {
      key: 'enterprise',
      label: 'Operasional Enterprise',
      icon: 'shield',
      route: '/enterprise',
      isLocked: true,
    },
    {
      key: 'generative',
      label: 'Studio Kreatif Generatif',
      icon: 'sparkles',
      route: '/generative',
      badgeCount: 0,
    },
    {
      key: 'selection',
      label: 'Seleksi Data Cerdas',
      icon: 'search',
      route: '/selection',
      badgeCount: 0,
    },
    {
      key: 'billing',
      label: 'Kredit & Langganan',
      icon: 'credit',
      route: '/billing',
      badgeCount: 0,
    },
    {
      key: 'settings',
      label: 'Pengaturan Akun',
      icon: 'settings',
      route: '/settings',
    },
  ];

  return (
    <main className="min-h-screen pb-16">
      {/* Top Bar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0B1220]/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              O
            </div>
            <div>
              <span className="font-bold tracking-tight text-slate-900 dark:text-white text-base">
                Orchestree<span className="text-emerald-500">.AI</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold tracking-wider">
                Ruang Kerja Perusahaan
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl">
              <Building2 className="w-3.5 h-3.5" />
              <span>Workspace Utama</span>
            </div>
          </div>
        </div>
      </header>

      {/* Feature Hub Screen */}
      <FeatureHubScreen
        domain="Pusat Kendali Tenaga Kerja"
        analyticsSlot={
          <EmptyState
            id="analytics-empty-state"
            icon={Activity}
            title="Belum Ada Data Metrik Operasional"
            description="Laporan analitik dan ringkasan eksekutif akan muncul secara otomatis segera setelah modul operasional aktif."
            actionLabel="Pelajari Dokumentasi Layanan"
            onAction={() => window.open('/docs', '_blank')}
          />
        }
        categoryCards={categoryCards}
        insightFeed={
          <EmptyState
            id="insights-empty-state"
            icon={Sparkles}
            title="Belum Ada Rekomendasi Pintar"
            description="Umpan rekomendasi kecerdasan buatan akan aktif menganalisis peluang dan notifikasi prioritas tinggi saat aktivitas berjalan."
          />
        }
        onNavigate={(route) => console.log('Navigating to', route)}
      />
    </main>
  );
}
