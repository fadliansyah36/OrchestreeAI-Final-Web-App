import React, { useState } from 'react';
import {
  ShoppingBag,
  Palette,
  Rocket,
  Briefcase,
  Factory,
  CheckCircle2,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface IndustryUseCase {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  situation: string;
  orchestration: string;
  deliverables: string[];
}

export const UseCasesSection: React.FC = () => {
  const industries: IndustryUseCase[] = [
    {
      id: 'retail',
      name: 'Retail / E-commerce',
      icon: ShoppingBag,
      tagline: 'Otomasi Layanan Pelanggan & Pemrosesan Pesanan WhatsApp',
      situation: 'Peningkatan volume chat masuk yang menuntut respon cepat mengenai ketersediaan stok, konfirmasi ongkir, dan validasi pembayaran mutasi bank.',
      orchestration: 'Staf AI Komersial memvalidasi pertanyaan pelanggan via WhatsApp Cloud API resmi, mengecek katalog produk di Company Brain, dan menyiapkan draf invoice pembayaran.',
      deliverables: [
        'Respon seketika terhadap pertanyaan produk dan status resi pengiriman',
        'Validasi otomatis bukti transfer bank sebelum pesanan disiapkan',
        'Sinkronisasi riwayat obrolan pelanggan ke sistem inventaris'
      ]
    },
    {
      id: 'creative',
      name: 'Agency Kreatif',
      icon: Palette,
      tagline: 'Produksi Konten Multi-Kanal & Generasi Visual Terpadu',
      situation: 'Kebutuhan memproduksi puluhan draf copy iklan, visual promosi, dan naskah kampanye terarah untuk berbagai klien dalam tenggat waktu ketat.',
      orchestration: 'AI Creative Director memadukan model teks dan model visual GPT-Image-2 untuk menghasilkan aset kampanye yang sesuai dengan panduan identitas merek masing-masing klien.',
      deliverables: [
        'Penyusunan variasi naskah copywriting berbasis segmen audiens',
        'Generasi draf gambar produk beresolusi tinggi dengan kendali gaya konsisten',
        'Alur persetujuan terpusat sebelum konten diserahkan ke klien'
      ]
    },
    {
      id: 'startup-sales',
      name: 'Startup Sales',
      icon: Rocket,
      tagline: 'Kualifikasi Prospek Otonom & Penjadwalan Pertemuan B2B',
      situation: 'Tim founder dan sales rep terbatas sering kehilangan momentum akibat lamanya kualifikasi manual calon klien B2B dari website dan form prospek.',
      orchestration: 'Staf AI Sales mengidentifikasi profil perusahaan prospek, mengecek skala anggaran, dan menawarkan slot demo otomatis yang terhubung ke kalender tim penjualan.',
      deliverables: [
        'Kualifikasi kebutuhan prospek secara interaktif dalam hitungan detik',
        'Pembuatan ringkasan profil prospek dan rekomendasi solusi sebelum meeting',
        'Peningkatan rasio konversi prospek menjadi pertemuan bisnis berkualitas'
      ]
    },
    {
      id: 'professional-services',
      name: 'Layanan Profesional',
      icon: Briefcase,
      tagline: 'Analisis Dokumen Kepatuhan & Penyusunan Laporan Berkala',
      situation: 'Konsultan hukum, akuntan, dan auditor menghabiskan sebagian besar jam kerja untuk meninjau kelengkapan regulasi pada tumpukan berkas klien.',
      orchestration: 'Staf AI Analis Dokumen membaca berkas PDF/Word dengan pencarian semantik terisolasi pgvector, mengecek kesesuaian klausul dengan regulasi, dan membuat draf audit.',
      deliverables: [
        'Pemeriksaan kepatuhan klausul perjanjian dalam hitungan detik',
        'Ekstraksi ringkasan eksekutif dokumen tanpa risiko data terekspos keluar',
        'Draf laporan konsultasi terstruktur siap tinjauan rekan senior'
      ]
    },
    {
      id: 'enterprise-manufacturing',
      name: 'Enterprise Manufaktur & Konstruksi',
      icon: Factory,
      tagline: 'Koordinasi Logistik Lapangan & Pengawasan SOP Terpadu',
      situation: 'Komunikasi antara mandor lapangan, manajer logistik, dan manajemen kantor pusat sering terlambat mengenai pengiriman material dan insiden lapangan.',
      orchestration: 'Staf AI Operasional menerima update via bot Telegram lapangan, mencatat progres material, mendeteksi potensi keterlambatan jadwal, dan menyusun laporan harian.',
      deliverables: [
        'Pencatatan laporan harian lapangan berbasis pesan suara atau teks mandor',
        'Peringatan dini selisih kedatangan material proyek terhadap jadwal utama',
        'Penyimpanan catatan audit kepatuhan keselamatan kerja yang permanen'
      ]
    }
  ];

  const [selectedIndustryId, setSelectedIndustryId] = useState(industries[0].id);
  const activeIndustry = industries.find((i) => i.id === selectedIndustryId) || industries[0];
  const ActiveIcon = activeIndustry.icon;

  return (
    <section id="use-cases" className="py-24 bg-[#0B1220] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#34D399]/30 text-xs font-semibold text-[#34D399] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SOLUSI SPESIFIK INDUSTRI</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Diterapkan Nyata di Berbagai Industri
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Sistem kerja OrchestreeAI mengadaptasi SOP dan kebutuhan spesifik sektor bisnis Anda dengan presisi tinggi.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mt-12 flex flex-wrap justify-center gap-2 sm:gap-3">
          {industries.map((ind) => {
            const isSelected = ind.id === selectedIndustryId;
            const Icon = ind.icon;
            return (
              <button
                key={ind.id}
                onClick={() => setSelectedIndustryId(ind.id)}
                className={`px-4 py-3 rounded-2xl text-xs font-bold transition-all flex items-center space-x-2.5 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white shadow-lg shadow-[#1FA35A]/25 scale-105'
                    : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{ind.name}</span>
              </button>
            );
          })}
        </div>

        {/* Active Industry Card */}
        <div className="mt-10 max-w-5xl mx-auto p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-white/[0.04] via-[#0B1B2B] to-white/[0.02] border border-white/15 backdrop-blur-md shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1FA35A]/30 to-[#1E6FE0]/30 border border-[#34D399]/40 flex items-center justify-center text-[#34D399]">
                <ActiveIcon className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#60A5FA]">
                  Sektor Terapan
                </span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">{activeIndustry.name}</h3>
              </div>
            </div>
            <div className="text-left md:text-right">
              <span className="text-xs text-slate-300 font-semibold max-w-xs block">
                {activeIndustry.tagline}
              </span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">Tantangan Operasional</h4>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                {activeIndustry.situation}
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-[#1FA35A]/30">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#34D399] mb-2">Orkestrasai AI Terpadu</h4>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                {activeIndustry.orchestration}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Luaran Terverifikasi</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeIndustry.deliverables.map((del, dIdx) => (
                <div
                  key={dIdx}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-start space-x-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-200 leading-relaxed">{del}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
