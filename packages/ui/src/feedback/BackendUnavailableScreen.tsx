'use client';

import React from 'react';
import { WifiOff, RefreshCw, Radio } from 'lucide-react';

export interface BackendUnavailableScreenProps {
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function BackendUnavailableScreen({
  onRetry,
  isRetrying = false,
}: BackendUnavailableScreenProps) {
  return (
    <div
      data-testid="backend-unavailable-screen"
      className="min-h-screen w-full bg-[#070D18] text-white flex flex-col items-center justify-center p-6 select-none font-sans antialiased"
    >
      <div className="w-full max-w-lg mx-auto flex flex-col items-center text-center">
        {/* Brand Header */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-emerald-950/40">
            O
          </div>
          <span className="font-bold tracking-tight text-white text-base">
            Orchestree<span className="text-emerald-400">.AI</span>
          </span>
        </div>

        {/* Disconnected Status Icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-3xl bg-red-950/50 border border-red-500/40 flex items-center justify-center text-red-400 shadow-2xl shadow-red-950/60">
            <WifiOff className="w-10 h-10 stroke-[1.75]" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-600 border-2 border-[#070D18] flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
          Tidak Terhubung ke Server
        </h1>

        {/* Description */}
        <p className="text-sm sm:text-base text-slate-300/90 max-w-md leading-relaxed mb-8">
          OrchestreeAI memerlukan koneksi aktif ke server untuk menampilkan data yang sesungguhnya.
          Aplikasi tidak dapat diakses dalam kondisi ini untuk mencegah tampilan data yang tidak akurat.
        </p>

        {/* Action Button */}
        <div className="flex flex-col items-center gap-4 w-full sm:w-auto">
          <button
            type="button"
            data-testid="retry-connectivity-button"
            disabled={isRetrying}
            onClick={onRetry}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm shadow-xl shadow-emerald-950/50 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Memeriksa...' : 'Coba Lagi'}</span>
          </button>

          {/* Automatic Polling Indicator */}
          <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 py-1.5 px-3 rounded-full bg-slate-900/80 border border-slate-800">
            <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Memeriksa ulang secara otomatis...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
