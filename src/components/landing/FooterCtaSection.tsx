import React from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  Lock,
  Activity,
  FileText,
  Mail
} from 'lucide-react';

interface FooterCtaProps {
  onOpenRegister: () => void;
  onOpenProspectModal: () => void;
  onViewStartupGate?: () => void;
}

export const FooterCtaSection: React.FC<FooterCtaProps> = ({
  onOpenRegister,
  onOpenProspectModal,
  onViewStartupGate,
}) => {
  return (
    <footer className="bg-gradient-to-b from-[#0B1220] via-[#070D18] to-[#040810] text-white border-t border-white/10 relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-gradient-to-r from-[#1FA35A]/15 via-[#1E6FE0]/20 to-[#6C4CD9]/15 blur-3xl pointer-events-none" />

      {/* Main Pre-footer CTA Box */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 relative">
        <div className="rounded-3xl bg-gradient-to-r from-[#0B1B2B] via-[#0B1220] to-[#0B1B2B] border border-[#1FA35A]/40 p-8 sm:p-14 text-center max-w-5xl mx-auto shadow-2xl relative overflow-hidden">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#34D399]/30 text-xs font-semibold text-[#34D399] mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>KOLABORASI HUMAN + AI BERIKUTNYA</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Mulai Orkestrasikan Tenaga Kerja AI Anda Hari Ini
          </h2>

          <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-2xl mx-auto font-normal">
            Bebaskan staf dari tugas berulang yang memakan waktu. Sambungkan WhatsApp resmi, Company Brain, dan SOP organisasi Anda dengan keamanan terstandarisasi.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
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
        </div>

        {/* Footer Navigation Columns */}
        <div className="mt-20 pt-12 border-t border-white/10 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center space-x-3 mb-3">
              <img
                src="/logoorchestreeweb.png"
                alt="OrchestreeAI"
                className="w-8 h-8 rounded-lg object-contain"
                referrerPolicy="no-referrer"
              />
              <span className="font-extrabold text-lg tracking-tight text-white">
                Orchestree<span className="text-[#34D399]">.AI</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Autonomous AI Workforce Operating System untuk efisiensi operasional organisasi modern dengan isolasi data relasional mutlak.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Arsitektur & Sistem</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <a
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors flex items-center space-x-1"
                >
                  <Activity className="w-3.5 h-3.5 text-[#34D399]" />
                  <span>Status Sistem (Health)</span>
                </a>
              </li>
              <li>
                <span className="text-slate-400 flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>Kepatuhan & Keamanan Data (ISO/IEC 27001)</span>
                </span>
              </li>
              {onViewStartupGate && (
                <li>
                  <button
                    onClick={onViewStartupGate}
                    className="hover:text-white transition-colors flex items-center space-x-1 cursor-pointer text-left"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>Laporan Gerbang Sistem</span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Keamanan & Legal</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-center space-x-1">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>PostgreSQL Row-Level Security</span>
              </li>
              <li>
                <span className="hover:text-white cursor-pointer">Kebijakan Privasi Data</span>
              </li>
              <li>
                <span className="hover:text-white cursor-pointer">Syarat & Ketentuan Layanan</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Hubungi Kami</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-center space-x-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>halo@orchestree.biz.id</span>
              </li>
              <li>
                <span>Jakarta, Indonesia</span>
              </li>
              <li className="pt-2">
                <button
                  onClick={onOpenProspectModal}
                  className="text-xs font-semibold text-[#34D399] hover:underline cursor-pointer"
                >
                  Jadwalkan Konsultasi Teknis →
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} OrchestreeAI. Hak Cipta Dilindungi.</p>
          <p className="mt-2 sm:mt-0">Autonomous AI Workforce Operating System v2.2</p>
        </div>
      </div>
    </footer>
  );
};
