import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  KeyRound,
  FileCheck2,
  Users2,
  CheckCircle2,
  AlertTriangle,
  Server,
  Zap,
} from 'lucide-react';

export const SecurityTrustSection: React.FC = () => {
  const [activeControlLevel, setActiveControlLevel] = useState<number>(2);

  const controlLevels = [
    {
      level: 1,
      name: 'ASSISTED',
      badge: 'Rekomendasi Saja',
      color: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
      description: 'AI hanya bertindak sebagai asisten riset dan penyusun analitik. Seluruh penulisan pesan dan eksekusi dilakukan manual oleh staf manusia.',
    },
    {
      level: 2,
      name: 'SUPERVISED',
      badge: 'Human Approval Gate (Default)',
      color: 'border-[#08B85C]/40 text-[#08B85C] bg-[#08B85C]/10',
      description: 'AI menyusun hasil kerja nyata secara lengkap (misal: draf penawaran, video, invoice). Eksekusi publik wajib melalui persetujuan 1-klik manajer.',
    },
    {
      level: 3,
      name: 'AUTONOMOUS',
      badge: 'Otonom Berdasarkan SOP',
      color: 'border-purple-500/40 text-purple-300 bg-purple-500/10',
      description: 'AI mengeksekusi tugas rutin berulang secara otomatis tanpa intervensi manusia, selama berada dalam koridor parameter SOP yang telah disetujui.',
    },
    {
      level: 4,
      name: 'ESCALATED',
      badge: 'Intervensi Darurat Otomatis',
      color: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
      description: 'Jika terdeteksi anomali finansial atau komplain keras pelanggan di luar ambang batas, AI seketika menghentikan proses dan mengirimkan notifikasi eskalasi.',
    },
  ];

  const securityPillars = [
    { title: 'Multi-Tenant Isolation', desc: 'Partisi database terenkripsi unik per organisasi, tanpa risiko kebocoran data silang.', icon: Lock },
    { title: 'AES-256 GCM Encryption', desc: 'Enkripsi data saat istirahat dan TLS 1.3 saat transmisi dengan standar perbankan.', icon: KeyRound },
    { title: 'Policy Decision Point (PDP)', desc: 'Setiap request divalidasi terhadap hak akses RBAC sebelum data diekspos ke model AI.', icon: ShieldCheck },
    { title: 'Immutable Audit Trail', desc: 'Seluruh riwayat aksi, persetujuan, dan perubahan tercatat permanen untuk audit kepatuhan.', icon: FileCheck2 },
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-[#071226] via-[#0B1835] to-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>ENTERPRISE GOVERNANCE & CONTROL</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Keamanan Data Tertinggi & Kontrol Manusia Mutlak
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Kedaulatan data Anda terjamin. Anda memegang kendali penuh atas seberapa besar wewenang otonomi yang diberikan kepada staf AI di setiap divisi
          </p>
        </div>

        {/* 4 Security Pillars Grid */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {securityPillars.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div
                key={idx}
                className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 space-y-3 hover:border-[#08B85C]/40 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-[#08B85C]/15 text-[#08B85C] flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-white">{p.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>

        {/* 4 Human Control Levels Showcase */}
        <div className="mt-16 rounded-3xl bg-[#071226] border border-white/15 p-6 sm:p-10 shadow-2xl space-y-8">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-wider text-[#08B85C]">
              Human-in-the-Loop Architecture
            </span>
            <h3 className="text-2xl font-bold text-white mt-1">
              4 Tingkat Kendali Autonomi Staf AI (Human Control Levels)
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-2">
              Tentukan batasan kewenangan masing-masing agen sesuai kebijakan risiko perusahaan Anda.
            </p>
          </div>

          {/* Level Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {controlLevels.map((lvl) => {
              const isSelected = activeControlLevel === lvl.level;
              return (
                <div
                  key={lvl.level}
                  onClick={() => setActiveControlLevel(lvl.level)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-white/[0.08] border-[#08B85C] shadow-lg ring-1 ring-[#08B85C]'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-slate-400">Level 0{lvl.level}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${lvl.color}`}>
                        {lvl.name}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-white">{lvl.badge}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed pt-1">{lvl.description}</p>
                  </div>

                  <div className="pt-4 mt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>Status Guard</span>
                    <span className="text-[#08B85C]">Aktif</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
