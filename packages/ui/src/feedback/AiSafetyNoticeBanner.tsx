import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

export interface AiSafetyNoticeBannerProps {
  id?: string;
  className?: string;
  variant?: 'banner' | 'card' | 'inline';
}

export const AI_SAFETY_NOTICE_EXACT_TEXT =
  'OrchestreeAI adalah AI dan dapat melakukan kesalahan. Harap diperiksa kembali jawaban, analisis, rekomendasi, dan hasil sebelum digunakan sebagai dasar pengambilan keputusan.';

/**
 * Komponen Pemberitahuan Keamanan AI Resmi (PRD v2.2 Bagian 5.3 Semantic Warning Token).
 * Wajib ditampilkan pada seluruh layar hasil seleksi dan evaluasi cerdas.
 * Tidak dapat di-dismiss secara permanen; muncul kembali di setiap kunjungan layar.
 */
export function AiSafetyNoticeBanner({
  id = 'ai-safety-notice-banner',
  className = '',
  variant = 'banner',
}: AiSafetyNoticeBannerProps) {
  return (
    <div
      id={id}
      role="alert"
      aria-label="Pemberitahuan Keamanan AI"
      className={`relative flex items-start gap-3 p-3.5 md:p-4 rounded-xl border border-amber-500/30 dark:border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 shadow-sm ${className}`}
    >
      <div className="p-1 rounded-lg bg-amber-500/20 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
        <ShieldAlert className="w-4 h-4 md:w-5 md:h-5 text-amber-600 dark:text-amber-400" />
      </div>

      <div className="flex-1 text-xs md:text-sm leading-relaxed">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-amber-900 dark:text-amber-300 tracking-tight">
            Pemberitahuan Keamanan AI
          </span>
          <span className="text-[11px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono">
            Verifikasi Diperlukan
          </span>
        </div>
        <p className="text-amber-900/90 dark:text-amber-200/90 font-medium">
          {AI_SAFETY_NOTICE_EXACT_TEXT}
        </p>
      </div>
    </div>
  );
}
