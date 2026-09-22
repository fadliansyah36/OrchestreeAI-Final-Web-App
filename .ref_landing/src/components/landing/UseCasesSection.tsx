import React, { useState } from 'react';
import {
  Briefcase,
  TrendingUp,
  Share2,
  Users2,
  DollarSign,
  Truck,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

export const UseCasesSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('sales');

  const useCases = [
    {
      id: 'sales',
      title: 'Penjualan & CRM B2B / B2C',
      icon: Briefcase,
      headline: 'Tingkatkan Konversi Lead Masuk 3x Lipat Tanpa Menambah Beban Sales',
      challenge: 'Staf sales rep kewalahan menjawab kualifikasi puluhan chat WhatsApp setiap hari sehingga respon lambat dan prospek beralih ke kompetitor.',
      solution: 'AI Sales mengkualifikasi pesan prospek dalam 3 detik, mengekstrak kebutuhan bisnis dari Company Brain, dan menyusun draft penawaran harga PDF untuk disetujui sales executive.',
      outcomes: [
        'Waktu respon rata-rata turun dari 45 menit menjadi 4.2 detik',
        'Peningkatan rasio konversi deal penawaran sebesar +34%',
        '100% data riwayat chat tersinkronisasi otomatis ke CRM',
      ],
    },
    {
      id: 'marketing',
      title: 'Pemasaran & Konten Omnichannel',
      icon: Share2,
      headline: 'Publikasikan Konten Video & Copy Berkualitas Tinggi Setiap Hari',
      challenge: 'Menyewa agensi konten mahal dan sering terlambat menerbitkan postingan karena proses revisi naskah dan render video yang panjang.',
      solution: 'Creative AI Workforce mengombinasikan Copywriter dan Video Director (Google Veo 2) untuk memproduksi reels 9:16 dan carousel dengan audit brand kit otomatis.',
      outcomes: [
        'Produksi 30 varian konten media sosial per minggu secara otomatis',
        'Hemat hingga 70% biaya agensi kreatif eksternal',
        'Peningkatan engagement rate Instagram & TikTok hingga +85%',
      ],
    },
    {
      id: 'finance',
      title: 'Keuangan, Pajak & Arus Kas',
      icon: DollarSign,
      headline: 'Rekonsiliasi Bank Otomatis & Prediksi Arus Kas 6 Bulan Real-Time',
      challenge: 'Akuntan lembur berhari-hari di akhir bulan hanya untuk mencocokkan mutasi rekening bank dengan tumpukan faktur tagihan vendor.',
      solution: 'AI CFO membaca mutasi rekening BCA / Mandiri via API, mencocokkan nomor faktur di Accurate, dan mendeteksi selisih data seketika.',
      outcomes: [
        'Rekonsiliasi 500+ invoice selesai dalam waktu kurang dari 2 menit',
        'Zero-error human typo pada pencatatan jurnal kas keluar',
        'Early-warning anomaly detection saat pengeluaran melampaui SOP',
      ],
    },
    {
      id: 'hr',
      title: 'Rekrutmen & Operasional SDM',
      icon: Users2,
      headline: 'Saring Ratusan CV Pelamar & Onboarding Karyawan Baru via WhatsApp',
      challenge: 'Divisi HR tenggelam dalam ribuan lembar resume kandidat dan menjawab pertanyaan repetitif seputar fasilitas BPJS dan jatah cuti.',
      solution: 'AI HR menyaring CV berdasarkan kriteria teknis spesifik dan melayani sesi tanya jawab peraturan perusahaan 24/7 di WhatsApp.',
      outcomes: [
        'Waktu penyaringan kandidat berkurang 80%',
        'Onboarding staf baru selesai dalam 1 hari dengan checklist otomatis',
        'Laporan bulanan employee sentiment & absenteeism teragregasi',
      ],
    },
    {
      id: 'operations',
      title: 'Logistik & Manajemen Gudang',
      icon: Truck,
      headline: 'Monitoring Resi Pengiriman & Otomasi Order Restock Bahan Baku',
      challenge: 'Keterlambatan pengiriman kurir sering tidak terdeteksi hingga pelanggan mengajukan komplain keras.',
      solution: 'AI Operations melacak status ratusan resi ekspedisi dan memicu notifikasi peringatan dini saat pengiriman terhambat melebihi batas SLA.',
      outcomes: [
        'Pemantauan SLA kurir 100% otomatis tanpa cek manual satu-per-satu',
        'Trigger Purchase Order otomatis sebelum buffer stock habis',
        'Pengurangan keluhan keterlambatan pesanan hingga 65%',
      ],
    },
  ];

  const currentUseCase = useCases.find((u) => u.id === activeTab) || useCases[0];

  return (
    <section className="py-24 bg-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#16B7D9]/30 text-xs font-semibold text-[#16B7D9] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>INDUSTRY & DEPARTMENTAL USE CASES</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Diterapkan Sukses di Berbagai Departemen Bisnis
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Lihat bagaimana solusi OrchestreeAI menjawab kebutuhan spesifik di setiap lini divisi operasional perusahaan Anda
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
          {useCases.map((uc) => {
            const Icon = uc.icon;
            const isSelected = activeTab === uc.id;
            return (
              <button
                key={uc.id}
                onClick={() => setActiveTab(uc.id)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white shadow-lg'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{uc.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Use Case Card */}
        <div className="mt-10 rounded-3xl bg-gradient-to-b from-[#0B1835] via-[#071226] to-[#0B1835] border border-[#08B85C]/30 p-6 sm:p-10 shadow-2xl">
          <div className="max-w-3xl">
            <h3 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
              {currentUseCase.headline}
            </h3>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Problem & Solution */}
            <div className="space-y-4 text-xs sm:text-sm">
              <div className="p-4 rounded-2xl bg-red-500/[0.06] border border-red-500/20 space-y-1.5">
                <span className="text-red-400 font-bold uppercase text-[11px] block">Tantangan Lapangan:</span>
                <p className="text-slate-300 leading-relaxed">{currentUseCase.challenge}</p>
              </div>

              <div className="p-4 rounded-2xl bg-[#08B85C]/[0.08] border border-[#08B85C]/30 space-y-1.5">
                <span className="text-[#08B85C] font-bold uppercase text-[11px] block">Solusi OrchestreeAI:</span>
                <p className="text-slate-200 leading-relaxed">{currentUseCase.solution}</p>
              </div>
            </div>

            {/* Measurable Outcomes */}
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col justify-between space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Hasil Terukur yang Dicapai:
              </span>
              <ul className="space-y-3">
                {currentUseCase.outcomes.map((out, idx) => (
                  <li key={idx} className="flex items-start space-x-2.5 text-xs sm:text-sm text-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-[#08B85C] shrink-0 mt-0.5" />
                    <span>{out}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-2 text-[11px] text-[#16B7D9] font-mono">
                Integrasi Instan dalam &lt; 15 Menit Tanpa Perlu Coding
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
