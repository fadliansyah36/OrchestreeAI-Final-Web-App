import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Terminal, Bug } from 'lucide-react';

export interface HonestErrorInfo {
  endpoint: string;
  status?: number | string;
  message: string;
  rawDetails?: any;
  timestamp?: string;
}

interface HonestErrorBannerProps {
  error: HonestErrorInfo | string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
  title?: string;
}

export const HonestErrorBanner: React.FC<HonestErrorBannerProps> = ({
  error,
  onRetry,
  isRetrying = false,
  title = 'Laporan Kesalahan Endpoint Backend (Status Transparan Super Admin)',
}) => {
  const [showRaw, setShowRaw] = useState(false);

  if (!error) return null;

  const normalizedError: HonestErrorInfo =
    typeof error === 'string'
      ? {
          endpoint: 'API Request',
          status: 'ERROR',
          message: error,
          timestamp: new Date().toLocaleTimeString(),
        }
      : {
          ...error,
          timestamp: error.timestamp || new Date().toLocaleTimeString(),
        };

  return (
    <div className="bg-rose-950/70 border border-rose-700/80 rounded-xl p-4 shadow-lg text-rose-200 space-y-3 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-900/60 border border-rose-700 text-rose-300 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-xs sm:text-sm">{title}</span>
              {normalizedError.status && (
                <span className="px-2 py-0.5 rounded bg-rose-900 border border-rose-600 text-rose-200 text-[10px] font-mono font-bold">
                  Status: {normalizedError.status}
                </span>
              )}
              <span className="text-[11px] text-rose-300/80 font-mono">
                [{normalizedError.endpoint}]
              </span>
            </div>
            <p className="text-xs text-rose-100 mt-1 font-medium leading-relaxed">
              {normalizedError.message}
            </p>
            <div className="text-[10px] text-rose-400 mt-1 flex items-center gap-2">
              <span>Waktu Kejadian: {normalizedError.timestamp}</span>
              <span>•</span>
              <span className="text-amber-300 font-medium">
                Pemberitahuan Jujur: Backend belum/gagal merespons data valid.
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 text-white text-xs font-semibold border border-rose-600 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Mencoba Ulang...' : 'Coba Lagi'}</span>
            </button>
          )}
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="p-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800/80 text-rose-300 border border-rose-700 text-xs transition"
            title="Tampilkan Detail Raw"
          >
            {showRaw ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {showRaw && (
        <div className="mt-2 pt-2 border-t border-rose-800/60 text-[11px] font-mono bg-black/40 rounded-lg p-3 space-y-1 overflow-x-auto text-rose-200">
          <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-1">
            <Terminal className="w-3.5 h-3.5" />
            <span>Raw Diagnostic Payload:</span>
          </div>
          <div>Endpoint: {normalizedError.endpoint}</div>
          <div>HTTP Status: {normalizedError.status ?? 'N/A'}</div>
          <div>Pesan Asli: {normalizedError.message}</div>
          {normalizedError.rawDetails && (
            <pre className="mt-1 text-[10px] text-rose-300 whitespace-pre-wrap">
              {typeof normalizedError.rawDetails === 'string'
                ? normalizedError.rawDetails
                : JSON.stringify(normalizedError.rawDetails, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
