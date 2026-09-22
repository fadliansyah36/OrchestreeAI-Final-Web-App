import React, { useState } from 'react';
import {
  MessageSquareQuote,
  ListTree,
  UserCheck,
  Cpu,
  CheckCircle2,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface OperatingStep {
  id: string;
  cycleNumber: string;
  name: string;
  title: string;
  subtitle: string;
  description: string;
  outputs: string[];
}

export const HowItWorksSteps: React.FC = () => {
  const steps: OperatingStep[] = [
    {
      id: 'step-intent',
      cycleNumber: '01',
      name: 'Intent',
      title: 'Pemahaman Intensi Bisnis',
      subtitle: 'Analisis Maksud & Konteks Alami',
      description: 'Sistem menangkap instruksi manajer atau pesan pelanggan multi-kanal. Model Router membedah tujuan bisnis utama dan konteks relevan dari Company Brain.',
      outputs: ['Identifikasi entitas bisnis', 'Klasifikasi urgensi & otorisasi', 'Pengambilan memori kontekstual'],
    },
    {
      id: 'step-plan',
      cycleNumber: '02',
      name: 'Plan',
      title: 'Dekomposisi Rencana Kerja',
      subtitle: 'Struktur Tindakan Sesuai SOP Organisasi',
      description: 'Mesin orkestrasi memecah sasaran menjadi urutan tugas operasional terdefinisi, menentukan batasan wewenang, dan mengidentifikasi kebutuhan persetujuan supervisor.',
      outputs: ['Grafik dependensi tugas', 'Penetapan gerbang persetujuan', 'Estimasi kuota kredit komputasi'],
    },
    {
      id: 'step-assign',
      cycleNumber: '03',
      name: 'Assign',
      title: 'Penugasan ke Jabatan AI & Staf',
      subtitle: 'Delegasi Terarah Berbasis Peran',
      description: 'Tugas didelegasikan secara otomatis ke 15 jabatan staf AI yang kompeten (misal: AI Sales, AI Copywriter, AI Financial Analyst) atau ditugaskan ke staf manusia.',
      outputs: ['Delegasi wewenang spesifik', 'Distribusi konteks kerja ke agent', 'Sinkronisasi linimasa pengerjaan'],
    },
    {
      id: 'step-execute',
      cycleNumber: '04',
      name: 'Execute',
      title: 'Eksekusi Alat, API, dan Integrasi',
      subtitle: 'Penyelesaian Tugas Berskala Nyata',
      description: 'Staf AI mengeksekusi integrasi tools: menghasilkan draf dokumen, memanggil webhook ERP, menyusun balasan WhatsApp, atau merender aset visual via model terpilih.',
      outputs: ['Panggilan tool dengan izin ketat', 'Generasi konten & draf faktur', 'Pemeriksaan kepatuhan otomatis'],
    },
    {
      id: 'step-deliver',
      cycleNumber: '05',
      name: 'Deliver',
      title: 'Penyampaian Hasil & Jejak Audit',
      subtitle: 'Pengiriman Terverifikasi & Pencatatan Abadi',
      description: 'Hasil kerja dikirimkan ke kanal tujuan setelah melalui gerbang validasi. Seluruh metadata eksekusi dan konsumsi kuota dicatat ke dalam audit trail kekal.',
      outputs: ['Penyampaian hasil ke pengguna/klien', 'Pencatatan append-only audit trail', 'Pemutakhiran memori Company Brain'],
    },
  ];

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const currentStep = steps[activeStepIndex];

  return (
    <section id="how-it-works" className="py-24 bg-gradient-to-b from-[#0B1220] via-[#0B1B2B] to-[#0B1220] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#1E6FE0]/30 text-xs font-semibold text-[#60A5FA] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SIKLUS KERJA OTONOM</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Bagaimana OrchestreeAI Bekerja?
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Lima siklus orkestrasi terstandarisasi yang memastikan setiap instruksi diselesaikan dengan akurasi, wewenang aman, dan hasil nyata.
          </p>
        </div>

        {/* Step Selector Buttons */}
        <div className="mt-12 flex flex-wrap justify-center gap-2 sm:gap-3">
          {steps.map((st, idx) => {
            const isSelected = activeStepIndex === idx;
            return (
              <button
                key={st.id}
                onClick={() => setActiveStepIndex(idx)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white shadow-lg shadow-[#1FA35A]/20 scale-105'
                    : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <span className="font-mono opacity-70">{st.cycleNumber}</span>
                <span>{st.name}</span>
              </button>
            );
          })}
        </div>

        {/* Active Step Showcase Card */}
        <div className="mt-10 max-w-4xl mx-auto p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-md shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#34D399]">
                Siklus {currentStep.cycleNumber} — {currentStep.name}
              </span>
              <h3 className="text-2xl font-extrabold text-white mt-1">{currentStep.title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{currentStep.subtitle}</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-medium">Langkah {activeStepIndex + 1} dari 5</span>
            </div>
          </div>

          <p className="mt-6 text-sm text-slate-200 leading-relaxed font-normal">
            {currentStep.description}
          </p>

          <div className="mt-8">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Luaran & Validasi Sistem</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {currentStep.outputs.map((out, oIdx) => (
                <div
                  key={oIdx}
                  className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-start space-x-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-200">{out}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center">
            <button
              onClick={() => setActiveStepIndex((prev) => (prev > 0 ? prev - 1 : 4))}
              className="text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ← Siklus Sebelumnya
            </button>
            <button
              onClick={() => setActiveStepIndex((prev) => (prev < 4 ? prev + 1 : 0))}
              className="text-xs font-semibold text-[#60A5FA] hover:text-white transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <span>Siklus Berikutnya</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
