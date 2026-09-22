import React, { useState } from 'react';
import {
  Calendar,
  Mail,
  Mic,
  Send,
  Bell,
  Star,
  User,
  ChevronDown,
  ArrowUpRight,
  LayoutGrid,
  Users,
  Kanban,
  Zap,
  Menu,
  CheckCircle2,
  Sparkles,
  Wifi,
  Signal,
  Battery
} from 'lucide-react';

interface OrchestreeClientAppMockupProps {
  interactive?: boolean;
}

export const OrchestreeClientAppMockup: React.FC<OrchestreeClientAppMockupProps> = ({
  interactive = true
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'workforce' | 'tasks' | 'proactive' | 'more'>('overview');
  const [promptText, setPromptText] = useState('');
  const [activeActionNotice, setActiveActionNotice] = useState<string | null>(null);

  const triggerAction = (label: string) => {
    if (!interactive) return;
    setActiveActionNotice(label);
    setTimeout(() => {
      setActiveActionNotice(null);
    }, 2500);
  };

  return (
    <div className="w-full h-full bg-[#F4F6F9] text-slate-800 flex flex-col font-sans select-none overflow-hidden text-left relative">
      {/* 1. Android Status Bar */}
      <div className="pt-2 px-5 pb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700 shrink-0 bg-white">
        <span className="font-medium text-slate-800 tracking-tight">13.10</span>
        <div className="flex items-center space-x-1.5 text-[10px] text-slate-600 font-mono">
          <span className="text-[9px] tracking-tighter">6,14 K/S</span>
          <div className="flex items-center space-x-0.5">
            <span className="text-[8px] font-bold px-0.5 border border-slate-400 rounded">VoLTE</span>
            <span className="text-[9px] font-bold">4G+</span>
          </div>
          <div className="flex items-center space-x-0.5 bg-slate-100 px-1 py-0.5 rounded border border-slate-300 text-[9px]">
            <span>38</span>
          </div>
        </div>
      </div>

      {/* 2. Top App Bar (Header) */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 shadow-xs">
        {/* Left Brand with Online Status */}
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#08B85C] shadow-sm animate-pulse" />
          <span className="font-bold text-sm text-slate-700 tracking-tight">
            OrchestreeAI...
          </span>
        </div>

        {/* Right Action Icons: Notification Bell, Tenant Owner Dropdown, User Profile */}
        <div className="flex items-center space-x-2">
          {/* Notification Bell with Badge '4' */}
          <div
            onClick={() => triggerAction('4 Notifikasi Menunggu')}
            className="relative cursor-pointer p-1 rounded-full hover:bg-slate-100 transition-colors"
            title="4 Notifikasi Baru"
          >
            <Bell className="w-5 h-5 text-amber-500 fill-amber-400/80" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
              4
            </span>
          </div>

          {/* Tenant Owner Dropdown Pill */}
          <div
            onClick={() => triggerAction('Role: Tenant Owner (Akses Penuh)')}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-[#EBF3FE] border border-[#7AA5E9]/60 cursor-pointer hover:bg-[#DDEBFE] transition-colors"
          >
            <div className="w-3.5 h-3.5 rounded-full bg-[#1976E8] flex items-center justify-center text-white">
              <Star className="w-2.5 h-2.5 fill-current" />
            </div>
            <span className="text-[11px] font-bold text-[#1976E8]">Tenant Owner</span>
            <ChevronDown className="w-3 h-3 text-[#1976E8]" />
          </div>

          {/* User Profile Avatar */}
          <div
            onClick={() => triggerAction('Profil: Farhan Fadliansyah')}
            className="w-8 h-8 rounded-full bg-[#EBF3FE] border-2 border-[#1976E8] flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
          >
            <User className="w-4 h-4 text-[#1976E8]" />
          </div>
        </div>
      </div>

      {/* Action Toast Pop-up inside Mockup */}
      {activeActionNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full bg-slate-900/95 text-white text-[11px] font-medium shadow-xl border border-white/20 flex items-center space-x-1.5 animate-in fade-in zoom-in-95">
          <Sparkles className="w-3 h-3 text-[#08B85C]" />
          <span>{activeActionNotice}</span>
        </div>
      )}

      {/* 3. Main Scrollable Dashboard Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 pb-16">
        {/* User Greeting Section */}
        <div className="pt-1">
          <div className="text-xs sm:text-sm text-slate-500 font-normal">
            Selamat Siang,
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1976E8] tracking-tight leading-none mt-0.5">
            Farhan Fadliansyah
          </h1>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            Sabtu, 29 Agustus · 4 tugas jatuh tempo
          </div>
        </div>

        {/* 4. Hero Gradient Progress Card (Blue to Green) */}
        <div
          onClick={() => triggerAction('Membuka detail skor produktivitas')}
          className="rounded-3xl p-5 bg-gradient-to-r from-[#1976E8] via-[#1093B2] to-[#08B85C] text-white shadow-lg relative overflow-hidden cursor-pointer hover:brightness-105 transition-all"
        >
          {/* Subtle Ambient Shapes */}
          <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            {/* Left Texts */}
            <div className="flex-1 pr-3">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-white font-bold text-[9px] uppercase tracking-wider mb-2">
                PROGRESS HARI INI
              </span>
              <h2 className="text-lg font-bold text-white leading-tight">
                Skor Produktivitas
              </h2>
              <p className="text-[11px] text-white/90 mt-1 line-clamp-2 leading-relaxed">
                Semangat! Selesaikan tugas prioritas untuk mencapai targe...
              </p>
              <div className="text-xs font-semibold text-white mt-3 flex items-center space-x-1">
                <span>0 dari 5 tugas terselesaikan</span>
              </div>
            </div>

            {/* Right Circular Progress Ring */}
            <div className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white/30 flex flex-col items-center justify-center bg-white/10 shrink-0 shadow-inner">
              <span className="text-sm sm:text-base font-extrabold text-white leading-none">
                0%
              </span>
              <span className="text-[8px] font-bold text-white/90 uppercase tracking-wider mt-0.5">
                SELESAI
              </span>
            </div>
          </div>
        </div>

        {/* 5. Rekomendasi AI Hari Ini Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-extrabold tracking-wider text-slate-700 uppercase">
              REKOMENDASI AI HARI INI
            </h3>
            <span className="text-[11px] font-extrabold text-[#1976E8] tracking-wider uppercase cursor-pointer hover:underline">
              FOR YOU
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Card 1: Rencanakan Hari Ini */}
            <div
              onClick={() => triggerAction('Fitur: Rencanakan Hari Ini')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:border-[#10B8B0] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-full bg-[#10B8B0] text-white flex items-center justify-center shadow-xs">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="mt-2.5">
                <h4 className="text-xs font-bold text-slate-800 leading-tight">
                  Rencanakan Hari Ini
                </h4>
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  Susun prioritas task & jadwal
                </p>
              </div>
            </div>

            {/* Card 2: Ringkas Notifikasi */}
            <div
              onClick={() => triggerAction('Fitur: Ringkas Notifikasi')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:border-[#F7A600] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-full bg-[#F7A600] text-white flex items-center justify-center shadow-xs">
                  <Mail className="w-4 h-4 text-white" />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="mt-2.5">
                <h4 className="text-xs font-bold text-slate-800 leading-tight">
                  Ringkas Notifikasi
                </h4>
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  Ringkas alerts & event penting
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Quick Prompt Input Bar */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-2.5 px-4 shadow-sm flex items-center justify-between">
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Tanya AI apa saja..."
            className="text-xs text-slate-700 placeholder-slate-400 bg-transparent outline-none flex-1 pr-2"
          />
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => triggerAction('Input Suara: Mendengarkan...')}
              className="p-1 rounded-full hover:bg-slate-100 text-[#1976E8] transition-colors"
              title="Perintah Suara"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (promptText.trim()) {
                  triggerAction(`Mengirim: "${promptText}"`);
                  setPromptText('');
                } else {
                  triggerAction('Ketik pertanyaan untuk asisten AI');
                }
              }}
              className="p-1 rounded-full hover:bg-slate-100 text-[#70A8F8] transition-colors"
              title="Kirim Pesan"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 7. Lower Cards Peek */}
        <div className="grid grid-cols-2 gap-2.5 opacity-90">
          <div className="bg-white rounded-2xl p-3 border border-slate-200/70 shadow-xs">
            <div className="text-xs font-bold text-slate-800 truncate">
              Apa yang sudah te...
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              4 tugas aktif lintas tim
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-200/70 shadow-xs">
            <div className="text-xs font-bold text-slate-800 truncate">
              Omnichannel Inbox
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Respon interaksi...
            </div>
          </div>
        </div>
      </div>

      {/* 8. Bottom Navigation Bar */}
      <div className="bg-white border-t border-slate-200/90 py-1.5 px-3 flex items-center justify-around shrink-0 z-20">
        {/* Tab 1: Overview (Active in screenshot) */}
        <button
          onClick={() => setActiveTab('overview')}
          className="flex flex-col items-center cursor-pointer transition-transform active:scale-95"
        >
          <div className={`px-4 py-1 rounded-full flex items-center justify-center ${
            activeTab === 'overview' ? 'bg-[#C5E8DC]' : 'bg-transparent'
          }`}>
            <LayoutGrid className={`w-4 h-4 ${
              activeTab === 'overview' ? 'text-[#0F5A47]' : 'text-slate-500'
            }`} />
          </div>
          <span className={`text-[10px] mt-0.5 ${
            activeTab === 'overview' ? 'font-bold text-slate-900' : 'font-medium text-slate-500'
          }`}>
            Overview
          </span>
        </button>

        {/* Tab 2: Workforce */}
        <button
          onClick={() => setActiveTab('workforce')}
          className="flex flex-col items-center cursor-pointer transition-transform active:scale-95"
        >
          <div className={`px-4 py-1 rounded-full flex items-center justify-center ${
            activeTab === 'workforce' ? 'bg-[#C5E8DC]' : 'bg-transparent'
          }`}>
            <Users className={`w-4 h-4 ${
              activeTab === 'workforce' ? 'text-[#0F5A47]' : 'text-slate-500'
            }`} />
          </div>
          <span className={`text-[10px] mt-0.5 ${
            activeTab === 'workforce' ? 'font-bold text-slate-900' : 'font-medium text-slate-500'
          }`}>
            Workforc...
          </span>
        </button>

        {/* Tab 3: Task Board */}
        <button
          onClick={() => setActiveTab('tasks')}
          className="flex flex-col items-center cursor-pointer transition-transform active:scale-95"
        >
          <div className={`px-4 py-1 rounded-full flex items-center justify-center ${
            activeTab === 'tasks' ? 'bg-[#C5E8DC]' : 'bg-transparent'
          }`}>
            <Kanban className={`w-4 h-4 ${
              activeTab === 'tasks' ? 'text-[#0F5A47]' : 'text-slate-500'
            }`} />
          </div>
          <span className={`text-[10px] mt-0.5 ${
            activeTab === 'tasks' ? 'font-bold text-slate-900' : 'font-medium text-slate-500'
          }`}>
            Task Board
          </span>
        </button>

        {/* Tab 4: Proactive */}
        <button
          onClick={() => setActiveTab('proactive')}
          className="flex flex-col items-center cursor-pointer transition-transform active:scale-95"
        >
          <div className={`px-4 py-1 rounded-full flex items-center justify-center ${
            activeTab === 'proactive' ? 'bg-[#C5E8DC]' : 'bg-transparent'
          }`}>
            <Zap className={`w-4 h-4 ${
              activeTab === 'proactive' ? 'text-[#0F5A47]' : 'text-slate-500'
            }`} />
          </div>
          <span className={`text-[10px] mt-0.5 ${
            activeTab === 'proactive' ? 'font-bold text-slate-900' : 'font-medium text-slate-500'
          }`}>
            Proactive ...
          </span>
        </button>

        {/* Tab 5: Lainnya */}
        <button
          onClick={() => setActiveTab('more')}
          className="flex flex-col items-center cursor-pointer transition-transform active:scale-95"
        >
          <div className={`px-4 py-1 rounded-full flex items-center justify-center ${
            activeTab === 'more' ? 'bg-[#C5E8DC]' : 'bg-transparent'
          }`}>
            <Menu className={`w-4 h-4 ${
              activeTab === 'more' ? 'text-[#0F5A47]' : 'text-slate-500'
            }`} />
          </div>
          <span className={`text-[10px] mt-0.5 ${
            activeTab === 'more' ? 'font-bold text-slate-900' : 'font-medium text-slate-500'
          }`}>
            Lainnya
          </span>
        </button>
      </div>

      {/* 9. Android Virtual Navigation Bar Buttons (Three bars, circle, triangle) */}
      <div className="bg-white py-1.5 flex items-center justify-around px-8 text-slate-400 text-xs shrink-0 border-t border-slate-100">
        <span className="font-bold tracking-widest text-[11px] text-slate-400">|||</span>
        <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-400" />
        <span className="text-[12px] font-bold text-slate-400">&#x25C0;</span>
      </div>
    </div>
  );
};
