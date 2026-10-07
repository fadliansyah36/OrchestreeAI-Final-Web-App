'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Sun, Moon, Building2, WifiOff } from 'lucide-react';
import { OrchNavBar, OrchBottomNav } from '@orchestree/ui';
import { useAuthSession } from '../lib/useAuthSession';

const ROUTE_TO_NAV: Record<string, string> = {
  '/': 'home',
  '/overview': 'overview',
  '/workforce': 'workforce',
  '/sales-marketing': 'omnichannel',
  '/omnichannel': 'omnichannel',
  '/intelligence': 'intelligence',
  '/generative': 'generative',
  '/selection': 'selection',
  '/enterprise': 'enterprise',
  '/integrations': 'integrations',
  '/billing': 'billing',
  '/permissions': 'permissions',
  '/settings': 'onboarding',
  '/inbox': 'activity',
  '/proactive': 'proactive',
};

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Beranda',
  '/overview': 'Overview',
  '/workforce': 'Tenaga Kerja',
  '/sales-marketing': 'Penjualan & Pemasaran',
  '/omnichannel': 'Omnichannel',
  '/intelligence': 'Kecerdasan',
  '/generative': 'Studio Kreatif',
  '/selection': 'Seleksi Cerdas',
  '/enterprise': 'Enterprise',
  '/integrations': 'Integrasi',
  '/billing': 'Kredit & Tagihan',
  '/permissions': 'Izin & Privasi',
  '/settings': 'Pengaturan',
  '/inbox': 'Aktivitas',
  '/proactive': 'Agen Proaktif',
};

export function ClientAppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading: sessionLoading } = useAuthSession();
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem('orchestree_theme');
    const preferred = stored === 'light' || stored === 'dark' ? stored : 'dark';
    setTheme(preferred);
    document.documentElement.dataset.theme = preferred;
  }, []);

  const navigate = (route: string) => {
    const normalized = route.startsWith('/') ? route : `/${route}`;
    if (normalized === pathname) {
      setNavOpen(false);
      return;
    }
    setNavOpen(false);
    router.push(normalized);
  };

  const activeNavId = useMemo(() => {
    if (!pathname) return 'home';
    return ROUTE_TO_NAV[pathname] || 'home';
  }, [pathname]);

  const workspaceName =
    session?.tenant_display_name ||
    session?.tenant_legal_name ||
    'Ruang Kerja Organisasi';

  const currentLabel = ROUTE_LABELS[pathname || '/'] || 'Orchestree.AI';

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('orchestree_theme', next);
  };

  const handleBottomNav = (id: string) => {
    const routes: Record<string, string> = {
      home: '/',
      work: '/workforce',
      overview: '/overview',
      activity: '/inbox',
      account: '/settings',
    };

    const route = routes[id];
    if (route) navigate(route);
  };

  return (
    <div className="orch-app-shell min-h-screen bg-[var(--orch-surface-base)] text-[var(--orch-text-primary)]">
      <header className="sticky top-0 z-40 border-b border-[var(--orch-border)] bg-[var(--orch-surface-elevated)]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Buka navigasi lengkap"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--orch-radius-sm)] border border-[var(--orch-border)] text-[var(--orch-text-secondary)] transition-colors hover:bg-[var(--orch-surface-muted)] hover:text-[var(--orch-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orch-primary-green)]"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-w-0 items-center gap-3 text-left"
            aria-label="Kembali ke Beranda Orchestree.AI"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--orch-radius-sm)] bg-[var(--orch-primary-green)] font-bold text-white shadow-[var(--orch-shadow-1)]">
              O
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-bold tracking-tight text-[var(--orch-text-primary)]">
                Orchestree<span className="text-[var(--orch-primary-green)]">.AI</span>
              </span>
              <span className="block truncate text-[11px] text-[var(--orch-text-muted)]">{currentLabel}</span>
            </span>
          </button>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {sessionLoading ? (
              <span className="hidden text-xs text-[var(--orch-text-muted)] md:block">Memuat workspace…</span>
            ) : session ? (
              <div className="hidden max-w-[280px] items-center gap-2 rounded-[var(--orch-radius-sm)] border border-[var(--orch-border)] bg-[var(--orch-surface-muted)] px-3 py-2 md:flex">
                <Building2 className="h-4 w-4 shrink-0 text-[var(--orch-primary-green)]" />
                <span className="truncate text-xs font-semibold text-[var(--orch-text-primary)]">{workspaceName}</span>
              </div>
            ) : (
              <div className="hidden items-center gap-2 rounded-[var(--orch-radius-sm)] border border-[var(--orch-border)] bg-[var(--orch-surface-muted)] px-3 py-2 md:flex">
                <WifiOff className="h-4 w-4 text-[var(--orch-warning)]" />
                <span className="text-xs text-[var(--orch-text-secondary)]">Sesi belum terverifikasi</span>
              </div>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Gunakan tema terang' : 'Gunakan tema gelap'}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--orch-radius-sm)] border border-[var(--orch-border)] text-[var(--orch-text-secondary)] transition-colors hover:bg-[var(--orch-surface-muted)] hover:text-[var(--orch-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orch-primary-green)]"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1440px] pb-20">
        {children}
      </div>

      <OrchNavBar
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        mode="client"
        currentRoute={pathname || '/'}
        onNavigate={navigate}
        tenantTier="STARTER"
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <OrchBottomNav
        mode="client"
        activeId={activeNavId}
        onSelect={handleBottomNav}
      />
    </div>
  );
}
