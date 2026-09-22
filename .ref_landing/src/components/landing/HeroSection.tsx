import React from 'react';
import {
  Sparkles,
  ArrowRight,
  Play,
  CheckCircle2,
  Users2,
  Cpu,
  Workflow,
  ShieldCheck,
  Zap,
  Layers,
  ArrowDownRight,
  TrendingUp,
  Clock,
  Check,
  Building2,
  ChevronRight,
  Bot,
  Activity,
  Network,
  Smartphone,
} from 'lucide-react';

interface HeroSectionProps {
  onScrollToSection: (sectionId: string) => void;
  onOpenProspectForm?: (interest?: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onScrollToSection, onOpenProspectForm }) => {
  return (
    <section id="hero" className="relative pt-12 pb-24 overflow-hidden bg-gradient-to-b from-[#071226] via-[#0B1835] to-[#071226] text-white">
      {/* Background Ambient Glow & Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(8,184,92,0.15),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Tagline Pill */}
        <div className="flex justify-center">
          <div className="inline-flex items-center space-x-2.5 px-4 py-1.5 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-slate-300 backdrop-blur-md shadow-inner">
            <span className="flex h-2 w-2 rounded-full bg-[#08B85C] animate-pulse" />
            <span className="text-[#08B85C] font-bold uppercase tracking-wider">AI WORKFORCE OPERATING SYSTEM</span>
            <span className="text-slate-500">|</span>
            <span>Bukan Sekadar Chatbot atau Prompt Tool</span>
          </div>
        </div>

        {/* Main Hero Headlines */}
        <div className="mt-8 text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15] text-white">
            Bangun Workforce Baru{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8]">
              Manusia + AI
            </span>
            , Bekerja Sebagai Satu Sistem
          </h1>

          <p className="mt-6 text-base sm:text-lg lg:text-xl text-slate-300 leading-relaxed max-w-3xl mx-auto font-normal">
            OrchestreeAI menghubungkan <strong className="text-white font-semibold">Staff asli perusahaan</strong> dengan <strong className="text-[#08B85C] font-semibold">Staff AI Agent</strong> yang bekerja sesuai jabatan, jobdesk, jadwal, target, tools dan data perusahaan — secara otomatis dan realtime
          </p>

          {/* Primary & Secondary Action Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {onOpenProspectForm ? (
              <>
                <button
                  onClick={() => onOpenProspectForm('direct_trial_or_subscription')}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white font-bold text-base shadow-xl shadow-[#08B85C]/25 hover:shadow-[#08B85C]/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer group"
                >
                  <Sparkles className="w-5 h-5 text-white" />
                  <span>Daftar Seleksi Trial (36 Slot)</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => onOpenProspectForm('schedule_meeting_presentation')}
                  className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-semibold text-base backdrop-blur-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Building2 className="w-4 h-4 text-[#16B7D9]" />
                  <span>Jadwalkan Presentasi Solusi</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onScrollToSection('workforce-universe')}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white font-bold text-base shadow-xl shadow-[#08B85C]/25 hover:shadow-[#08B85C]/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer group"
                >
                  <span>Jelajahi AI Workforce OS</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => onScrollToSection('how-it-works')}
                  className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-semibold text-base backdrop-blur-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 text-[#16B7D9]" />
                  <span>Lihat Cara Kerjanya</span>
                </button>
              </>
            )}
          </div>

          {/* Direct Mobile App Notice Link */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
            <span className="hidden sm:inline">Sistem Beroperasi Penuh pada Aplikasi Mobile:</span>
            <button
              onClick={() => onScrollToSection('mobile-app')}
              className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:border-[#08B85C]/50 hover:bg-white/10 text-slate-200 hover:text-white transition-all cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#08B85C]" />
              <span className="font-semibold">Unduh Aplikasi di Play Store & App Store</span>
            </button>
          </div>

          {/* Quick Value Proof Indicators */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-medium">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-[#08B85C]" />
              <span>Staf Manusia + AI Bekerja Berdampingan</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-[#08B85C]" />
              <span>Integrasi WhatsApp, Slack & Tools Resmi</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-[#08B85C]" />
              <span>Kontrol Manusia Penuh & Approval Gate</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-[#08B85C]" />
              <span>Isolasi Multi-Tenant Enkripsi AES-256</span>
            </div>
          </div>
        </div>

        {/* 1. LIVING WORKFORCE OPERATING SYSTEM INTERACTIVE ARCHITECTURE COCKPIT */}
        <div className="mt-16 relative">
          <div className="rounded-3xl border border-white/15 bg-[#071226]/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl overflow-hidden">
            {/* Top Bar Status */}
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-white/10 gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-[#08B85C] animate-ping" />
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white flex items-center space-x-2">
                    <span>LIVING WORKFORCE OPERATING SYSTEM</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#08B85C]/20 text-[#08B85C] border border-[#08B85C]/30">
                      LIVE ORCHESTRATION
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sistem koordinasi real-time antara pimpinan, staf departemen manusia, dan staf AI Agent spesialis
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-4 text-xs font-mono">
                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#08B85C]" />
                  <span className="text-slate-300">16 AI Agents Active</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#1976E8]" />
                  <span className="text-slate-300">Human Staff Paired</span>
                </div>
              </div>
            </div>

            {/* Visual Workforce Network Map */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              {/* Left Column: Human Staff Layer */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2 px-1">
                  <Users2 className="w-3.5 h-3.5 text-[#1976E8]" />
                  <span>HUMAN WORKFORCE LAYER</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#1976E8]/40 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">👔</span>
                    <div>
                      <div className="text-xs font-bold text-white">Budi Santoso</div>
                      <div className="text-[11px] text-slate-400">Chief Executive Officer</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1976E8]/20 text-[#1976E8] border border-[#1976E8]/30 font-semibold">
                    Approver
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#1976E8]/40 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">👩‍💼</span>
                    <div>
                      <div className="text-xs font-bold text-white">Maya Wulandari</div>
                      <div className="text-[11px] text-slate-400">Marketing Director</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#08B85C]/20 text-[#08B85C] border border-[#08B85C]/30 font-semibold">
                    Paired: AI Mkt
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#1976E8]/40 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🧑‍💼</span>
                    <div>
                      <div className="text-xs font-bold text-white">Doni Pratama</div>
                      <div className="text-[11px] text-slate-400">Senior Account Exec</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#16B7D9]/20 text-[#16B7D9] border border-[#16B7D9]/30 font-semibold">
                    Paired: AI Sales
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#1976E8]/40 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">👩‍💼</span>
                    <div>
                      <div className="text-xs font-bold text-white">Siti Rahma</div>
                      <div className="text-[11px] text-slate-400">Finance & Tax Manager</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                    Paired: AI CFO
                  </span>
                </div>
              </div>

              {/* Center Column: OrchestreeAI Core Operating Hub */}
              <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-gradient-to-b from-[#0B1835] to-[#071226] border border-[#08B85C]/40 shadow-xl shadow-[#08B85C]/10 text-center relative">
                <div className="absolute -top-3 px-3 py-0.5 rounded-full bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-[10px] font-bold text-white uppercase tracking-wider">
                  Central Orchestrator
                </div>

                <img
                  src="/logoorchestreeweb.png"
                  alt="OrchestreeAI Core"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-contain shadow-xl shadow-[#08B85C]/30 mb-3 mt-2 transition-transform hover:scale-105"
                  referrerPolicy="no-referrer"
                />

                <h4 className="text-lg font-extrabold text-white">Orchestree.AI OS</h4>
                <p className="text-xs text-slate-300 mt-1 max-w-xs">
                  Company Brain • RBAC Policy • Multi-Agent Routing • WhatsApp Gateway
                </p>

                <div className="mt-4 w-full grid grid-cols-2 gap-2 text-[10px] font-mono text-left">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300">
                    <span className="text-[#08B85C] font-bold">Orchestration Core:</span> Multi-step DAG
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300">
                    <span className="text-[#16B7D9] font-bold">Memory:</span> Closed-Loop Vault
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300">
                    <span className="text-[#1976E8] font-bold">Tools:</span> REST & Webhooks
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300">
                    <span className="text-emerald-400 font-bold">Security:</span> AES-256 / PDP
                  </div>
                </div>
              </div>

              {/* Right Column: AI Workforce Specialists */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2 px-1">
                  <Cpu className="w-3.5 h-3.5 text-[#08B85C]" />
                  <span>AI WORKFORCE SPECIALISTS</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#08B85C]/40 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">👑</span>
                    <div>
                      <div className="text-xs font-bold text-white">Arya</div>
                      <div className="text-[11px] text-slate-400">AI Chief of Staff</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#08B85C]/20 text-[#08B85C] border border-[#08B85C]/30 font-semibold">
                    Orchestrating
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#08B85C]/40 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🚀</span>
                    <div>
                      <div className="text-xs font-bold text-white">Kirana & Reza</div>
                      <div className="text-[11px] text-slate-400">AI Marketing & Copy</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#16B7D9]/20 text-[#16B7D9] border border-[#16B7D9]/30 font-semibold">
                    Content Ready
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#08B85C]/40 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">💼</span>
                    <div>
                      <div className="text-xs font-bold text-white">Rian</div>
                      <div className="text-[11px] text-slate-400">AI Sales & CRM</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1976E8]/20 text-[#1976E8] border border-[#1976E8]/30 font-semibold">
                    WA Live 24/7
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#08B85C]/40 transition-all flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">📈</span>
                    <div>
                      <div className="text-xs font-bold text-white">Hendra</div>
                      <div className="text-[11px] text-slate-400">AI CFO Modeler</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                    Reconciled
                  </span>
                </div>
              </div>
            </div>

            {/* Explanatory Architecture Footer Banner */}
            <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center sm:text-left">
              <div className="flex items-start space-x-3 p-3 rounded-xl bg-white/[0.02]">
                <Network className="w-5 h-5 text-[#08B85C] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">Multi-Agent Task Routing</div>
                  <div className="text-[11px] text-slate-400">Tugas otomatis didelegasikan ke AI spesialis sesuai jabatan dan SOP</div>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-xl bg-white/[0.02]">
                <Activity className="w-5 h-5 text-[#16B7D9] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">Live Health & Readiness</div>
                  <div className="text-[11px] text-slate-400">Pemantauan beban kerja staf manusia dan status kesiapan agen 24/7</div>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-xl bg-white/[0.02]">
                <ShieldCheck className="w-5 h-5 text-[#1976E8] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">Human Control & Approval</div>
                  <div className="text-[11px] text-slate-400">Setiap aksi berisiko tinggi mewajibkan persetujuan pimpinan divisi</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

