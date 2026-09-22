import React, { useState } from 'react';
import {
  Brain,
  Layers,
  Lock,
  ShieldCheck,
  FileText,
  Database,
  Workflow,
  Sparkles,
  Users2,
  CheckCircle2,
  FolderLock,
  Cpu,
  KeyRound,
} from 'lucide-react';

export const CompanyBrainWorkspaceSection: React.FC = () => {
  const [activeMemoryTab, setActiveMemoryTab] = useState<'profile' | 'sop' | 'brand' | 'tools' | 'memory'>('profile');

  const brainLayers = [
    {
      id: 'profile',
      title: 'Profil & Tujuan Bisnis',
      desc: 'Visi, model bisnis, industri vertikal, target pendapatan Q3/Q4, dan struktur kepemimpinan organisasi.',
      icon: Users2,
      count: '100% Terenkripsi',
    },
    {
      id: 'sop',
      title: 'Dokumen SOP & Regulasi',
      desc: 'Kebijakan operasional standar, prosedur pengadaan barang, aturan diskon sales, dan alur eskalasi darurat.',
      icon: FileText,
      count: '48 Dokumen Terindeks',
    },
    {
      id: 'brand',
      title: 'Brand Kit & Visual Tokens',
      desc: 'Palet warna heksadesimal resmi (#08B85C, #1976E8), tone-of-voice copywriting, dan daftar klaim terlarang.',
      icon: Sparkles,
      count: 'Active Guardrails',
    },
    {
      id: 'tools',
      title: 'Connected Workspace & APIs',
      desc: 'Kredensial aman WhatsApp Gateway, Telegram, Slack, Trello, Google Drive, Accurate, dan Instagram API.',
      icon: Workflow,
      count: '12 Layanan Terhubung',
    },
    {
      id: 'memory',
      title: 'Closed-Loop Episodic Memory',
      desc: 'Vault memori historis yang menyimpan seluruh revisi pimpinan untuk menyempurnakan kualitas penalaran AI secara berkesinambungan.',
      icon: Database,
      count: '99.9% Recall Precision',
    },
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-[#071226] via-[#0B1835] to-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4">
            <Brain className="w-3.5 h-3.5" />
            <span>CENTRAL INTELLIGENCE & DATA FABRIC</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Company Brain: Memori & Konteks Tunggal untuk Seluruh Workforce
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            AI generik gagal karena tidak memahami data rahasia perusahaan Anda. Company Brain memberikan pemahaman menyeluruh tentang SOP, produk, kebijakan harga, dan aturan brand tanpa risiko kebocoran data
          </p>
        </div>

        {/* 2-Column Brain Architecture & Workspace Cards */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Col: 5 Layers of Company Brain */}
          <div className="lg:col-span-7 space-y-3">
            {brainLayers.map((layer) => {
              const Icon = layer.icon;
              const isSelected = activeMemoryTab === layer.id;
              return (
                <div
                  key={layer.id}
                  onClick={() => setActiveMemoryTab(layer.id as any)}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${
                    isSelected
                      ? 'bg-white/[0.08] border-[#08B85C] shadow-lg shadow-[#08B85C]/15 ring-1 ring-[#08B85C]'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start space-x-3.5">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#08B85C] shrink-0 mt-0.5">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-bold text-sm text-white">{layer.title}</h4>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{layer.desc}</p>
                    </div>
                  </div>

                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-slate-400 font-mono shrink-0 whitespace-nowrap">
                    {layer.count}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right Col: Sovereign Security & Tenant Isolation Card */}
          <div className="lg:col-span-5">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#071226] border border-white/15 shadow-2xl space-y-5">
              <div className="flex items-center space-x-3 pb-4 border-b border-white/10">
                <div className="w-10 h-10 rounded-xl bg-[#08B85C]/20 text-[#08B85C] flex items-center justify-center">
                  <FolderLock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Sovereign Tenant Isolation</h3>
                  <p className="text-xs text-slate-400">Proteksi Data & Kebijakan Akses Berbasis Peran</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Isolasi Multi-Tenant Mutlak</span>
                  <p className="text-slate-200">
                    Setiap organisasi memiliki partisi database Firestore & PostgreSQL terenkripsi terpisah. Data Anda tidak pernah dicampur atau digunakan untuk melatih model publik.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Policy Decision Point (PDP)</span>
                  <p className="text-slate-200">
                    Setiap akses baca dan tulis diperiksa secara matematis terhadap peran RBAC pengguna sebelum dieksekusi.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Audit Trail & Compliance</span>
                  <p className="text-slate-200">
                    Catatan audit log waktu-nyata mencatat siapa yang mengakses, menyetujui, atau mengeksekusi setiap tugas.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-[#08B85C]">
                <span className="flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Enkripsi AES-256 GCM</span>
                </span>
                <span>ISO 27001 Ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
