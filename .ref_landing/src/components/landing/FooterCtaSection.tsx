import React from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  Lock,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface FooterCtaProps {
  onExecuteGoalFromLanding?: (goal: string) => void;
  onOpenProspectForm?: () => void;
}

export const FooterCtaSection: React.FC<FooterCtaProps> = ({ onOpenProspectForm }) => {
  const handleStart = () => {
    if (onOpenProspectForm) {
      onOpenProspectForm();
    } else {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-gradient-to-b from-[#071226] via-[#040C1A] to-[#02060D] text-white border-t border-white/10 relative overflow-hidden">
      {/* Decorative ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-gradient-to-r from-[#08B85C]/15 via-[#16B7D9]/20 to-[#1976E8]/15 blur-3xl pointer-events-none" />

      {/* Main Bottom Hero CTA Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 relative">
        <div className="rounded-3xl bg-gradient-to-r from-[#0B1835] via-[#071226] to-[#0B1835] border border-[#08B85C]/40 p-8 sm:p-14 text-center max-w-5xl mx-auto shadow-2xl relative overflow-hidden">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SIAP MENJALANKAN BISNIS DENGAN WORKFORCE MASA DEPAN?</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Mulai Orkestrasikan Workforce Anda Hari Ini
          </h2>

          <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            Hentikan pemborosan waktu staf pada tugas rutin. Sambungkan WhatsApp, Google Workspace, dan SOP perusahaan Anda dalam hitungan menit
          </p>

          {/* High-Converting Direct Action CTA */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleStart}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white font-bold text-base shadow-xl shadow-[#08B85C]/25 hover:shadow-[#08B85C]/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer group"
            >
              <Sparkles className="w-5 h-5 text-white" />
              <span>Daftar Seleksi Trial 7 Hari (36 Slot)</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => {
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-semibold text-base backdrop-blur-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Pelajari Skema Paket</span>
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-medium">
            <span className="flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-[#08B85C]" />
              <span>Sovereign Cloud Data Privacy (UU PDP 2024)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <Lock className="w-4 h-4 text-[#1976E8]" />
              <span>Multi-Tenant Enkripsi AES-256</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#08B85C]" />
              <span>Gratis Setup Onboarding 1-on-1</span>
            </span>
          </div>
        </div>

        {/* Footer Navigation Columns */}
        <div className="mt-20 pt-12 border-t border-white/10 grid grid-cols-2 md:grid-cols-5 gap-8 text-xs">
          {/* Col 1: Brand Info */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center space-x-3">
              <img
                src="/logoorchestreeweb.png"
                alt="OrchestreeAI Logo"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-lg shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="font-extrabold text-base tracking-tight text-white">
                  Orchestree<span className="text-[#08B85C]">.AI</span>
                </span>
                <span className="text-[10px] text-slate-400 -mt-1 font-mono tracking-wider">
                  AI WORKFORCE OPERATING SYSTEM
                </span>
              </div>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              Sistem Operasi Manajemen Tenaga Kerja Cerdas pertama di Indonesia yang mengorkestrasikan staf manusia, staf AI, dan ekosistem alat bisnis dalam satu kesatuan operasional.
            </p>

            {/* Professional Operational Statement */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-slate-300 space-y-1">
              <span className="text-[#08B85C] font-semibold block uppercase tracking-wider text-[10px]">
                Operasional Sistem
              </span>
              <p className="text-slate-400 leading-relaxed">
                Kami beroperasi penuh pada sistem Aplikasi Mobile. Website ini berfungsi sebagai sarana edukasi resmi, dokumentasi, dan pusat pengetahuan produk Aplikasi OrchestreeAI.
              </p>
            </div>

            {/* Quick App Store Badges */}
            <div className="pt-1 flex flex-wrap items-center gap-2">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Aplikasi OrchestreeAI versi Google Play Store segera dirilis. Hubungi kami untuk program beta.');
                }}
                className="px-3 py-2 rounded-xl bg-black border border-white/15 hover:border-[#08B85C] transition-all flex items-center space-x-2 text-[11px] group cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 512 512">
                  <path fill="#00E5FF" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z" />
                  <path fill="#FF3A44" d="M47 38.6c-4.4 7.6-6.9 16.5-6.9 26.5v381.8c0 10 2.5 18.9 6.9 26.5l218.4-217.4L47 38.6z" />
                  <path fill="#FFD200" d="M385.4 337.8L104.6 499l220.7-221.3 60.1 60.1z" />
                  <path fill="#00F076" d="M465.3 227.4l-79.9-46.1-60.1 60.1 60.1 60.1 79.9-46.1c15.2-8.8 23.7-22.3 23.7-39s-8.5-30.2-23.7-39z" />
                </svg>
                <span className="font-semibold text-white group-hover:text-[#08B85C]">Google Play</span>
              </a>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Aplikasi OrchestreeAI versi App Store segera dirilis. Hubungi kami untuk akses TestFlight.');
                }}
                className="px-3 py-2 rounded-xl bg-black border border-white/15 hover:border-[#16B7D9] transition-all flex items-center space-x-2 text-[11px] group cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0 fill-current text-white group-hover:text-[#16B7D9]" viewBox="0 0 170 170">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.31-7.17-10.9-12.83-23.75-16.97-38.56-4.14-14.81-6.21-28.79-6.21-41.95 0-16.14 3.96-29.47 11.88-40 7.92-10.53 18.06-15.89 30.43-16.08 4.58 0 10.02 1.25 16.32 3.75 6.3 2.5 10.49 3.75 12.57 3.75 1.62 0 5.86-1.25 12.74-3.75 6.87-2.5 12.43-3.62 16.68-3.37 12.43.76 22.56 5.51 30.43 14.25-10.88 6.64-16.2 15.77-15.96 27.39.24 9.14 3.75 16.98 10.53 23.51 6.78 6.53 14.75 10.44 23.9 11.75-2.23 6.96-4.94 14.07-8.12 21.32zm-28.53-111.47c0 7.62-2.82 14.75-8.46 21.38-6.19 7.29-13.79 11.59-22.79 12.89-.25-1.52-.38-2.93-.38-4.24 0-7.38 3.03-14.93 9.1-22.65 6.07-7.72 13.56-12.18 22.47-13.38.06 2.01.06 4.01.06 6z" />
                </svg>
                <span className="font-semibold text-white group-hover:text-[#16B7D9]">App Store</span>
              </a>
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              PT Orchestree Teknologi Nusantara &copy; {new Date().getFullYear()}. Seluruh hak cipta dilindungi.
            </div>
          </div>

          {/* Col 2: Platform */}
          <div className="space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Platform</h4>
            <ul className="space-y-2 text-slate-400">
              <li><a href="#workforce-universe" className="hover:text-[#08B85C] transition-colors">Workforce Universe</a></li>
              <li><a href="#ai-employees" className="hover:text-[#08B85C] transition-colors">16 AI Employees</a></li>
              <li><a href="#collaboration" className="hover:text-[#08B85C] transition-colors">WhatsApp & Chat Sync</a></li>
              <li><a href="#performance" className="hover:text-[#08B85C] transition-colors">Performance Scoring</a></li>
              <li><a href="#social-creative" className="hover:text-[#08B85C] transition-colors">Social & Video Studio</a></li>
            </ul>
          </div>

          {/* Col 3: Integrasi */}
          <div className="space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Integrasi</h4>
            <ul className="space-y-2 text-slate-400">
              <li><a href="#collaboration" className="hover:text-[#08B85C] transition-colors">WhatsApp Gateway</a></li>
              <li><a href="#collaboration" className="hover:text-[#08B85C] transition-colors">Telegram Enterprise</a></li>
              <li><a href="#collaboration" className="hover:text-[#08B85C] transition-colors">Slack & Trello Workspace</a></li>
              <li><a href="#collaboration" className="hover:text-[#08B85C] transition-colors">Google Workspace</a></li>
              <li><a href="#collaboration" className="hover:text-[#08B85C] transition-colors">Accurate & Jurnal ERP</a></li>
            </ul>
          </div>

          {/* Col 4: Keamanan & Legal */}
          <div className="space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Keamanan & Legal</h4>
            <ul className="space-y-2 text-slate-400">
              <li><span className="text-[#08B85C] font-semibold">Kepatuhan UU PDP RI</span></li>
              <li><span className="text-slate-300">Isolasi Multi-Tenant</span></li>
              <li><span className="text-slate-300">Kebijakan Privasi</span></li>
              <li><span className="text-slate-300">Syarat & Ketentuan</span></li>
              <li><span className="text-slate-300">Service Level Agreement</span></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
