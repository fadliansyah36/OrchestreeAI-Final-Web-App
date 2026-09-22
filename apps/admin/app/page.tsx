'use client';

import React from 'react';
import {
  FeatureHubScreen,
  CategoryCard,
  EmptyState,
} from '@orchestree/ui';
import { ShieldCheck, Lock, Activity } from 'lucide-react';

export default function AdminHomePage() {
  const adminCards: CategoryCard[] = [
    {
      key: 'tenants',
      label: 'Manajemen Tenant',
      icon: 'users',
      route: '/admin/tenants',
      badgeCount: 0,
    },
    {
      key: 'llm-routing',
      label: 'Multi-LLM & Model Router',
      icon: 'brain',
      route: '/admin/llm-routing',
      badgeCount: 0,
    },
    {
      key: 'mcp-tools',
      label: 'Governance Alat MCP',
      icon: 'layers',
      route: '/admin/mcp-tools',
      badgeCount: 0,
    },
    {
      key: 'usage-costs',
      label: 'Penggunaan & Biaya Platform',
      icon: 'trending',
      route: '/admin/usage-costs',
    },
    {
      key: 'prospects-trial',
      label: 'Registrasi Prospek & Uji Coba',
      icon: 'briefcase',
      route: '/admin/prospects-trial',
      badgeCount: 0,
    },
    {
      key: 'app-registry',
      label: 'Katalog Integrasi Pihak Ketiga',
      icon: 'settings',
      route: '/admin/app-registry',
    },
    {
      key: 'security-audit',
      label: 'Keamanan & Buku Catatan Audit',
      icon: 'shield',
      route: '/admin/security-audit',
    },
    {
      key: 'operations-dlq',
      label: 'Antrean Operasional Sistem',
      icon: 'activity',
      route: '/admin/operations-dlq',
    },
  ];

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
          <div className="flex items-center gap-2 text-xs font-medium text-amber-300 bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-xl">
            <Lock className="w-3.5 h-3.5" />
            <span>MFA Diwajibkan</span>
          </div>
        </div>
      </header>

      {/* Admin Feature Hub */}
      <FeatureHubScreen
        domain="Konsol Kendali Super Admin"
        analyticsSlot={
          <EmptyState
            id="admin-analytics-empty-state"
            icon={Activity}
            title="Metrik Platform Belum Tersedia"
            description="Agregasi analitik lintas penyewa, pemantauan latensi model, dan biaya komputasi akan aktif sejalan dengan eksekusi beban kerja."
          />
        }
        categoryCards={adminCards}
        insightFeed={
          <EmptyState
            id="admin-audit-empty-state"
            icon={ShieldCheck}
            title="Catatan Audit Bersih"
            description="Seluruh aksi berisiko tinggi dan keputusan sistem tercatat secara permanen di buku catatan audit."
          />
        }
        onNavigate={(route) => console.log('Admin navigating to', route)}
      />
    </main>
  );
}
