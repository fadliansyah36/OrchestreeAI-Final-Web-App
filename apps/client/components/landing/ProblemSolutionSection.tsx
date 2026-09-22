import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
  TrendingUp,
  Layers,
  ChevronDown
} from 'lucide-react';

interface TransformationItem {
  id: string;
  orderNumber: string;
  obstacleTitle: string;
  obstacleDesc: string;
  solutionTitle: string;
  solutionDesc: string;
  outcome: string;
}

export const ProblemSolutionSection: React.FC = () => {
  const transformations: TransformationItem[] = [
    {
      id: 'trans-1',
      orderNumber: '01',
      obstacleTitle: 'Sistem Terfragmentasi & Silo Informasi',
      obstacleDesc: 'Staf menghabiskan waktu berjam-jam menyalin data antar spreadsheet, chat WhatsApp, dan aplikasi terpisah.',
      solutionTitle: 'Orkestrasi Terpusat Berbasis Intensi',
      solutionDesc: 'Seluruh alur kerja dikoordinasikan secara otomatis oleh mesin orkestrasi dengan integrasi langsung ke basis data.',
      outcome: 'Waktu eksekusi proses lintas fungsi berkurang signifikan.',
    },
    {
      id: 'trans-2',
      orderNumber: '02',
      obstacleTitle: 'Respon Pelanggan Lambat di Jam Sibuk',
      obstacleDesc: 'Chat prospek di WhatsApp tidak tertangani cepat saat tim sedang offline atau kuota pesan melonjak.',
      solutionTitle: 'Staf AI Komersial Responsif',
      solutionDesc: 'Kualifikasi prospek dalam hitungan detik dengan pemahaman katalog dan SOP resmi perusahaan.',
      outcome: 'Tingkat konversi meningkat dan respons selalu instan 24/7.',
    },
    {
      id: 'trans-3',
      orderNumber: '03',
      obstacleTitle: 'Risiko Kebocoran Data Multi-Organisasi',
      obstacleDesc: 'Kekhawatiran data sensitif perusahaan bercampur dengan entitas lain saat menggunakan model AI publik.',
      solutionTitle: 'Isolasi Mutlak PostgreSQL RLS',
      solutionDesc: 'Setiap entitas data dipartisi dengan Row-Level Security dan role database non-super yang ketat.',
      outcome: 'Jaminan kepatuhan keamanan data korporat terverifikasi.',
    },
    {
      id: 'trans-4',
      orderNumber: '04',
      obstacleTitle: 'Biaya Model AI yang Tidak Terprediksi',
      obstacleDesc: 'Penggunaan token tanpa batas menghasilkan lonjakan tagihan tak terduga di akhir periode.',
      solutionTitle: 'Multi-LLM Smart Router & Ledgering',
      solutionDesc: 'Pemilihan rute model cerdas (NVIDIA NIM, Gemini, OpenRouter) dengan pengukuran kredit transparan per aksi.',
      outcome: 'Efisiensi pengeluaran komputasi tetap terjaga dalam batas kuota.',
    },
  ];

  const [activeId, setActiveId] = useState<string>(transformations[0].id);

  return (
    <section className="py-24 bg-[#0B1B2B] text-white border-t border-white/10 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-amber-500/30 text-xs font-semibold text-amber-400 mb-4">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>TRANSFORMASI EFISIENSI OPERASIONAL</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Mengapa Cara Operasional Tradisional Perlu Ditransformasi?
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Dari inefisiensi manual hingga fragmentasi data. Lihat bagaimana OrchestreeAI mengubah hambatan kerja menjadi akselerasi sistematis.
          </p>
        </div>

        <div className="mt-16 space-y-4">
          {transformations.map((item) => {
            const isExpanded = activeId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setActiveId(isExpanded ? '' : item.id)}
                className={`p-6 rounded-3xl border transition-all cursor-pointer ${
                  isExpanded
                    ? 'bg-gradient-to-r from-white/[0.06] via-[#0B1220] to-white/[0.04] border-[#1FA35A]/50 shadow-xl'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <span className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono font-bold text-sm flex items-center justify-center shrink-0">
                      {item.orderNumber}
                    </span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          Tantangan
                        </span>
                        <h4 className="font-bold text-base text-white">{item.obstacleTitle}</h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{item.obstacleDesc}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0 self-end md:self-center">
                    <span className="text-xs font-semibold text-[#34D399] flex items-center space-x-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Solusi OrchestreeAI</span>
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180 text-white' : ''}`}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-[#1FA35A]/20">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-[#34D399] mb-1">Pendekatan Sistem</h5>
                      <p className="text-sm font-semibold text-white">{item.solutionTitle}</p>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{item.solutionDesc}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-[#1E6FE0]/20 flex items-center space-x-3">
                      <CheckCircle2 className="w-6 h-6 text-[#60A5FA] shrink-0" />
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-wider text-[#60A5FA] mb-1">Hasil Terukur</h5>
                        <p className="text-xs text-slate-200 leading-relaxed">{item.outcome}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
