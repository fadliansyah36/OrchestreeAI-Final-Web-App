'use client';

import React, { useEffect, useState } from 'react';
import { useAuthSession } from '../../lib/useAuthSession';
import { EmptyState } from '@orchestree/ui';
import { Activity, ArrowLeft, Bot, Building2, CreditCard, ShieldAlert, Users } from 'lucide-react';

type CountState = {
  departments: number | null;
  staff: number | null;
  agents: number | null;
  walletAvailable: number | null;
};

export default function OverviewPage() {
  const { session, loading: sessionLoading } = useAuthSession();
  const [data, setData] = useState<CountState>({
    departments: null,
    staff: null,
    agents: null,
    walletAvailable: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.tenant_id) return;

    let active = true;
    const tenantId = session.tenant_id;

    async function load() {
      setLoading(true);
      setError(null);

      const requests = await Promise.allSettled([
        fetch(`/api/v1/tenants/${tenantId}/departments`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/v1/tenants/${tenantId}/staff`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/v1/tenants/${tenantId}/agents`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/v1/billing/wallet/summary', { credentials: 'include', cache: 'no-store' }),
      ]);

      if (!active) return;

      const next: CountState = { departments: null, staff: null, agents: null, walletAvailable: null };
      const failures: string[] = [];

      const parseArray = async (result: PromiseSettledResult<Response>, label: string) => {
        if (result.status !== 'fulfilled') {
          failures.push(label);
          return null;
        }
        if (!result.value.ok) {
          failures.push(`${label} (${result.value.status})`);
          return null;
        }
        const value = await result.value.json();
        return Array.isArray(value) ? value.length : null;
      };

      next.departments = await parseArray(requests[0], 'departemen');
      next.staff = await parseArray(requests[1], 'staf');
      next.agents = await parseArray(requests[2], 'AI agent');

      const wallet = requests[3];
      if (wallet.status === 'fulfilled' && wallet.value.ok) {
        const value = await wallet.value.json();
        next.walletAvailable = typeof value.available === 'number' ? value.available : null;
      } else {
        failures.push('kredit');
      }

      setData(next);
      if (failures.length === 4) {
        setError('Data workspace belum dapat dimuat dari layanan backend.');
      } else if (failures.length > 0) {
        setError(`Sebagian data belum tersedia: ${failures.join(', ')}.`);
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [session?.tenant_id]);

  const workspaceName =
    session?.tenant_display_name ||
    session?.tenant_legal_name ||
    'Workspace';

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-white pb-16">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0B1220]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali ke Hub
            </a>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold">O</div>
              <span className="font-bold tracking-tight">Orchestree<span className="text-emerald-500">.AI</span></span>
            </div>
          </div>
          {session && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
              <Building2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="max-w-[220px] truncate">{workspaceName}</span>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6 space-y-6">
        {sessionLoading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-sm text-slate-500">
            Memuat konteks workspace...
          </div>
        ) : !session ? (
          <EmptyState
            id="auth-required-overview"
            icon={ShieldAlert}
            title="Sesi Terautentikasi Diperlukan"
            description="Ringkasan workspace hanya menampilkan data organisasi setelah sesi server terverifikasi."
          />
        ) : (
          <>
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Overview</p>
              <h1 className="text-2xl md:text-3xl font-bold mt-1">Ringkasan workspace</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Angka di bawah berasal dari endpoint domain yang sudah ada; tidak ada data demo atau angka sintetis.</p>
            </section>

            {error && (
              <div className="rounded-xl border border-amber-300/60 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-300">
                {error}
              </div>
            )}

            {loading ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-sm text-slate-500">Memuat data operasional...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Departemen" value={data.departments} icon={Building2} />
                <MetricCard label="Staf" value={data.staff} icon={Users} />
                <MetricCard label="AI Agent" value={data.agents} icon={Bot} />
                <MetricCard label="Kredit tersedia" value={data.walletAvailable} icon={CreditCard} />
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="w-4 h-4 text-emerald-500" />
                Status data
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Nilai “—” berarti endpoint sumber belum mengembalikan data; UI tidak menggantinya dengan angka buatan.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <Icon className="w-4 h-4 text-emerald-500" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value === null ? '—' : value.toLocaleString('id-ID')}</div>
    </div>
  );
}
