import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Award,
  Users2,
  Cpu,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  FileCheck2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface RankingMember {
  id: string;
  rank: number;
  name: string;
  role: string;
  type: 'HUMAN' | 'AI';
  avatarEmoji: string;
  department: string;
  score: number;
  taskCount: number;
  timelinessScore: number;
  qualityScore: number;
  escalationRate: string;
  slaAvg: string;
  recommendation: string;
}

export const WorkforcePerformanceSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'human' | 'ai'>('all');
  const [selectedMember, setSelectedMember] = useState<RankingMember | null>(null);

  const rankings: RankingMember[] = [
    {
      id: 'ai-sales-01',
      rank: 1,
      name: 'Rian (AI Sales & CRM)',
      role: 'AI Sales Specialist',
      type: 'AI',
      avatarEmoji: '💼',
      department: 'Sales & CRM',
      score: 97.8,
      taskCount: 342,
      timelinessScore: 99.4,
      qualityScore: 98.2,
      escalationRate: '1.2%',
      slaAvg: '4.2s',
      recommendation: 'Perluas kuota concurrency WhatsApp Gateway untuk mengantisipasi lonjakan prospek kampanye Flash Sale.',
    },
    {
      id: 'human-sales-01',
      rank: 2,
      name: 'Doni Pratama',
      role: 'Senior Account Executive',
      type: 'HUMAN',
      avatarEmoji: '🧑‍💼',
      department: 'Sales & CRM',
      score: 96.4,
      taskCount: 48,
      timelinessScore: 97.0,
      qualityScore: 98.0,
      escalationRate: '0.0%',
      slaAvg: '12m',
      recommendation: 'Performa negosiasi kontrak enterprise sangat memuaskan. Direkomendasikan mendapat bonus target Q3.',
    },
    {
      id: 'ai-cfo-01',
      rank: 3,
      name: 'Hendra (AI CFO Modeler)',
      role: 'AI Financial Modeler',
      type: 'AI',
      avatarEmoji: '📈',
      department: 'Finance',
      score: 96.1,
      taskCount: 512,
      timelinessScore: 99.8,
      qualityScore: 97.4,
      escalationRate: '0.8%',
      slaAvg: '6.1s',
      recommendation: 'Otomatisasi rekonsiliasi bank berjalan prima tanpa anomali data.',
    },
    {
      id: 'human-mkt-01',
      rank: 4,
      name: 'Maya Wulandari',
      role: 'Marketing Director',
      type: 'HUMAN',
      avatarEmoji: '👩‍💼',
      department: 'Marketing',
      score: 94.8,
      taskCount: 62,
      timelinessScore: 95.2,
      qualityScore: 96.5,
      escalationRate: '0.0%',
      slaAvg: '25m',
      recommendation: 'Persetujuan materi kreatif berjalan tepat waktu dengan review komprehensif.',
    },
    {
      id: 'ai-mkt-01',
      rank: 5,
      name: 'Kirana (AI Marketing)',
      role: 'AI Marketing Strategist',
      type: 'AI',
      avatarEmoji: '🚀',
      department: 'Marketing',
      score: 94.2,
      taskCount: 284,
      timelinessScore: 98.6,
      qualityScore: 94.8,
      escalationRate: '2.1%',
      slaAvg: '8.4s',
      recommendation: 'Kualitas variasi hook konten TikTok terus meningkat berkat Closed-Loop Memory.',
    },
  ];

  const filteredRankings = rankings.filter((r) => {
    if (activeTab === 'human') return r.type === 'HUMAN';
    if (activeTab === 'ai') return r.type === 'AI';
    return true;
  });

  return (
    <section id="performance" className="py-24 bg-gradient-to-b from-[#071226] via-[#0B1835] to-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4">
            <Award className="w-3.5 h-3.5" />
            <span>OBJECTIVE WORKFORCE EVALUATION</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Setiap Workforce Memiliki Performance Score
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Transparansi penuh untuk pimpinan dan manajemen HR. Ketahui produktivitas, ketepatan waktu, kualitas hasil kerja, dan efisiensi kolaborasi staf manusia dan AI secara objektif
          </p>
        </div>

        {/* 2 Comparison Cards: Human Metrics vs AI Metrics */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Human Metrics */}
          <div className="p-6 rounded-3xl bg-white/[0.03] border border-[#1976E8]/30 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-[#1976E8]/20 text-[#1976E8] flex items-center justify-center">
                  <Users2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Metrik Evaluasi Staf Human</h3>
                  <p className="text-xs text-slate-400">Dimensi penilaian kinerja staf karyawan asli</p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#1976E8]/20 text-[#1976E8] font-bold">
                HUMAN KPI
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 font-semibold block text-[11px]">Task Completion Rate</span>
                <p className="text-white font-bold text-sm mt-0.5">Persentase Target</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 font-semibold block text-[11px]">Timeliness & SLA</span>
                <p className="text-white font-bold text-sm mt-0.5">Ketepatan Deadline</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 font-semibold block text-[11px]">Output Quality Review</span>
                <p className="text-white font-bold text-sm mt-0.5">Skor Kualitas Manajer</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 font-semibold block text-[11px]">Human-AI Synergy</span>
                <p className="text-white font-bold text-sm mt-0.5">Efisiensi Delegasi</p>
              </div>
            </div>
          </div>

          {/* AI Metrics */}
          <div className="p-6 rounded-3xl bg-white/[0.03] border border-[#08B85C]/30 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-[#08B85C]/20 text-[#08B85C] flex items-center justify-center">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Metrik Evaluasi Staf AI Agent</h3>
                  <p className="text-xs text-slate-400">Dimensi penilaian akurasi komputasi dan tugas otonom</p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#08B85C]/20 text-[#08B85C] font-bold">
                AI AGENT SLA
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 font-semibold block text-[11px]">Execution Success Rate</span>
                <p className="text-white font-bold text-sm mt-0.5">Keberhasilan Tools</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 font-semibold block text-[11px]">Latency & Throughput</span>
                <p className="text-white font-bold text-sm mt-0.5">Waktu Respon Detik</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 font-semibold block text-[11px]">Human Correction Rate</span>
                <p className="text-white font-bold text-sm mt-0.5">Tingkat Revisi Staf</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-slate-400 font-semibold block text-[11px]">Policy & Brand Safety</span>
                <p className="text-white font-bold text-sm mt-0.5">Kepatuhan 100% SOP</p>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Leaderboard Ranking Preview */}
        <div className="mt-14 rounded-3xl bg-[#071226] border border-white/15 p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-white/10 gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-[#08B85C]" />
                <span>Monthly HR Review & Performance Ranking Leaderboard</span>
              </h3>
              <p className="text-xs text-slate-400">
                Peringkat gabungan tenaga kerja manusia dan AI bulan ini berdasarkan data empiris sistem.
              </p>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-white/5 border border-white/10">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  activeTab === 'all' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setActiveTab('human')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  activeTab === 'human' ? 'bg-[#1976E8]/30 text-[#1976E8]' : 'text-slate-400 hover:text-white'
                }`}
              >
                Human
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  activeTab === 'ai' ? 'bg-[#08B85C]/30 text-[#08B85C]' : 'text-slate-400 hover:text-white'
                }`}
              >
                AI Agent
              </button>
            </div>
          </div>

          {/* Leaderboard Table List */}
          <div className="mt-6 space-y-2.5">
            {filteredRankings.map((member) => (
              <div
                key={member.id}
                onClick={() => setSelectedMember(member)}
                className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 hover:bg-white/[0.05] transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-slate-300">
                    #{member.rank}
                  </div>
                  <div className="text-2xl">{member.avatarEmoji}</div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-sm text-white">{member.name}</h4>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase font-bold ${
                          member.type === 'AI'
                            ? 'bg-[#08B85C]/20 text-[#08B85C]'
                            : 'bg-[#1976E8]/20 text-[#1976E8]'
                        }`}
                      >
                        {member.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{member.role} • {member.department}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end space-x-6 w-full sm:w-auto text-xs font-mono">
                  <div className="text-center sm:text-right">
                    <span className="text-slate-400 text-[10px] block font-sans">Tugas Selesai</span>
                    <span className="text-white font-bold">{member.taskCount}</span>
                  </div>
                  <div className="text-center sm:text-right">
                    <span className="text-slate-400 text-[10px] block font-sans">Ketepatan Waktu</span>
                    <span className="text-[#16B7D9] font-bold">{member.timelinessScore}%</span>
                  </div>
                  <div className="text-center sm:text-right">
                    <span className="text-slate-400 text-[10px] block font-sans">Skor Akhir</span>
                    <span className="text-[#08B85C] font-extrabold text-sm">{member.score}</span>
                  </div>
                  <span className="text-slate-400 hover:text-white hidden md:inline">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Modal / Flyout for Selected Member Detail */}
          {selectedMember && (
            <div className="mt-6 p-5 rounded-2xl bg-white/[0.04] border border-[#08B85C]/30 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">{selectedMember.avatarEmoji}</span>
                  <span className="font-bold text-sm text-white">{selectedMember.name}</span>
                  <span className="text-xs text-slate-400">({selectedMember.role})</span>
                </div>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Tutup
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-black/30">
                  <span className="text-[10px] text-slate-400 font-sans block">Avg SLA</span>
                  <span className="text-white font-bold">{selectedMember.slaAvg}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30">
                  <span className="text-[10px] text-slate-400 font-sans block">Quality Score</span>
                  <span className="text-[#08B85C] font-bold">{selectedMember.qualityScore}%</span>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30">
                  <span className="text-[10px] text-slate-400 font-sans block">Escalation Rate</span>
                  <span className="text-amber-400 font-bold">{selectedMember.escalationRate}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-black/30">
                  <span className="text-[10px] text-slate-400 font-sans block">Evaluasi Status</span>
                  <span className="text-emerald-400 font-bold">OPTIMAL</span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed bg-black/20 p-3 rounded-xl border border-white/5">
                <strong className="text-[#16B7D9]">Rekomendasi HR & Pimpinan: </strong>
                {selectedMember.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
