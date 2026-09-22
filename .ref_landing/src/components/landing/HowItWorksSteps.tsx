import React, { useState } from 'react';
import {
  Building2,
  Users,
  Sparkles,
  Workflow,
  Clock,
  Cpu,
  BarChart3,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { HOW_IT_WORKS_STEPS, HowItWorksStep } from './landingData';

export const HowItWorksSteps: React.FC = () => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const currentStep = HOW_IT_WORKS_STEPS[activeStepIndex];

  const getStepIcon = (iconName: string) => {
    switch (iconName) {
      case 'Building2':
        return <Building2 className="w-5 h-5" />;
      case 'Users':
        return <Users className="w-5 h-5" />;
      case 'Sparkles':
        return <Sparkles className="w-5 h-5" />;
      case 'Workflow':
        return <Workflow className="w-5 h-5" />;
      case 'Clock':
        return <Clock className="w-5 h-5" />;
      case 'Cpu':
        return <Cpu className="w-5 h-5" />;
      case 'BarChart3':
        return <BarChart3 className="w-5 h-5" />;
      case 'RefreshCw':
      default:
        return <RefreshCw className="w-5 h-5" />;
    }
  };

  return (
    <section id="how-it-works" className="py-24 bg-gradient-to-b from-[#071226] via-[#0B1835] to-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#16B7D9]/30 text-xs font-semibold text-[#16B7D9] mb-4">
            <Workflow className="w-3.5 h-3.5" />
            <span>8-STEP OPERATING BLUEPRINT</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Bagaimana OrchestreeAI Bekerja di Perusahaan Anda?
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Dari inisialisasi Company Brain hingga siklus peningkatan mandiri (Closed-Loop Improvement). Alur adopsi terstruktur yang dirancang untuk implementasi instan
          </p>
        </div>

        {/* 8 Step Navigation Pills */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {HOW_IT_WORKS_STEPS.map((step, idx) => {
            const isActive = activeStepIndex === idx;
            return (
              <button
                key={step.stepNumber}
                onClick={() => setActiveStepIndex(idx)}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-between ${
                  isActive
                    ? 'bg-gradient-to-b from-[#08B85C]/20 to-[#1976E8]/20 border-[#08B85C] shadow-lg shadow-[#08B85C]/15 ring-1 ring-[#08B85C]'
                    : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-[10px] font-mono font-bold">{step.stepNumber}</span>
                <div className={`my-1.5 ${isActive ? 'text-[#08B85C]' : 'text-slate-400'}`}>
                  {getStepIcon(step.icon)}
                </div>
                <span className="text-[11px] font-bold truncate max-w-full">{step.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Step Feature Box */}
        <div className="mt-10 rounded-3xl bg-[#071226] border border-white/15 p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Col Info */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center space-x-3">
                <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#08B85C] to-[#1976E8] flex items-center justify-center text-white text-xl font-mono font-bold shadow-lg shadow-[#08B85C]/20">
                  {currentStep.stepNumber}
                </span>
                <div>
                  <span className="text-xs uppercase font-bold text-[#08B85C] tracking-wider">
                    {currentStep.subtitle}
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                    {currentStep.title}
                  </h3>
                </div>
              </div>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                {currentStep.description}
              </p>

              {/* Highlights */}
              <div className="space-y-2.5 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Fitur Kunci:
                </span>
                <ul className="space-y-2">
                  {currentStep.highlightPoints.map((point, idx) => (
                    <li key={idx} className="flex items-center space-x-2 text-xs sm:text-sm text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-[#08B85C] shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Step Navigation Controls */}
              <div className="flex items-center space-x-3 pt-4">
                <button
                  disabled={activeStepIndex === 0}
                  onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
                  className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  ← Langkah Sebelumnya
                </button>
                <button
                  disabled={activeStepIndex === HOW_IT_WORKS_STEPS.length - 1}
                  onClick={() => setActiveStepIndex((prev) => Math.min(HOW_IT_WORKS_STEPS.length - 1, prev + 1))}
                  className="px-4 py-2 rounded-xl bg-[#08B85C] text-white text-xs font-bold hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center space-x-1.5"
                >
                  <span>Langkah Berikutnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Right Col Interactive Visual Teaser */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 text-xs font-mono">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 text-slate-400">
                <span>ORCHESTREEAI ENGINE STAGE</span>
                <span className="text-[#08B85C] font-bold">READY</span>
              </div>

              <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <div className="text-[11px] text-[#16B7D9] font-bold">
                  Stage {currentStep.stepNumber}: {currentStep.title}
                </div>
                <div className="text-slate-300 text-[11px] leading-snug font-sans">
                  Sistem mengeksekusi parameter terisolasi dengan verifikasi Policy Decision Point (PDP) dan sinkronisasi Company Brain.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-300">
                  <span className="text-slate-500 block font-sans">Audit Logging</span>
                  <span className="text-[#08B85C]">100% Immutable</span>
                </div>
                <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-300">
                  <span className="text-slate-500 block font-sans">Enkripsi</span>
                  <span className="text-[#1976E8]">AES-256 GCM</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
