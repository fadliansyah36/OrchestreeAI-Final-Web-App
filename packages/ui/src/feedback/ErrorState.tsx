import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export interface ErrorStateProps {
  id?: string;
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ErrorState({
  id = 'error-state-view',
  title = 'Terjadi Kendala Koneksi',
  message,
  retryLabel = 'Coba Lagi',
  onRetry
}: ErrorStateProps) {
  return (
    <div
      id={id}
      className="flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 w-full"
    >
      <div className="p-3 rounded-2xl bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 mb-3.5">
        <AlertCircle className="w-7 h-7" />
      </div>

      <h3 className="text-base font-semibold text-red-950 dark:text-red-200 mb-1">
        {title}
      </h3>

      <p className="text-sm text-red-700/80 dark:text-red-300/80 max-w-md mb-5 leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-300 text-sm font-medium transition-colors shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
}
