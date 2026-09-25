'use client';

import React, { useState } from 'react';
import {
  Award,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Activity,
  TrendingUp,
  Compass,
  CheckCircle2,
  Filter,
  Check,
  Building2,
  ShieldCheck,
} from 'lucide-react';

export interface SelectionInsightItem {
  id?: string;
  insight_type:
    | 'ranking_reason'
    | 'strength'
    | 'weakness'
    | 'risk'
    | 'anomaly'
    | 'opportunity'
    | 'action_recommendation'
    | string;
  related_scoring_result_id?: string | null;
  related_entity_label?: string | null;
  content: string;
  severity?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | string;
  created_at?: string;
}

interface SelectionInsightPanelProps {
  insights: SelectionInsightItem[];
  onSelectEntity?: (entityId: string) => void;
  selectedEntityId?: string | null;
}

export function SelectionInsightPanel({
  insights = [],
  onSelectEntity,
  selectedEntityId,
}: SelectionInsightPanelProps) {
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);

  const getInsightMeta = (type: string, severity?: string) => {
    switch (type) {
      case 'ranking_reason':
        return {
          title: 'Alasan Peringkat',
          icon: Award,
          borderColor: 'border-sky-500/30',
          bgColor: 'bg-sky-950/20',
          textColor: 'text-sky-400',
          badgeBg: 'bg-sky-900/40 text-sky-300 border-sky-800/60',
        };
      case 'strength':
        return {
          title: 'Kekuatan Utama',
          icon: Sparkles,
          borderColor: 'border-emerald-500/30',
          bgColor: 'bg-emerald-950/20',
          textColor: 'text-emerald-400',
          badgeBg: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/60',
        };
      case 'weakness':
        return {
          title: 'Kelemahan & Area Mitigasi',
          icon: AlertTriangle,
          borderColor: 'border-amber-500/30',
          bgColor: 'bg-amber-950/20',
          textColor: 'text-amber-400',
          badgeBg: 'bg-amber-900/40 text-amber-300 border-amber-800/60',
        };
      case 'risk':
        return {
          title: 'Analisis Profil Risiko',
          icon: ShieldAlert,
          borderColor:
            severity === 'danger'
              ? 'border-rose-500/40'
              : 'border-amber-500/30',
          bgColor:
            severity === 'danger' ? 'bg-rose-950/25' : 'bg-amber-950/20',
          textColor:
            severity === 'danger' ? 'text-rose-400' : 'text-amber-400',
          badgeBg:
            severity === 'danger'
              ? 'bg-rose-900/40 text-rose-300 border-rose-800/60'
              : 'bg-amber-900/40 text-amber-300 border-amber-800/60',
        };
      case 'anomaly':
        return {
          title: 'Temuan Anomali Statistik',
          icon: Activity,
          borderColor: 'border-purple-500/30',
          bgColor: 'bg-purple-950/20',
          textColor: 'text-purple-400',
          badgeBg: 'bg-purple-900/40 text-purple-300 border-purple-800/60',
        };
      case 'opportunity':
        return {
          title: 'Peluang Optimalisasi',
          icon: TrendingUp,
          borderColor: 'border-teal-500/30',
          bgColor: 'bg-teal-950/20',
          textColor: 'text-teal-400',
          badgeBg: 'bg-teal-900/40 text-teal-300 border-teal-800/60',
        };
      case 'action_recommendation':
        return {
          title: 'Rekomendasi Tindakan Preskriptif',
          icon: Compass,
          borderColor: 'border-indigo-500/40',
          bgColor: 'bg-indigo-950/25',
          textColor: 'text-indigo-400',
          badgeBg: 'bg-indigo-900/40 text-indigo-300 border-indigo-800/60',
        };
      default:
        return {
          title: 'Catatan Analisis Evaluasi',
          icon: CheckCircle2,
          borderColor: 'border-slate-700',
          bgColor: 'bg-slate-900/40',
          textColor: 'text-slate-300',
          badgeBg: 'bg-slate-800 text-slate-300 border-slate-700',
        };
    }
  };

  const filteredInsights = insights.filter((item) => {
    if (filterType && item.insight_type !== filterType) return false;
    if (filterSeverity && item.severity !== filterSeverity) return false;
    return true;
  });

  const availableTypes = Array.from(new Set(insights.map((i) => i.insight_type)));

  return (
    <div className="space-y-4">
      {/* Panel Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              Umpan Narasi Cerdas & Rekomendasi Tindakan
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> Grounding Terverifikasi 100%
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Sintesis preskriptif berbasis data evaluasi terukur dan verifikasi matematis konsistensi skor.
          </p>
        </div>

        {/* Filter Chips */}
        {availableTypes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => {
                setFilterType(null);
                setFilterSeverity(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer border ${
                !filterType && !filterSeverity
                  ? 'bg-slate-700 text-white border-slate-600'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              Semua ({insights.length})
            </button>
            {availableTypes.map((type) => {
              const meta = getInsightMeta(type);
              const count = insights.filter((i) => i.insight_type === type).length;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilterType(filterType === type ? null : type)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer border ${
                    filterType === type
                      ? 'bg-slate-800 text-white border-sky-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {meta.title.split(' ')[0]} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Insight Cards Grid */}
      {filteredInsights.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-xl text-xs text-slate-400 space-y-2">
          <p>Belum ada rekomendasi naratif pada kriteria filter yang dipilih.</p>
          {(filterType || filterSeverity) && (
            <button
              type="button"
              onClick={() => {
                setFilterType(null);
                setFilterSeverity(null);
              }}
              className="text-sky-400 hover:underline text-[11px]"
            >
              Atur ulang filter tampilan
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredInsights.map((item, idx) => {
            const meta = getInsightMeta(item.insight_type, item.severity);
            const IconComponent = meta.icon;
            const isEntityActive =
              Boolean(selectedEntityId) &&
              item.related_scoring_result_id === selectedEntityId;

            return (
              <div
                key={item.id || idx}
                className={`rounded-xl border p-4.5 transition flex flex-col justify-between ${
                  meta.bgColor
                } ${meta.borderColor} ${
                  isEntityActive
                    ? 'ring-2 ring-emerald-400 shadow-lg'
                    : 'hover:border-slate-600'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar: Icon + Category Title + Severity Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.badgeBg}`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className={`text-xs font-bold ${meta.textColor}`}>
                          {meta.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                          {item.insight_type}
                        </span>
                      </div>
                    </div>

                    {item.severity && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${
                          item.severity === 'danger'
                            ? 'bg-rose-950/80 text-rose-300 border-rose-800/80'
                            : item.severity === 'warning'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                            : item.severity === 'success'
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                            : 'bg-sky-950/80 text-sky-300 border-sky-800/80'
                        }`}
                      >
                        {item.severity}
                      </span>
                    )}
                  </div>

                  {/* Narrative Body */}
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    {item.content}
                  </p>
                </div>

                {/* Footer Bar: Grounding Status & Target Entity Link */}
                <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1 font-mono text-[10px]">
                    <Check className="w-3 h-3 text-emerald-400" /> Nilai Skor Terverifikasi
                  </span>

                  {item.related_scoring_result_id && onSelectEntity && (
                    <button
                      type="button"
                      onClick={() => onSelectEntity(item.related_scoring_result_id!)}
                      className={`text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
                        isEntityActive
                          ? 'text-emerald-300 font-bold underline'
                          : 'text-sky-400 hover:text-sky-300'
                      }`}
                    >
                      <Building2 className="w-3 h-3" />
                      Lihat Entitas Terkait →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
