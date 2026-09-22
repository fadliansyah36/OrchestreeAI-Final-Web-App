'use client';

import React from 'react';
import {
  AdminSuperHubScreen,
} from '@orchestree/ui';
import { ShieldCheck, Lock } from 'lucide-react';

export default function AdminHomePage() {
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

      {/* Complete Admin Super Hub Screen (PRD v2.2) */}
      <AdminSuperHubScreen initialTab="overview" />
    </main>
  );
}
