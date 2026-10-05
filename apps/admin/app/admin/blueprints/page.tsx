'use client';

import React from 'react';
import { useAdminSession } from '../../../lib/useAdminSession';
import { AgentBlueprintCatalogScreen } from '../../../components/AgentBlueprintCatalogScreen';
import { PromptTemplateCuratorScreen } from '../../../components/PromptTemplateCuratorScreen';
import { EmptyState } from '@orchestree/ui';
import { ShieldAlert, ArrowLeft, Boxes, Sparkles } from 'lucide-react';

export default function AdminBlueprintsPage() {
  const { loading, isPlatformAdmin } = useAdminSession();
  const [catalogView, setCatalogView] = React.useState<'agents' | 'prompts'>('agents');

  return (
    <main className="min-h-screen p-6 md:p-8 bg-[#070D18] text-white">
      <div className="max-w-7xl mx-auto mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Konsol Utama</span>
        </a>

        {/* View Switcher: AI Agents vs Prompt Templates */}
        <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => setCatalogView('agents')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              catalogView === 'agents'
                ? 'bg-purple-950/80 text-purple-200 border border-purple-800/60 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Blueprint Agen AI</span>
          </button>
          <button
            type="button"
            onClick={() => setCatalogView('prompts')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              catalogView === 'prompts'
                ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-800/60 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pustaka Template Prompt</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi protokol otorisasi...</div>
      ) : isPlatformAdmin ? (
        catalogView === 'agents' ? (
          <AgentBlueprintCatalogScreen />
        ) : (
          <PromptTemplateCuratorScreen />
        )
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="admin-blueprints-auth-guard"
            icon={ShieldAlert}
            title="Otentikasi Super Admin & MFA Diperlukan"
            description="Akses pengelolaan repositori blueprint resmi dan transisi status rilis memerlukan otorisasi Super Admin dengan MFA aktif."
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
