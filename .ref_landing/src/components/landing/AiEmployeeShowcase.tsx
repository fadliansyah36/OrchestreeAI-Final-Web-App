import React, { useState } from 'react';
import {
  Cpu,
  Sparkles,
  CheckCircle2,
  Clock,
  Users2,
  Workflow,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { AI_WORKFORCE_PERSONAS, AiPersonaCard } from './landingData';

export const AiEmployeeShowcase: React.FC = () => {
  const [selectedPersona, setSelectedPersona] = useState<AiPersonaCard>(AI_WORKFORCE_PERSONAS[0]);
  const [activeFilterDept, setActiveFilterDept] = useState('ALL');

  const deptFilters = [
    { id: 'ALL', label: 'Semua AI Staff (16)' },
    { id: 'Eksekutif', label: 'Eksekutif & Strategi' },
    { id: 'Pemasaran', label: 'Marketing & Copy' },
    { id: 'Penjualan', label: 'Sales & CRM' },
    { id: 'Kreatif', label: 'Kreatif & Visual' },
    { id: 'Keuangan', label: 'Keuangan & CFO' },
    { id: 'SDM', label: 'SDM & HR' },
    { id: 'Operasional', label: 'Operasional & Ops' },
  ];

  const filteredPersonas = AI_WORKFORCE_PERSONAS.filter((p) => {
    if (activeFilterDept === 'ALL') return true;
    return p.department.toLowerCase().includes(activeFilterDept.toLowerCase());
  });

  return (
    <section id="ai-employees" className="py-24 bg-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#16B7D9]/30 text-xs font-semibold text-[#16B7D9] mb-4">
            <Cpu className="w-3.5 h-3.5" />
            <span>AI EMPLOYEE ECOSYSTEM</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            AI Employee yang Bekerja, Bukan Hanya Menjawab
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Setiap AI Agent memiliki jabatan terdefinisi, target terukur, jam kerja aktif, tool operasional yang terhubung, dan bermitra dengan staf manusia Anda secara transparan
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {deptFilters.map((df) => (
            <button
              key={df.id}
              onClick={() => setActiveFilterDept(df.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeFilterDept === df.id
                  ? 'bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white shadow-md'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {df.label}
            </button>
          ))}
        </div>

        {/* Grid of AI Employees */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredPersonas.map((persona) => {
            const isSelected = selectedPersona.id === persona.id;
            return (
              <div
                key={persona.id}
                onClick={() => setSelectedPersona(persona)}
                className={`p-5 rounded-3xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-white/[0.08] border-[#08B85C] shadow-xl shadow-[#08B85C]/15 ring-1 ring-[#08B85C]'
                    : 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      {persona.avatarEmoji}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-mono">
                      {persona.department}
                    </span>
                  </div>

                  <div className="mt-4">
                    <h4 className="font-bold text-base text-white">{persona.name}</h4>
                    <p className="text-xs text-[#16B7D9] font-medium">{persona.role}</p>
                  </div>

                  {/* Skills tags */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {persona.skills.slice(0, 2).map((s, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-300 border border-white/5"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  {/* Today work snippet */}
                  <p className="mt-3 text-[11px] text-slate-300 leading-snug line-clamp-2 bg-black/20 p-2 rounded-lg">
                    {persona.todayWorkSummary}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center space-x-1">
                    <Users2 className="w-3 h-3 text-[#1976E8]" />
                    <span className="truncate max-w-[120px]">{persona.connectedHuman}</span>
                  </span>
                  <span className="text-[#08B85C] font-semibold group-hover:translate-x-1 transition-transform">
                    Buka Detail →
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Featured Persona Deep-Dive Card */}
        {selectedPersona && (
          <div className="mt-12 rounded-3xl bg-gradient-to-r from-[#0B1835] via-[#071226] to-[#0B1835] border border-[#08B85C]/30 p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <div className="flex items-center space-x-4 lg:w-1/3">
                <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center text-4xl shadow-inner shrink-0">
                  {selectedPersona.avatarEmoji}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-2xl font-extrabold text-white">{selectedPersona.name}</h3>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#08B85C]/20 text-[#08B85C] border border-[#08B85C]/30 font-bold">
                      AI SPECIALIST
                    </span>
                  </div>
                  <p className="text-sm text-[#16B7D9] font-medium mt-0.5">{selectedPersona.role}</p>
                  <p className="text-xs text-slate-400 mt-1">{selectedPersona.department}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 w-full text-xs">
                {/* Responsibilities */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                    Tanggung Jawab & Jobdesk
                  </span>
                  <ul className="space-y-1.5">
                    {selectedPersona.responsibilities.map((r, idx) => (
                      <li key={idx} className="flex items-start space-x-2 text-slate-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#08B85C] shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Partners & Tools */}
                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block mb-1.5">
                      Partner Kerja Manusia
                    </span>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center space-x-2 text-white font-medium">
                      <Users2 className="w-4 h-4 text-[#1976E8]" />
                      <span>{selectedPersona.connectedHuman}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block mb-1.5">
                      Ekosistem Tool Terintegrasi
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPersona.connectedTools.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 font-mono text-[11px]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
