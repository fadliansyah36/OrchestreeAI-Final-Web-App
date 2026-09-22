import React, { useState } from 'react';
import {
  Clock,
  Sun,
  Moon,
  Coffee,
  CheckCircle2,
  Users2,
  Cpu,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface TimelineItem {
  time: string;
  humanActivity: string;
  aiActivity: string;
  statusBadge: string;
}

export const DayInTheLifeSection: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<'CEO' | 'MARKETING' | 'SALES' | 'FINANCE'>('CEO');

  const timelines: Record<string, TimelineItem[]> = {
    CEO: [
      {
        time: '08:00 WIB',
        humanActivity: 'Membuka WhatsApp saat perjalanan ke kantor.',
        aiActivity: 'Arya (AI Chief of Staff) mengirim Executive Morning Briefing: ringkasan omzet kemarin, status KPI tim, dan 2 hal penting yang butuh persetujuan.',
        statusBadge: 'Briefing Ready',
      },
      {
        time: '11:00 WIB',
        humanActivity: 'Meeting strategis ekspansi bisnis bersama calon investor.',
        aiActivity: 'AI Chief of Staff menginstruksikan AI Marketing & Sales untuk mempersiapkan deck data proyeksi pertumbuhan.',
        statusBadge: 'Auto Delegation',
      },
      {
        time: '14:30 WIB',
        humanActivity: 'Meninjau penawaran kontrak klien enterprise senilai Rp 500jt.',
        aiActivity: 'Sistem meminta 1-click Approval untuk persetujuan diskon di atas batas wewenang manajer.',
        statusBadge: '1-Click Approval',
      },
      {
        time: '18:00 WIB',
        humanActivity: 'Selesai jam kerja kantor tanpa stres lembur.',
        aiActivity: 'AI Workforce beralih ke mode 24/7 Autopilot untuk menjaga customer service dan penjadwalan konten malam hari.',
        statusBadge: 'Autopilot Night Mode',
      },
    ],
    MARKETING: [
      {
        time: '08:30 WIB',
        humanActivity: 'Meninjau kalender editorial mingguan di Trello.',
        aiActivity: 'Kirana & Reza telah menyiapkan 8 draf caption dan 3 video reel 9:16 siap publish.',
        statusBadge: 'Content Prepared',
      },
      {
        time: '12:00 WIB',
        humanActivity: 'Makan siang dan evaluasi tren industri.',
        aiActivity: 'Siti Social mempublikasikan postingan Carousel di jam istirahat sesuai jam engagement tertinggi.',
        statusBadge: 'Auto-Published',
      },
      {
        time: '15:00 WIB',
        humanActivity: 'Diskusi ide kampanye hari kemerdekaan bersama tim desain.',
        aiActivity: 'Dimas Art menghasilkan 4 varian storyboard video Google Veo 2 beresolusi tinggi.',
        statusBadge: 'Storyboard Rendered',
      },
      {
        time: '17:30 WIB',
        humanActivity: 'Melihat rekap data analytics harian.',
        aiActivity: 'Laporan engagement dan ROAS iklan terkompilasi otomatis ke Google Sheets & Telegram.',
        statusBadge: 'Daily Analytics Ready',
      },
    ],
    SALES: [
      {
        time: '08:45 WIB',
        humanActivity: 'Menyalakan WhatsApp Business di laptop.',
        aiActivity: 'Rian (AI Sales) telah mengkualifikasi 24 pesan prospek yang masuk tadi malam dan menyusun draft balasan prioritas.',
        statusBadge: '24 Leads Qualified',
      },
      {
        time: '11:30 WIB',
        humanActivity: 'Telepon negosiasi langsung dengan calon pembeli prospektif.',
        aiActivity: 'AI mendeteksi kesepakatan harga dan seketika menyusun draft surat penawaran resmi berformat PDF.',
        statusBadge: 'Instant Quotation',
      },
      {
        time: '14:00 WIB',
        humanActivity: 'Mengunjungi kantor klien di Jakarta Selatan.',
        aiActivity: 'AI Sales secara otomatis mengirim pesan pengingat jadwal meeting dan konfirmasi alamat ke klien.',
        statusBadge: 'Automated Reminder',
      },
      {
        time: '17:00 WIB',
        humanActivity: 'Memperbarui status pipeline di CRM.',
        aiActivity: 'Semua histori chat WhatsApp telah tersinkronisasi otomatis ke kartu kontak HubSpot tanpa perlu ketik manual.',
        statusBadge: 'CRM Auto-Synced',
      },
    ],
    FINANCE: [
      {
        time: '08:15 WIB',
        humanActivity: 'Login ke dashboard keuangan.',
        aiActivity: 'Hendra (AI CFO) telah mencocokkan mutasi rekening bank BCA dengan 85 invoice Accurate/Jurnal.',
        statusBadge: 'Reconciliation Complete',
      },
      {
        time: '10:30 WIB',
        humanActivity: 'Memeriksa draft pengajuan anggaran operasional departemen.',
        aiActivity: 'AI menandai 1 pengeluaran yang tidak sesuai SOP anggaran bulanan untuk diteliti lebih lanjut.',
        statusBadge: 'Anomaly Flagged',
      },
      {
        time: '14:00 WIB',
        humanActivity: 'Menyetujui pembayaran tagihan vendor prioritas.',
        aiActivity: 'AI menyiapkan draft transfer massal dan mengarsipkan bukti potong PPh 23.',
        statusBadge: 'Tax & Slip Vaulted',
      },
      {
        time: '17:00 WIB',
        humanActivity: 'Menutup buku kas harian.',
        aiActivity: 'Laporan cash runway 6 bulan terbarukan otomatis dengan prediksi arus kas masuk minggu depan.',
        statusBadge: 'Cashflow Forecast Ready',
      },
    ],
  };

  const currentTimeline = timelines[selectedRole];

  return (
    <section className="py-24 bg-gradient-to-b from-[#071226] via-[#0B1835] to-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#16B7D9]/30 text-xs font-semibold text-[#16B7D9] mb-4">
            <Clock className="w-3.5 h-3.5" />
            <span>DAY IN THE LIFE SIMULATION</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Satu Hari Bersama OrchestreeAI di Perusahaan Anda
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Lihat bagaimana rutinitas harian berubah dari kepanikan tugas manual berulang menjadi alur kerja kolaboratif yang teratur, tenang, dan terukur
          </p>
        </div>

        {/* Role Selectors */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {[
            { id: 'CEO', label: '👔 CEO / Business Owner' },
            { id: 'MARKETING', label: '🚀 Marketing Director' },
            { id: 'SALES', label: '💼 Sales Executive' },
            { id: 'FINANCE', label: '📈 Finance Manager' },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRole(r.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedRole === r.id
                  ? 'bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white shadow-md'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Timeline Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentTimeline.map((item, idx) => (
            <div
              key={idx}
              className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col justify-between space-y-4 hover:border-[#08B85C]/40 transition-all"
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="font-mono font-bold text-sm text-[#08B85C]">{item.time}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-300 font-mono">
                    {item.statusBadge}
                  </span>
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#1976E8] block">Aktivitas Karyawan:</span>
                    <p className="text-xs text-white font-medium mt-0.5">{item.humanActivity}</p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#08B85C] block">Aksi AI Workforce:</span>
                    <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{item.aiActivity}</p>
                  </div>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                <span>Kolaborasi Terpadu</span>
                <span className="text-[#16B7D9]">100% On-Track</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
