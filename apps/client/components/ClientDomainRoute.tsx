'use client';

import React from 'react';
import { ShieldAlert, Loader2, ArrowLeft } from 'lucide-react';
import { EmptyState } from '@orchestree/ui';
import { useAuthSession, AuthSessionContext } from '../lib/useAuthSession';

interface ClientDomainRouteProps {
  title: string;
  description: string;
  children: React.ReactNode | ((session: AuthSessionContext) => React.ReactNode);
}

export function ClientDomainRoute({ title, description, children }: ClientDomainRouteProps) {
  const { session, loading } = useAuthSession();

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[var(--orch-surface-base)] px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-center rounded-[var(--orch-radius-md)] border border-[var(--orch-border)] bg-[var(--orch-surface-elevated)] p-10 text-sm text-[var(--orch-text-secondary)] shadow-[var(--orch-shadow-1)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--orch-primary-green)]" />
          Memverifikasi sesi organisasi…
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[var(--orch-surface-base)] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--orch-primary-green)]">Akses Workspace</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--orch-text-primary)]">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--orch-text-secondary)]">{description}</p>
          </div>
          <EmptyState
            id={`auth-required-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            icon={ShieldAlert}
            title="Sesi terautentikasi diperlukan"
            description="Data organisasi dan operasi tenant hanya ditampilkan setelah sesi server terverifikasi. Tidak ada tenant identity dari localStorage atau header browser yang digunakan."
            actionLabel="Kembali ke Beranda"
            onAction={() => {
              window.location.assign('/');
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[var(--orch-surface-base)] pb-8">
      {typeof children === 'function' ? children(session) : children}
    </main>
  );
}
