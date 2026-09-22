'use client';

import React from 'react';
import { HomeOverviewScreen } from '../../components/workforce/HomeOverviewScreen';
import { Building2, ArrowLeft } from 'lucide-react';

export default function OverviewPage() {
  const activeTenant = {
    tenant_id: 'd1159d6d-0044-42ea-8007-d549a0011402',
    legal_name: 'PT Nusantara Jaya Digital',
    display_name: 'Nusantara Digital',
    slug: 'nusantara-digital',
    email: 'admin@nusantara.digital',
    role: 'TENANT_OWNER',
    token: 'jwt_authenticated_token_orchestree',
  };

  return (
    <main className="min-h-screen bg-[#0B1220] pb-16 text-white">
      <header className="border-b border-slate-800 bg-[#0F172A]/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Hub</span>
            </a>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                O
              </div>
              <span className="font-bold tracking-tight text-white text-base">
                Orchestree<span className="text-emerald-500">.AI</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Nusantara Digital</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
        <HomeOverviewScreen tenant={activeTenant as any} />
      </div>
    </main>
  );
}
