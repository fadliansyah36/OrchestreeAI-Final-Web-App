'use client';

import React from 'react';
import { AgentCreationScreen } from '../../../../components/workforce/AgentCreationScreen';
import { ArrowLeft, Bot } from 'lucide-react';

export default function AgentCreationPage() {
  const activeTenant = {
    tenant_id: 'a01aef1c-8274-4de9-a7bc-1618631a4961',
    role: 'TENANT_OWNER',
  };

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
        <AgentCreationScreen
          tenantId={activeTenant.tenant_id}
          userRole={activeTenant.role}
          onSuccess={(_agent: any) => {
            window.location.href = '/workforce';
          }}
          onCancel={() => {
            window.location.href = '/workforce';
          }}
        />
      </div>
    </main>
  );
}
