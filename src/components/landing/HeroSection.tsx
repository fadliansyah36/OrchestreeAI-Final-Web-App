import React from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Users2,
  Workflow,
  Building2,
  ChevronRight,
  Bot
} from 'lucide-react';

interface HeroSectionProps {
  onScrollToSection: (sectionId: string) => void;
  onOpenRegister: () => void;
  onOpenProspectModal: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onScrollToSection,
  onOpenRegister,
  onOpenProspectModal,
}) => {
  return (
    <section id="hero" className="relative pt-12 pb-24 overflow-hidden bg-gradient-to-b from-[#0B1220] via-[#0B1B2B] to-[#0B1220] text-white">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(31,163,90,0.18),rgba(30,111,224,0.12),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Tagline Badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center space-x-2.5 px-4 py-1.5 rounded-full bg-white/5 border border-[#34D399]/30 text-xs font-semibold text-slate-300 backdrop-blur-md shadow-inner">
            <span className="flex h-2 w-2 rounded-full bg-[#34D399] animate-pulse" />
            <span className="text-[#34D399] font-bold uppercase tracking-wider">AI WORKFORCE OPERATING SYSTEM</span>
            <span className="text-slate-500">|</span>
            <span>Bukan Sekadar Chatbot atau Prompt Sederhana</span>
          </div>
        </div>

        {/* Main Hero Headline */}
        <div className="mt-8 text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15] text-white">
            One AI Workforce Operating System{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#34D399] via-[#60A5FA] to-[#A78BFA]">
              for Every Organization
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg lg:text-xl text-slate-300 leading-relaxed max-w-3xl mx-auto font-normal">
            OrchestreeAI menghubungkan <strong className="text-white font-semibold">Staf Manusia</strong> dengan{' '}
            <strong className="text-[#34D399] font-semibold">Staf AI Otonom</strong> yang bekerja terintegrasi sesuai jabatan, target kerja, tools korporat, dan data perusahaan secara aman dan terisolasi.
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onOpenRegister}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-[#1FA35A] via-[#1E6FE0] to-[#6C4CD9] text-white font-bold text-base shadow-xl shadow-[#1FA35A]/25 hover:shadow-[#1FA35A]/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer group"
            >
              <Sparkles className="w-5 h-5 text-white" />
              <span>Coba Gratis Sekarang</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={onOpenProspectModal}
              className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-semibold text-base backdrop-blur-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Building2 className="w-5 h-5 text-[#60A5FA]" />
              <span>Request Demo Organisasi</span>
            </button>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Tanpa perlu kartu kredit untuk memulai uji coba sistem. Setup organisasi selesai dalam hitungan menit.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm hover:border-[#34D399]/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-[#1FA35A]/20 text-[#34D399] flex items-center justify-center mb-3">
              <Bot className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">15 Jabatan AI Terstandarisasi</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Mulai dari Manajemen, Operasional, Komersial, Teknis, hingga Kreatif dengan wewenang jelas.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm hover:border-[#60A5FA]/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-[#1E6FE0]/20 text-[#60A5FA] flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">Isolasi Mutlak Multi-Tenant</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              PostgreSQL Row-Level Security aktif dan ditegakkan penuh di level basis data per organisasi.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm hover:border-[#A78BFA]/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-[#6C4CD9]/20 text-[#A78BFA] flex items-center justify-center mb-3">
              <Zap className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">Multi-Model Smart Router</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Koneksi otomatis NVIDIA NIM, OpenRouter fallback, Gemini multimodal, dan GPT-Image-2.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm hover:border-[#34D399]/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-[#1FA35A]/20 text-[#34D399] flex items-center justify-center mb-3">
              <Workflow className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">Orkestrasi Kolaboratif</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Siklus kerja otomatis dengan gerbang persetujuan manusia (Human-in-the-Loop) saat diperlukan.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
