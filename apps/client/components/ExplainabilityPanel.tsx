import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  Database,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Activity,
  Layers,
  FileText
} from 'lucide-react';

export type DataAvailabilityState =
  | 'AVAILABLE'
  | 'STALE'
  | 'CONFLICTING'
  | 'PARTIAL'
  | 'NOT_AVAILABLE';

export interface ConfidenceBreakdown {
  freshness_score: number;
  completeness_score: number;
  source_reliability_score: number;
  consistency_score: number;
  overall_confidence: number;
  availability_state: DataAvailabilityState;
  reasons: string[];
}

export interface DataSourceItem {
  source_name: string;
  timestamp?: string;
  latency_ms?: number;
  confidence_rating?: number;
}

export interface ExplainabilityPanelProps {
  availabilityState: DataAvailabilityState;
  confidenceScore: number; // 0.0 to 1.0
  breakdown?: ConfidenceBreakdown | null;
  sources?: DataSourceItem[];
  wasFalseClaimRejected?: boolean;
  rejectionReason?: string | null;
  className?: string;
  onRefreshValidation?: () => void;
}

export const ExplainabilityPanel: React.FC<ExplainabilityPanelProps> = ({
  availabilityState,
  confidenceScore,
  breakdown,
  sources = [],
  wasFalseClaimRejected = false,
  rejectionReason,
  className = '',
  onRefreshValidation,
}) => {
  const percentage = Math.round(confidenceScore * 100);

  // Status visual mapping
  const getStateBadge = (state: DataAvailabilityState) => {
    switch (state) {
      case 'AVAILABLE':
        return {
          label: 'Data Tersedia (AVAILABLE)',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
          bgColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          desc: 'Data lengkap, segar, dan konsisten dari sumber terverifikasi.',
        };
      case 'STALE':
        return {
          label: 'Data Usang (STALE)',
          icon: <Clock className="w-3.5 h-3.5 text-amber-500" />,
          bgColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          desc: 'Data telah melewati ambang batas waktu kesegaran (TTL kedaluwarsa).',
        };
      case 'CONFLICTING':
        return {
          label: 'Konflik Nilai (CONFLICTING)',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />,
          bgColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
          desc: 'Sumber data eksternal memberikan nilai saling bertentangan; wajib resolusi manusia.',
        };
      case 'PARTIAL':
        return {
          label: 'Sebagian Tersedia (PARTIAL)',
          icon: <Layers className="w-3.5 h-3.5 text-indigo-500" />,
          bgColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
          desc: 'Sebagian atribut tersedia, namun bidang esensial kunci belum lengkap.',
        };
      case 'NOT_AVAILABLE':
      default:
        return {
          label: 'Tidak Tersedia (NOT_AVAILABLE)',
          icon: <XCircle className="w-3.5 h-3.5 text-slate-500" />,
          bgColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
          desc: 'Data tidak ditemukan atau sumber data kosong.',
        };
    }
  };

  const badgeInfo = getStateBadge(availabilityState);

  return (
    <div className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Transparansi Kepercayaan & Validasi Ketersediaan Data
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit multi-faktor integritas data dan verifikasi penegakan Output Validator.
            </p>
          </div>
        </div>

        {onRefreshValidation && (
          <button
            type="button"
            onClick={onRefreshValidation}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors self-start sm:self-auto"
          >
            Validasi Ulang
          </button>
        )}
      </div>

      {/* Alert bila klaim palsu dicegah */}
      {wasFalseClaimRejected && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-900 dark:text-rose-200 space-y-1">
            <div className="font-bold">Klaim Tidak Sah Dicegah oleh Output Validator</div>
            <p className="text-rose-700 dark:text-rose-300 leading-relaxed">
              {rejectionReason ||
                'Klaim ketersediaan data yang diajukan tidak sesuai fakta aktual dan telah dikoreksi.'}
            </p>
          </div>
        </div>
      )}

      {/* Primary Score & Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Availability Status Card */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
            Status Ketersediaan Data
          </span>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${badgeInfo.bgColor}`}>
            {badgeInfo.icon}
            <span>{badgeInfo.label}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            {badgeInfo.desc}
          </p>
        </div>

        {/* Confidence Score Card */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Skor Kepercayaan Agregat
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {percentage}%
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                percentage >= 75
                  ? 'bg-emerald-500'
                  : percentage >= 50
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${Math.max(4, Math.min(100, percentage))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {percentage >= 75
              ? 'Tingkat kepercayaan tinggi untuk otomatisasi.'
              : percentage >= 50
              ? 'Tingkat kepercayaan moderat; disarankan verifikasi.'
              : 'Tingkat kepercayaan rendah; intervensi manusia diwajibkan.'}
          </p>
        </div>
      </div>

      {/* Factor Breakdown Grid */}
      {breakdown && (
        <div>
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-purple-500" />
            <span>Faktor Penentu Skor Kepercayaan</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Kesegaran (Freshness)</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block">
                {Math.round((breakdown.freshness_score || 0) * 100)}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Kelengkapan Atribut</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block">
                {Math.round((breakdown.completeness_score || 0) * 100)}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Keandalan Sumber</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block">
                {Math.round((breakdown.source_reliability_score || 0) * 100)}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Konsistensi Antar Sumber</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block">
                {Math.round((breakdown.consistency_score || 0) * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Justifikasi & Penjelasan Naratif */}
      {breakdown && breakdown.reasons && breakdown.reasons.length > 0 && (
        <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Catatan Validasi & Alasan Skor</span>
          </span>
          <ul className="space-y-1">
            {breakdown.reasons.map((reason, idx) => (
              <li key={idx} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                <span className="text-purple-500 font-bold">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data Sources List */}
      {sources && sources.length > 0 && (
        <div className="pt-2">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-2 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-slate-500" />
            <span>Sumber Data yang Dianalisis ({sources.length})</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sources.map((src, i) => (
              <div
                key={i}
                className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {src.source_name}
                  </span>
                </div>
                {src.timestamp && (
                  <span className="text-[10px] text-slate-400">
                    {new Date(src.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Audit Notice */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
        <span>Output Validator: Proteksi Klaim Palsu Aktif</span>
        <span>Kebijakan Kualitas Standar Sistem</span>
      </div>
    </div>
  );
};
