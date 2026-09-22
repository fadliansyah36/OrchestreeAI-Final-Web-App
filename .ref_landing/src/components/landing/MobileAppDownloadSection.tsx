import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  ShieldCheck,
  Zap,
  Bell,
  CheckCircle2,
  Sparkles,
  Info,
  ExternalLink,
  ChevronRight,
  Layers,
  ArrowUpRight,
  Maximize2
} from 'lucide-react';
import { OrchestreeClientAppMockup } from './OrchestreeClientAppMockup';

export const MobileAppDownloadSection: React.FC = () => {
  const [selectedHighlight, setSelectedHighlight] = useState<number>(0);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState<boolean>(false);

  const appHighlights = [
    {
      title: 'Tenant Owner & Multi-Role Governance',
      desc: 'Akses pimpinan organisasi untuk mengawasi seluruh aktivitas staf manusia dan AI dengan autentikasi biometrik aman',
      tag: 'Role Security'
    },
    {
      title: 'Skor Produktivitas & Tracking Tugas Harian',
      desc: 'Pemantauan progres kerja harian secara visual dengan ring indikator target penyelesaian tugas realtime',
      tag: 'Productivity'
    },
    {
      title: 'Rekomendasi AI Terpersonalisasi (For You)',
      desc: 'Fitur 1-klik "Rencanakan Hari Ini" untuk susun prioritas task dan "Ringkas Notifikasi" untuk rekap alert penting tanpa overload',
      tag: 'Proactive AI'
    },
    {
      title: 'Tanya AI Apa Saja via Suara & Teks',
      desc: 'Kotak dialog cerdas dengan dukungan mikrofon suara untuk instruksi cepat ke asisten AI saat sedang mobile di lapangan',
      tag: 'Voice & Chat'
    },
    {
      title: 'Omnichannel Inbox & Multi-Task Sync',
      desc: 'Respon interaksi pelanggan dan delegasi 4+ tugas jatuh tempo dalam satu antarmuka genggaman yang responsif',
      tag: 'Unified Workflow'
    }
  ];

  return (
    <section
      id="mobile-app"
      className="py-24 bg-gradient-to-b from-[#071226] via-[#09152E] to-[#071226] text-white border-t border-white/10 relative overflow-hidden"
    >
      {/* Visual Ambient Glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[#08B85C]/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-[#16B7D9]/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Top Badge & Header */}
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4">
            <Smartphone className="w-3.5 h-3.5" />
            <span>NATIVE MOBILE WORKFORCE APPLICATION</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Pusat Kendali Workforce Penuh Ada di Genggaman Anda
          </h2>

          <p className="mt-4 text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed max-w-3xl mx-auto">
            Akses dashboard eksekutif, koordinasi 16 staf AI, pantau produktivitas harian, dan setujui keputusan operasional kapan saja langsung melalui aplikasi mobile OrchestreeAI
          </p>
        </div>

        {/* Professional Statement Banner */}
        <div className="mt-10 max-w-4xl mx-auto">
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-blue-950/60 via-[#0B1B3D]/80 to-cyan-950/60 border border-cyan-500/30 shadow-xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-start space-x-3.5 sm:space-x-4">
              <div className="p-2.5 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 shrink-0 mt-0.5">
                <Info className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Pemberitahuan Resmi Arsitektur Platform
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#08B85C]/20 border border-[#08B85C]/30 text-[11px] font-mono text-[#08B85C] font-semibold">
                    Core Native System
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                  "Kami beroperasi penuh pada sistem Aplikasi Mobile native untuk menghadirkan performa orkestrasi real-time, push-notification kritis bebas latensi, serta keamanan biometrik tingkat enterprise. Website ini didedikasikan secara profesional sebagai sarana edukasi resmi, dokumentasi sistem, dan pusat pengetahuan (knowledge base) produk Aplikasi OrchestreeAI sebelum diimplementasikan pada organisasi Anda."
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Showcase: Phone Mockup with Authentic Client App Mockup & Feature Highlights */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Phone Mockup Frame showcasing the Authentic Client App Mockup */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <div className="relative group">
              {/* Device Outer Glow */}
              <div className="absolute -inset-4 bg-gradient-to-tr from-[#08B85C]/25 via-[#16B7D9]/25 to-[#1976E8]/25 rounded-[50px] blur-2xl opacity-75 group-hover:opacity-100 transition-opacity" />

              {/* Smartphone Outer Chassis */}
              <div className="relative w-[300px] sm:w-[335px] rounded-[44px] bg-[#111827] p-3 border-[4px] border-slate-700/80 shadow-2xl shadow-black/80">
                {/* Speaker Ear-piece & Front Camera Notch */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-900 rounded-full flex items-center justify-center space-x-2 z-20 pointer-events-none">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
                  <div className="w-10 h-1 bg-slate-800 rounded-full" />
                </div>

                {/* Smartphone Display Bezel */}
                <div className="relative rounded-[36px] overflow-hidden bg-slate-950 border border-slate-800 h-[590px] sm:h-[630px] flex flex-col">
                  <OrchestreeClientAppMockup interactive={true} />

                  {/* Zoom Overlay Trigger */}
                  <button
                    onClick={() => setIsZoomModalOpen(true)}
                    className="absolute bottom-3 right-3 p-2 rounded-xl bg-slate-900/85 hover:bg-slate-900 text-white border border-white/20 backdrop-blur-md text-xs flex items-center space-x-1.5 opacity-90 hover:opacity-100 transition-all cursor-pointer shadow-lg z-30"
                    title="Perbesar Tampilan"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-[#16B7D9]" />
                    <span className="text-[11px] font-medium hidden sm:inline">Perbesar</span>
                  </button>
                </div>

                {/* Phone Bottom Home Bar */}
                <div className="mt-2 flex justify-center">
                  <div className="w-24 h-1 bg-slate-600 rounded-full" />
                </div>
              </div>

              {/* Floating Verified Badge Pill */}
              <div className="absolute -bottom-4 -left-4 sm:left-0 bg-slate-900/90 border border-[#08B85C]/50 rounded-2xl px-3.5 py-2 shadow-xl backdrop-blur-md flex items-center space-x-2 text-xs z-20">
                <CheckCircle2 className="w-4 h-4 text-[#08B85C]" />
                <span className="text-slate-200 font-semibold">Mockup Asli Aplikasi Client</span>
              </div>
            </div>

            <p className="mt-8 text-xs text-slate-400 text-center font-mono">
              Antarmuka Asli OrchestreeAI Mobile • Akun Farhan Fadliansyah (Tenant Owner)
            </p>
          </div>

          {/* Right Column: Features Breakdown & Official Download Buttons */}
          <div className="lg:col-span-6 space-y-6">
            <div>
              <div className="inline-flex items-center space-x-2 text-xs font-bold text-[#16B7D9] tracking-wider uppercase mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Pengalaman Pengguna Tanpa Batas</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                Dirancang Khusus untuk Mobilitas Eksekutif & Tim Operasional
              </h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Setiap komponen antarmuka dirancang seringkas mungkin agar pimpinan bisnis dapat memonitor ritme kerja staf manusia dan AI tanpa hambatan teknis
              </p>
            </div>

            {/* Interactive Feature Highlights List */}
            <div className="space-y-2.5">
              {appHighlights.map((item, idx) => {
                const isSelected = selectedHighlight === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedHighlight(idx)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start space-x-3 ${
                      isSelected
                        ? 'bg-white/10 border-[#08B85C] shadow-lg shadow-[#08B85C]/10'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono font-bold ${
                        isSelected
                          ? 'bg-[#08B85C] text-white'
                          : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white truncate">{item.title}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-cyan-300 shrink-0 ml-2">
                          {item.tag}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Official App Store & Play Store Download Badges */}
            <div className="pt-4 border-t border-white/10">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Unduh Aplikasi Resmi OrchestreeAI
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                {/* Google Play Store Button */}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    alert(
                      'Aplikasi OrchestreeAI versi Google Play Store sedang dalam tahap rilis terkelola. Hubungi tim kami untuk menerima undangan akses eksklusif.'
                    );
                  }}
                  className="px-5 py-3 rounded-2xl bg-black border border-white/20 hover:border-[#08B85C] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center space-x-3 cursor-pointer group shadow-lg shadow-black/60"
                  aria-label="Download OrchestreeAI di Google Play Store"
                >
                  {/* Google Play Icon SVG */}
                  <svg className="w-7 h-7 shrink-0" viewBox="0 0 512 512">
                    <path
                      fill="#00E5FF"
                      d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"
                    />
                    <path
                      fill="#FF3A44"
                      d="M47 38.6c-4.4 7.6-6.9 16.5-6.9 26.5v381.8c0 10 2.5 18.9 6.9 26.5l218.4-217.4L47 38.6z"
                    />
                    <path
                      fill="#FFD200"
                      d="M385.4 337.8L104.6 499l220.7-221.3 60.1 60.1z"
                    />
                    <path
                      fill="#00F076"
                      d="M465.3 227.4l-79.9-46.1-60.1 60.1 60.1 60.1 79.9-46.1c15.2-8.8 23.7-22.3 23.7-39s-8.5-30.2-23.7-39z"
                    />
                  </svg>
                  <div className="text-left">
                    <div className="text-[10px] text-slate-400 font-medium tracking-wider uppercase leading-none">
                      TEMUKAN DI
                    </div>
                    <div className="text-base font-extrabold text-white tracking-wide leading-tight group-hover:text-[#08B85C] transition-colors">
                      Google Play
                    </div>
                  </div>
                </a>

                {/* Apple App Store Button */}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    alert(
                      'Aplikasi OrchestreeAI versi iOS App Store sedang dalam program TestFlight enterprise. Hubungi tim kami untuk pendaftaran akses tim.'
                    );
                  }}
                  className="px-5 py-3 rounded-2xl bg-black border border-white/20 hover:border-[#16B7D9] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center space-x-3 cursor-pointer group shadow-lg shadow-black/60"
                  aria-label="Download OrchestreeAI di Apple App Store"
                >
                  {/* Apple Logo SVG */}
                  <svg className="w-7 h-7 shrink-0 fill-current text-white group-hover:text-[#16B7D9] transition-colors" viewBox="0 0 170 170">
                    <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.31-7.17-10.9-12.83-23.75-16.97-38.56-4.14-14.81-6.21-28.79-6.21-41.95 0-16.14 3.96-29.47 11.88-40 7.92-10.53 18.06-15.89 30.43-16.08 4.58 0 10.02 1.25 16.32 3.75 6.3 2.5 10.49 3.75 12.57 3.75 1.62 0 5.86-1.25 12.74-3.75 6.87-2.5 12.43-3.62 16.68-3.37 12.43.76 22.56 5.51 30.43 14.25-10.88 6.64-16.2 15.77-15.96 27.39.24 9.14 3.75 16.98 10.53 23.51 6.78 6.53 14.75 10.44 23.9 11.75-2.23 6.96-4.94 14.07-8.12 21.32zm-28.53-111.47c0 7.62-2.82 14.75-8.46 21.38-6.19 7.29-13.79 11.59-22.79 12.89-.25-1.52-.38-2.93-.38-4.24 0-7.38 3.03-14.93 9.1-22.65 6.07-7.72 13.56-12.18 22.47-13.38.06 2.01.06 4.01.06 6z" />
                  </svg>
                  <div className="text-left">
                    <div className="text-[10px] text-slate-400 font-medium tracking-wider uppercase leading-none">
                      UNDUH DI
                    </div>
                    <div className="text-base font-extrabold text-white tracking-wide leading-tight group-hover:text-[#16B7D9] transition-colors">
                      App Store
                    </div>
                  </div>
                </a>
              </div>

              {/* Version & Compatibility Indicator */}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#08B85C]" />
                  <span>Kompatibel Android 10+ & iOS 15+</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <Zap className="w-4 h-4 text-[#16B7D9]" />
                  <span>Auto Cloud Sync 2-Way</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Screenshot Zoom Modal Dialog */}
      {isZoomModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          onClick={() => setIsZoomModalOpen(false)}
        >
          <div
            className="relative max-w-lg w-full bg-slate-900 border border-white/20 rounded-3xl p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-[#08B85C]" />
                <span className="text-sm font-bold text-white">Antarmuka Asli Aplikasi Client OrchestreeAI</span>
              </div>
              <button
                onClick={() => setIsZoomModalOpen(false)}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
              >
                Tutup [ESC]
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto rounded-2xl bg-black flex justify-center p-1">
              <div className="w-full max-w-sm rounded-2xl overflow-hidden border border-slate-700 shadow-2xl">
                <OrchestreeClientAppMockup interactive={true} />
              </div>
            </div>

            <div className="text-[11px] text-slate-400 text-center">
              Dashboard Mobile OrchestreeAI • Akun Farhan Fadliansyah (Tenant Owner)
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
