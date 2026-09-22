import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users2,
  Cpu,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Zap,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';

export const RealtimeCockpitPreview: React.FC = () => {
  const [activeFilterStatus, setActiveFilterStatus] = useState<string>('ALL');

  const liveTasks = [
    {
      id: 'task-101',
      title: 'Kualifikasi 14 Lead Masuk WhatsApp Kampanye Q3',
      agent: 'Rian (AI Sales & CRM)',
      status: 'WORKING',
      progress: 75,
      time: 'Baru saja',
      dept: 'Sales',
    },
    {
      id: 'task-102',
      title: 'Persetujuan Proposal Kontrak PT Maju Sejahtera',
      agent: 'Budi Santoso (CEO)',
      status: 'WAITING',
      progress: 90,
      time: '2 mnt lalu',
      dept: 'Executive',
    },
    {
      id: 'task-103',
      title: 'Render 3 Video Reel Promosi Google Veo 2 (9:16)',
      agent: 'Dimas (AI Creative)',
      status: 'COMPLETED',
      progress: 100,
      time: '5 mnt lalu',
      dept: 'Creative',
    },
    {
      id: 'task-104',
      title: 'Jadwalkan Posting Konten Carousel Instagram',
      agent: 'Siti (AI Social)',
      status: 'SCHEDULED',
      progress: 100,
      time: 'Pkl 19:00 WIB',
      dept: 'Marketing',
    },
    {
      id: 'task-105',
      title: 'Audit Anomali Biaya Operasional di Atas Ambang SOP',
      agent: 'Hendra (AI CFO)',
      status: 'ESCALATED',
      progress: 60,
      time: '12 mnt lalu',
      dept: 'Finance',
    },
  ];

  const filteredTasks = liveTasks.filter((t) => {
    if (activeFilterStatus === 'ALL') return true;
    return t.status === activeFilterStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'WORKING':
        return <span className="px-2 py-0.5 rounded bg-[#08B85C]/20 text-[#08B85C] border border-[#08B85C]/30 text-[10px] font-mono font-bold animate-pulse">WORKING</span>;
      case 'WAITING':
        return <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">WAITING APPROVAL</span>;
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded bg-[#16B7D9]/20 text-[#16B7D9] border border-[#16B7D9]/30 text-[10px] font-mono font-bold">COMPLETED</span>;
      case 'SCHEDULED':
        return <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold">SCHEDULED</span>;
      case 'ESCALATED':
        return <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-mono font-bold">ESCALATED</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[10px] font-mono font-bold">{status}</span>;
    }
  };

  return (
    <section className="py-24 bg-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4">
            <Activity className="w-3.5 h-3.5" />
            <span>CENTRAL OPERATING COCKPIT</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Visibilitas Operasional Penuh Tanpa Perlu Rapat Bertele-tele
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Pantau seluruh aktivitas staf manusia dan staf AI secara real-time. Status pekerjaan, antrean persetujuan, metrik kesehatan sistem, dan peringatan eskalasi dalam satu layar komando
          </p>
        </div>

        {/* Dashboard Live Metrics Row */}
        <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Staf AI Sedang Bekerja</span>
              <Cpu className="w-4 h-4 text-[#08B85C]" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">14 Agen</div>
            <div className="text-[10px] text-[#08B85C] font-semibold flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#08B85C] animate-pulse" />
              <span>100% Operational Uptime</span>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Staf Human Terhubung</span>
              <Users2 className="w-4 h-4 text-[#1976E8]" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">6 Manajer</div>
            <div className="text-[10px] text-slate-400 font-semibold">
              WhatsApp & Slack Gateway Aktif
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Tugas Selesai Hari Ini</span>
              <CheckCircle2 className="w-4 h-4 text-[#16B7D9]" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">142 Tugas</div>
            <div className="text-[10px] text-[#16B7D9] font-semibold">
              Rata-rata SLA 5.4 Detik
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Menunggu Persetujuan</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-300">2 Antrean</div>
            <div className="text-[10px] text-amber-400/80 font-semibold">
              1-Click Instant Review
            </div>
          </div>
        </div>

        {/* Live Task Feed Panel */}
        <div className="mt-8 rounded-3xl bg-[#071226] border border-white/15 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between pb-4 border-b border-white/10 gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#08B85C] animate-ping" />
                <span>Live Workforce Task Activity Stream</span>
              </h3>
              <p className="text-xs text-slate-400">Pembaruan otomatis tiap milidetik dari seluruh node eksekusi.</p>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {['ALL', 'WORKING', 'WAITING', 'COMPLETED', 'SCHEDULED', 'ESCALATED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setActiveFilterStatus(st)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold cursor-pointer ${
                    activeFilterStatus === st
                      ? 'bg-white/20 text-white'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* List of stream items */}
          <div className="space-y-3">
            {filteredTasks.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3.5 w-full sm:w-auto">
                  <div className="w-2 h-2 rounded-full bg-[#08B85C]" />
                  <div>
                    <h4 className="text-xs font-bold text-white">{t.title}</h4>
                    <p className="text-[11px] text-slate-400">{t.agent} • Divisi {t.dept}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end space-x-4 w-full sm:w-auto">
                  {getStatusBadge(t.status)}
                  <span className="text-[10px] font-mono text-slate-500">{t.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
