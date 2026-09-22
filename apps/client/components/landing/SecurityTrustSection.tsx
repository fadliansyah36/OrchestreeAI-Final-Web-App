import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  FileCheck2,
  Server,
  UserCheck,
  EyeOff,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

interface SecurityControlLevel {
  levelNumber: number;
  name: string;
  badge: string;
  colorClass: string;
  description: string;
}

export const SecurityTrustSection: React.FC = () => {
  const [activeLevel, setActiveLevel] = useState<number>(2);

  const controlLevels: SecurityControlLevel[] = [
    {
      levelNumber: 1,
      name: 'Rekomendasi & Analisis',
      badge: 'Mode Asistif',
      colorClass: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
      description: 'Staf AI bertindak sebagai periset data dan penyiap draf analitik. Pengiriman pesan eksternal dan eksekusi dilakukan manual oleh staf manusia.',
    },
    {
      levelNumber: 2,
      name: 'Gerbang Persetujuan Manusia',
      badge: 'Supervisi Baku (Default)',
      colorClass: 'border-[#1FA35A]/40 text-[#34D399] bg-[#1FA35A]/10',
      description: 'Staf AI menyusun hasil kerja nyata secara komprehensif (draf penawaran, invoice, aset visual). Eksekusi publik mewajibkan satu klik persetujuan manajer.',
    },
    {
      levelNumber: 3,
      name: 'Otonom Berdasarkan SOP',
      badge: 'Otonom Terkendali',
      colorClass: 'border-[#6C4CD9]/40 text-[#A78BFA] bg-[#6C4CD9]/10',
      description: 'Staf AI mengeksekusi tugas operasional berulang secara mandiri tanpa intervensi, selama berada di dalam parameter batas aman dan kuota yang telah disetujui.',
    },
    {
      levelNumber: 4,
      name: 'Intervensi & Eskalasi Darurat',
      badge: 'Proteksi Anomali',
      colorClass: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
      description: 'Jika terdeteksi potensi anomali finansial atau parameter batas terlampaui, sistem seketika menghentikan alur dan mengirimkan notifikasi eskalasi.',
    },
  ];

  const securityPillars = [
    {
      title: 'Isolasi Multi-Tenant RLS',
      desc: 'PostgreSQL Row-Level Security aktif dan dipaksakan secara mutlak. Data antar organisasi tidak dapat diakses silang.',
      icon: Lock,
    },
    {
      title: 'Runtime Role Terisolasi',
      desc: 'Layanan backend berjalan di bawah role orchestree_app dengan atribut NOBYPASSRLS dan tanpa hak superuser.',
      icon: Server,
    },
    {
      title: 'Enkripsi Kredensial Envelope',
      desc: 'Token pihak ketiga (WhatsApp, payment gateway) dienkripsi dengan kunci KMS dan dekripsi hanya saat waktu eksekusi.',
      icon: KeyRound,
    },
    {
      title: 'Jejak Audit Kriptografis',
      desc: 'Setiap tindakan staf AI, persetujuan manajer, dan mutasi kuota dicatat ke dalam log append-only yang permanen.',
      icon: FileCheck2,
    },
  ];

  return (
    <section id="keamanan" className="py-24 bg-[#0B1B2B] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#34D399]/30 text-xs font-semibold text-[#34D399] mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>KEAMANAN & KEPATUHAN KORPORAT</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Perlindungan Data & Kendali Wewenang Tingkat Tinggi
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Didesain sejak baris pertama untuk mematuhi standar privasi data bisnis, isolasi relasional, dan akuntabilitas tindakan.
          </p>
        </div>

        {/* 4 Security Pillars Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {securityPillars.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-3xl bg-white/[0.02] border border-white/10 hover:border-[#1FA35A]/40 transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#34D399] mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{p.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed font-normal">{p.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Dynamic Control Levels Showcase */}
        <div className="mt-14 max-w-4xl mx-auto p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-[#0B1220] via-white/[0.02] to-[#0B1220] border border-white/15 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#60A5FA]">
                Tingkat Otonomi & Wewenang
              </span>
              <h3 className="text-xl font-extrabold text-white mt-0.5">Empat Level Kendali Operasional</h3>
            </div>
            <span className="text-xs text-slate-400">Pilih level kendali untuk melihat mekanismenya</span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {controlLevels.map((lvl) => {
              const isSelected = activeLevel === lvl.levelNumber;
              return (
                <button
                  key={lvl.levelNumber}
                  onClick={() => setActiveLevel(lvl.levelNumber)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white shadow-md shadow-[#1FA35A]/20 scale-105'
                      : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span>Level {lvl.levelNumber}: {lvl.name}</span>
                </button>
              );
            })}
          </div>

          {(() => {
            const currentLvl = controlLevels.find((l) => l.levelNumber === activeLevel) || controlLevels[1];
            return (
              <div className="mt-6 p-6 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="flex items-center space-x-3 mb-3">
                  <span className={`text-[11px] font-mono font-bold px-3 py-1 rounded-full border ${currentLvl.colorClass}`}>
                    {currentLvl.badge}
                  </span>
                  <h4 className="text-base font-bold text-white">Level {currentLvl.levelNumber} — {currentLvl.name}</h4>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                  {currentLvl.description}
                </p>
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
};
