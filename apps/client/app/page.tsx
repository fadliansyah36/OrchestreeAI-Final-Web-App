'use client';

import React from 'react';
import { FeatureHubScreen, CategoryCard, EmptyState } from '@orchestree/ui';
import { Activity, Sparkles, ShieldAlert, Loader2, ArrowUpRight } from 'lucide-react';
import { useAuthSession } from '../lib/useAuthSession';

export default function ClientHomePage() {
  const { session, loading } = useAuthSession();

  const workspaceName =
    session?.tenant_display_name ||
    session?.tenant_legal_name ||
    'Ruang Kerja Organisasi';

  const categoryCards: CategoryCard[] = [
    {
      key: 'overview',
      label: 'Overview',
      description: 'Ringkasan operasional workspace dari data domain yang tersedia.',
      icon: 'trending',
      route: '/overview',
      section: 'Workspace & Workforce',
    },
    {
      key: 'workforce',
      label: 'Tenaga Kerja',
      description: 'Departemen, staf, AI Agent, dan struktur kerja organisasi.',
      icon: 'users',
      route: '/workforce',
      section: 'Workspace & Workforce',
    },
    {
      key: 'selection',
      label: 'Seleksi Cerdas',
      description: 'Seleksi dan pencocokan pekerja manusia maupun AI.',
      icon: 'search',
      route: '/selection',
      section: 'Workspace & Workforce',
    },
    {
      key: 'permissions',
      label: 'Izin & Privasi',
      description: 'Akses data, permission, dan kebijakan tenant.',
      icon: 'shield',
      route: '/permissions',
      section: 'Workspace & Workforce',
    },
    {
      key: 'sales-marketing',
      label: 'Sales & Marketing',
      description: 'Pipeline penjualan, marketing, dan operasi customer.',
      icon: 'trending',
      route: '/sales-marketing',
      section: 'Sales & Customer',
    },
    {
      key: 'omnichannel',
      label: 'Omnichannel',
      description: 'Percakapan pelanggan dan channel komunikasi.',
      icon: 'briefcase',
      route: '/omnichannel',
      section: 'Sales & Customer',
    },
    {
      key: 'inbox',
      label: 'Inbox & Aktivitas',
      description: 'Notifikasi dan aktivitas yang membutuhkan perhatian.',
      icon: 'activity',
      route: '/inbox',
      section: 'Sales & Customer',
    },
    {
      key: 'proactive',
      label: 'Agen Proaktif',
      description: 'Alur proactive agent dan pekerjaan yang dijadwalkan.',
      icon: 'activity',
      route: '/proactive',
      section: 'Sales & Customer',
    },
    {
      key: 'intelligence',
      label: 'Kecerdasan Eksternal',
      description: 'Riset pasar, kompetitor, dan intelligence workspace.',
      icon: 'brain',
      route: '/intelligence',
      section: 'Intelligence & Creation',
    },
    {
      key: 'generative',
      label: 'Studio Kreatif',
      description: 'Pembuatan aset generatif melalui jalur AI canonical.',
      icon: 'sparkles',
      route: '/generative',
      section: 'Intelligence & Creation',
    },
    {
      key: 'enterprise',
      label: 'Enterprise',
      description: 'Enterprise AI Workforce, Context Fabric, dan Chief of Staff.',
      icon: 'shield',
      route: '/enterprise',
      tierRequired: 'ENTERPRISE',
      section: 'Intelligence & Creation',
    },
    {
      key: 'integrations',
      label: 'Integrations & MCP',
      description: 'Katalog dan koneksi aplikasi eksternal yang tersedia.',
      icon: 'layers',
      route: '/integrations',
      section: 'Platform & Governance',
    },
    {
      key: 'billing',
      label: 'Kredit & Langganan',
      description: 'Saldo kredit, langganan, dan billing workspace.',
      icon: 'credit',
      route: '/billing',
      section: 'Platform & Governance',
    },
    {
      key: 'settings',
      label: 'Pengaturan',
      description: 'Konfigurasi akun dan preferensi workspace.',
      icon: 'settings',
      route: '/settings',
      section: 'Platform & Governance',
    },
  ];

  const analyticsSlot = loading ? (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--orch-radius-md)] border border-[var(--orch-border)] bg-[var(--orch-surface-elevated)] p-5 shadow-[var(--orch-shadow-1)]"
    >
      <div className="flex items-center gap-3 text-sm text-[var(--orch-text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--orch-primary-green)]" />
        Memuat konteks workspace…
      </div>
    </div>
  ) : session ? (
    <div
      id="workspace-context"
      className="rounded-[var(--orch-radius-md)] border border-[var(--orch-border)] bg-[var(--orch-surface-elevated)] p-5 shadow-[var(--orch-shadow-1)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--orch-primary-green)]">
            <Activity className="h-4 w-4" />
            Workspace terverifikasi
          </div>
          <h2 className="mt-1 truncate text-lg font-bold text-[var(--orch-text-primary)]">{workspaceName}</h2>
          <p className="mt-1 text-xs text-[var(--orch-text-secondary)]">
            {session.roles.length > 0
              ? `Role: ${session.roles.join(', ')}`
              : 'Role organisasi belum tersedia pada sesi ini.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-[var(--orch-radius-sm)] bg-[var(--orch-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--orch-text-secondary)]">
          {session.capabilities.length} capability
          <ArrowUpRight className="h-3.5 w-3.5 text-[var(--orch-primary-green)]" />
        </div>
      </div>
    </div>
  ) : (
    <EmptyState
      id="workspace-session-required"
      icon={ShieldAlert}
      title="Workspace belum terautentikasi"
      description="Struktur aplikasi tetap tersedia, tetapi data organisasi dan operasi tenant hanya ditampilkan setelah sesi server terverifikasi."
    />
  );

  const insightFeed = (
    <EmptyState
      id="insights-empty-state"
      icon={Sparkles}
      title="Belum ada insight operasional"
      description="Insight akan muncul ketika backend menyediakan rekomendasi nyata untuk workspace ini. UI tidak membuat insight sintetis."
    />
  );

  return (
    <FeatureHubScreen
      eyebrow="Ruang Kerja"
      domain="Workspace Overview"
      description="Satu pintu untuk tenaga kerja, sales, intelligence, generative, enterprise, dan pengaturan platform."
      analyticsSlot={analyticsSlot}
      categoryCards={categoryCards}
      insightFeed={insightFeed}
      onNavigate={(route) => {
        if (typeof window !== 'undefined') window.history.pushState({}, '', route);
        window.location.assign(route);
      }}
    />
  );
}
