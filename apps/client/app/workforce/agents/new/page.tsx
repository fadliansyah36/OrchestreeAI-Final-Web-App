'use client';

import React, { useEffect, useState } from 'react';
import { AgentCreationScreen } from '../../../../components/workforce/AgentCreationScreen';
import { ArrowLeft, Bot, ShieldAlert } from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export default function AgentCreationPage() {
  const [activeTenant, setActiveTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('orchestree_active_tenant');
      if (stored) {
        setActiveTenant(JSON.parse(stored));
      }
    } catch (e) {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B1220] pb-16 text-slate-900 dark:text-white">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0F172A]/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/workforce"
              className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Registri Tenaga Kerja</span>
            </a>
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="font-bold text-sm tracking-tight">Pendaftaran Staf AI</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-8">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi sesi aman...</div>
        ) : activeTenant ? (
          <AgentCreationScreen
            tenantId={activeTenant.tenant_id}
            userRole={activeTenant.role || 'TENANT_OWNER'}
            onSuccess={(_agent: any) => {
              window.location.href = '/workforce';
            }}
            onCancel={() => {
              window.location.href = '/workforce';
            }}
          />
        ) : (
          <div className="max-w-xl mx-auto pt-12">
            <EmptyState
              id="auth-required-agent-new"
              icon={ShieldAlert}
              title="Sesi Terautentikasi Diperlukan"
              description="Pendaftaran agen tenaga kerja otonom memerlukan sesi administratif aktif."
              actionLabel="Masuk ke Portal Resmi"
              onAction={() => {
                window.location.href = '/';
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}
