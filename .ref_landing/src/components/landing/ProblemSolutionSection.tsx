import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
  TrendingUp,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { CANONICAL_PROBLEMS_SOLUTIONS, ProblemSolutionItem } from './landingData';

export const ProblemSolutionSection: React.FC = () => {
  const [activeItem, setActiveItem] = useState<string>(CANONICAL_PROBLEMS_SOLUTIONS[0].id);

  return (
    <section className="py-24 bg-[#071226] text-white border-t border-white/10 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-red-500/30 text-xs font-semibold text-red-400 mb-4">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>TANTANGAN OPERASIONAL & TRANSFORMASI SISTEM</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Mengapa Cara Kerja Tradisional Menghambat Pertumbuhan Bisnis?
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Dari sistem kerja yang terfragmentasi hingga ketiadaan visibilitas performa. Lihat bagaimana OrchestreeAI mentransformasi 7 hambatan terbesar perusahaan Anda
          </p>
        </div>

        {/* 7 Transformation Cards */}
        <div className="mt-16 space-y-4">
          {CANONICAL_PROBLEMS_SOLUTIONS.map((item) => {
            const isExpanded = activeItem === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setActiveItem(isExpanded ? '' : item.id)}
                className={`p-6 rounded-3xl border transition-all cursor-pointer ${
                  isExpanded
                    ? 'bg-gradient-to-r from-white/[0.06] via-[#0B1835] to-white/[0.04] border-[#08B85C]/50 shadow-xl'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <span className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-mono font-bold text-sm flex items-center justify-center shrink-0">
                      0{item.problemNumber}
                    </span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                          Hambatan
                        </span>
                        <h4 className="font-bold text-base text-white">{item.problemTitle}</h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{item.problemDesc}</p>
                    </div>
                  </div>

                  {/* Transformation State Badge */}
                  <div className="flex items-center space-x-3 shrink-0 self-end md:self-center">
                    <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#08B85C]/20 text-[#08B85C] border border-[#08B85C]/40">
                      → {item.stateBadge}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180 text-white' : ''}`}
                    />
                  </div>
                </div>

                {/* Expanded Solution Detail */}
                {isExpanded && (
                  <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-200">
                    <div className="p-4 rounded-2xl bg-red-500/[0.05] border border-red-500/20 space-y-2">
                      <div className="flex items-center space-x-2 text-red-400 text-xs font-bold uppercase">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Dampak Tanpa OrchestreeAI</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {item.problemDesc} Hal ini menyebabkan biaya SDM membengkak, koordinasi lambat, dan ketergantungan fatal pada prompt manual personal.
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-[#08B85C]/[0.08] border border-[#08B85C]/30 space-y-2">
                      <div className="flex items-center space-x-2 text-[#08B85C] text-xs font-bold uppercase">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Solusi: {item.solutionTitle}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {item.solutionDesc}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
