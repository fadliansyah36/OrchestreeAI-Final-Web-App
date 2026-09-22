import React from 'react';
import {
  Users2,
  ShieldCheck,
  Cpu,
  Brain,
  MessageSquare,
  Workflow,
  Coins,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const ProductPillarsSection: React.FC = () => {
  const pillars = [
    {
      id: 'pillar-1',
      title: '15 Jabatan AI Terstandarisasi',
      subtitle: 'Tenaga Kerja Kognitif Siap Pakai',
      description: 'Dari Chief Strategy & Finance, Operasional, Sales, Technical, hingga Creative dengan deskripsi tugas, wewenang, dan KPI terstruktur.',
      icon: Users2,
      accent: 'from-[#1FA35A]/20 to-[#1FA35A]/5 text-[#34D399] border-[#1FA35A]/30',
      badge: 'Workforce',
    },
    {
      id: 'pillar-2',
      title: 'Unified Policy Decision Point (PDP)',
      subtitle: 'Isolasi Mutlak Berbasis Data',
      description: 'Pengecekan otorisasi terpadu pada setiap pemanggilan layanan. PostgreSQL Row-Level Security dipaksakan pada level tabel per organisasi.',
      icon: ShieldCheck,
      accent: 'from-[#1E6FE0]/20 to-[#1E6FE0]/5 text-[#60A5FA] border-[#1E6FE0]/30',
      badge: 'Security',
    },
    {
      id: 'pillar-3',
      title: 'Multi-LLM Smart Router',
      subtitle: 'Efisiensi Biaya & Kinerja Model',
      description: 'Routing cerdas otomatis: NVIDIA NIM sebagai prioritas utama, OpenRouter sebagai cadangan, Gemini untuk multimodal, dan GPT-Image-2 untuk visual.',
      icon: Cpu,
      accent: 'from-[#6C4CD9]/20 to-[#6C4CD9]/5 text-[#A78BFA] border-[#6C4CD9]/30',
      badge: 'Model Engine',
    },
    {
      id: 'pillar-4',
      title: 'Sovereign Company Brain',
      subtitle: 'Memori Kontekstual Berdaulat',
      description: 'Pengetahuan internal organisasi tersimpan aman dalam pgvector. Staf AI memahami SOP, katalog produk, dan histori interaksi spesifik perusahaan.',
      icon: Brain,
      accent: 'from-[#1FA35A]/20 to-[#1FA35A]/5 text-[#34D399] border-[#1FA35A]/30',
      badge: 'Knowledge',
    },
    {
      id: 'pillar-5',
      title: 'Integrasi Omnichannel Bisnis',
      subtitle: 'WhatsApp, Telegram & Webhooks',
      description: 'Terhubung langsung ke kanal pelanggan resmi Meta WhatsApp Cloud API, bot Telegram, serta webhook sistem ERP dan CRM perusahaan.',
      icon: MessageSquare,
      accent: 'from-[#1E6FE0]/20 to-[#1E6FE0]/5 text-[#60A5FA] border-[#1E6FE0]/30',
      badge: 'Channels',
    },
    {
      id: 'pillar-6',
      title: 'Orkestrasi Otonom & Kolaboratif',
      subtitle: 'Human-in-the-Loop Saat Krusial',
      description: 'Siklus otomatis dari pemahaman intensi, dekomposisi rencana, pembagian tugas, hingga gerbang persetujuan supervisor untuk tindakan sensitif.',
      icon: Workflow,
      accent: 'from-[#6C4CD9]/20 to-[#6C4CD9]/5 text-[#A78BFA] border-[#6C4CD9]/30',
      badge: 'Execution',
    },
    {
      id: 'pillar-7',
      title: 'Pengukuran Kredit Transparan',
      subtitle: 'Ledger Keuangan Terperinci',
      description: 'Atribusi biaya komputasi presisi per tindakan tugas. Terintegrasi gateway pembayaran nasional dengan kuota kredit yang dapat diaudit.',
      icon: Coins,
      accent: 'from-[#1FA35A]/20 to-[#1FA35A]/5 text-[#34D399] border-[#1FA35A]/30',
      badge: 'Ledgering',
    },
  ];

  return (
    <section id="pilar-produk" className="py-24 bg-[#0B1220] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#34D399]/30 text-xs font-semibold text-[#34D399] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>FONDASI SISTEM TERPADU</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Tujuh Pilar Utama OrchestreeAI
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Arsitektur komprehensif yang dirancang untuk keandalan korporat, keamanan data mutlak, dan otomasi otonom terukur.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            const isFullWidthOnLarge = idx === 6;
            return (
              <div
                key={pillar.id}
                className={`p-7 rounded-3xl bg-gradient-to-br bg-white/[0.02] border transition-all hover:bg-white/[0.05] hover:scale-[1.01] ${pillar.accent} ${
                  isFullWidthOnLarge ? 'md:col-span-2 lg:col-span-3' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/10 border border-white/15 font-semibold text-slate-200">
                    {pillar.badge}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">{pillar.title}</h3>
                <p className="text-xs font-medium text-slate-400 mt-1">{pillar.subtitle}</p>
                <p className="text-sm text-slate-300 mt-3 leading-relaxed">{pillar.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
