import React, { useState } from 'react';
import {
  MessageSquare,
  Send,
  Check,
  CheckCheck,
  Smartphone,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Users2,
  Workflow,
  Share2,
  Lock,
  Zap,
  Clock,
  ChevronRight,
  User,
  Bot,
} from 'lucide-react';

export const HumanAiCollaborationSection: React.FC = () => {
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'telegram' | 'slack'>('whatsapp');
  const [userChatInput, setUserChatInput] = useState('');
  const [messages, setMessages] = useState<{ sender: 'human' | 'ai'; text: string; time: string; status?: string }[]>([
    {
      sender: 'human',
      text: '@SalesAI tolong buatkan draft penawaran paket 50 license untuk PT Surya Nusantara dengan diskon enterprise 12%.',
      time: '10:14 WIB',
    },
    {
      sender: 'ai',
      text: 'Draft penawaran PT Surya Nusantara selesai disusun berdasarkan katalog Company Brain v2. Total nilai kontrak: Rp 176.000.000 (setelah diskon 12% sesuai batas wewenang). Lampiran PDF siap dikirim.',
      time: '10:15 WIB',
      status: 'WAITING_APPROVAL',
    },
  ]);
  const [isSimulatingReply, setIsSimulatingReply] = useState(false);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userChatInput.trim()) return;

    const newMsg = {
      sender: 'human' as const,
      text: userChatInput,
      time: '10:16 WIB',
    };
    setMessages((prev) => [...prev, newMsg]);
    setUserChatInput('');
    setIsSimulatingReply(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Instruksi diterima dan sedang dieksekusi oleh Staf AI terkait. Task terdaftar di Trello & laporan siap dalam 30 detik.`,
          time: '10:16 WIB',
          status: 'COMPLETED',
        },
      ]);
      setIsSimulatingReply(false);
    }, 1000);
  };

  const workflowSteps = [
    { step: '01', title: 'Human Staff', desc: 'Memberikan instruksi bahasa natural', icon: Users2, color: 'text-[#1976E8]' },
    { step: '02', title: 'Chat / Workspace', desc: 'WhatsApp, Telegram, Slack, Trello', icon: MessageSquare, color: 'text-[#08B85C]' },
    { step: '03', title: 'OrchestreeAI', desc: 'Routing, Company Brain & PDP Policy', icon: Sparkles, color: 'text-[#16B7D9]' },
    { step: '04', title: 'AI Agent Specialist', desc: 'Eksekusi tools resmi & sintesis kerja', icon: Bot, color: 'text-purple-400' },
    { step: '05', title: 'Human Review Gate', desc: 'Persetujuan manajer sebelum rilis', icon: ShieldCheck, color: 'text-amber-400' },
    { step: '06', title: 'Verified Outcome', desc: 'Hasil kerja nyata tersimpan di sistem', icon: Zap, color: 'text-[#08B85C]' },
  ];

  return (
    <section id="collaboration" className="py-24 bg-gradient-to-b from-[#071226] via-[#0B1835] to-[#071226] text-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4">
            <Users2 className="w-3.5 h-3.5" />
            <span>HUMAN + AI COLLABORATION SYNERGY</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            AI Tidak Menggantikan Workforce Anda{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#08B85C] to-[#16B7D9]">
              AI Memperkuat Workforce Anda
            </span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Karyawan asli perusahaan Anda tidak perlu mempelajari coding rumit atau prompt rumit. Cukup berkomunikasi via WhatsApp, Telegram, atau Slack seperti biasa — AI Agent mengeksekusi di belakang layar
          </p>
        </div>

        {/* 6-Step Visual Collaboration Flow Pipeline */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {workflowSteps.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 relative text-center space-y-2 hover:bg-white/[0.06] transition-all group"
              >
                <div className="text-[10px] font-mono font-bold text-slate-500">{s.step}</div>
                <div className="w-10 h-10 mx-auto rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <h4 className="text-xs font-bold text-white">{s.title}</h4>
                <p className="text-[10px] text-slate-400 leading-snug">{s.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Interactive Chat & Gateway Simulation */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Description & Supported Channels */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#08B85C]">
                Real-Time Communication Fabric
              </span>
              <h3 className="text-2xl font-bold text-white">
                Workforce Anda Tetap Terhubung di Mana Pun Mereka Bekerja
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Staf penjualan di lapangan mengirim voice-note via WhatsApp, AI merangkum data prospek ke CRM. Tim marketing me-review copy di Telegram, desainer meng-approve visual di Slack
              </p>
            </div>

            {/* Channel Selector Buttons */}
            <div className="space-y-2.5">
              <button
                onClick={() => setActiveChannel('whatsapp')}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  activeChannel === 'whatsapp'
                    ? 'bg-[#08B85C]/15 border-[#08B85C] shadow-md shadow-[#08B85C]/10'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-[#08B85C]/20 text-[#08B85C] flex items-center justify-center font-bold text-sm">
                    WA
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">WhatsApp Gateway</div>
                    <div className="text-[11px] text-slate-400">Instruksi chat & voice note 2-arah</div>
                  </div>
                </div>
                <span className="text-xs font-mono text-[#08B85C] font-semibold">Aktif</span>
              </button>

              <button
                onClick={() => setActiveChannel('telegram')}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  activeChannel === 'telegram'
                    ? 'bg-[#16B7D9]/15 border-[#16B7D9] shadow-md shadow-[#16B7D9]/10'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-[#16B7D9]/20 text-[#16B7D9] flex items-center justify-center font-bold text-sm">
                    TG
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Telegram Enterprise Bot</div>
                    <div className="text-[11px] text-slate-400">Notifikasi alert & approval cepat</div>
                  </div>
                </div>
                <span className="text-xs font-mono text-[#16B7D9] font-semibold">Aktif</span>
              </button>

              <button
                onClick={() => setActiveChannel('slack')}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  activeChannel === 'slack'
                    ? 'bg-purple-500/15 border-purple-500 shadow-md shadow-purple-500/10'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-sm">
                    SL
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Slack Workspace App</div>
                    <div className="text-[11px] text-slate-400">Kolaborasi antar channel divisi</div>
                  </div>
                </div>
                <span className="text-xs font-mono text-purple-300 font-semibold">Aktif</span>
              </button>
            </div>
          </div>

          {/* Right Live Phone / Chat Mockup */}
          <div className="lg:col-span-7">
            <div className="max-w-md mx-auto rounded-[32px] border-4 border-slate-700 bg-[#071226] shadow-2xl p-4 sm:p-5 relative overflow-hidden">
              {/* Phone Top Notch */}
              <div className="w-28 h-4 bg-slate-800 rounded-full mx-auto mb-4" />

              {/* Chat Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#08B85C] to-[#1976E8] flex items-center justify-center text-white text-xs font-bold">
                    OA
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">OrchestreeAI Assistant</div>
                    <div className="text-[10px] text-[#08B85C] flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#08B85C]" />
                      <span>Online • Connected to Company Brain</span>
                    </div>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-300 font-mono">
                  {activeChannel.toUpperCase()}
                </span>
              </div>

              {/* Chat Thread Messages */}
              <div className="py-4 space-y-3 min-h-[260px] max-h-[320px] overflow-y-auto pr-1">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${m.sender === 'human' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs ${
                        m.sender === 'human'
                          ? 'bg-[#1976E8] text-white rounded-br-none'
                          : 'bg-white/10 text-slate-200 rounded-bl-none border border-white/10'
                      }`}
                    >
                      <p className="leading-relaxed">{m.text}</p>

                      {m.status === 'WAITING_APPROVAL' && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-amber-300 font-medium">⚠️ Menunggu Approval Manajer</span>
                          <button
                            onClick={() => {
                              setMessages((prev) => [
                                ...prev,
                                {
                                  sender: 'ai',
                                  text: '✅ Persetujuan manajer terkonfirmasi via WhatsApp! PDF resmi telah dikirim ke klien & CRM diperbarui.',
                                  time: '10:16 WIB',
                                  status: 'APPROVED',
                                },
                              ]);
                            }}
                            className="px-2 py-0.5 rounded bg-[#08B85C] text-white text-[10px] font-bold hover:brightness-110 cursor-pointer"
                          >
                            Setujui (1-Click)
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 flex items-center space-x-1 px-1">
                      <span>{m.time}</span>
                      {m.sender === 'human' && <CheckCheck className="w-3 h-3 text-[#16B7D9]" />}
                    </span>
                  </div>
                ))}

                {isSimulatingReply && (
                  <div className="flex items-center space-x-2 text-xs text-slate-400 p-2">
                    <span className="w-2 h-2 rounded-full bg-[#08B85C] animate-bounce" />
                    <span>AI Agent sedang memproses Company Brain...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Box */}
              <form onSubmit={handleSendChat} className="pt-3 border-t border-white/10 flex items-center gap-2">
                <input
                  type="text"
                  value={userChatInput}
                  onChange={(e) => setUserChatInput(e.target.value)}
                  placeholder="Ketik instruksi tugas ke AI..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#08B85C]"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-[#08B85C] text-white hover:brightness-110 transition-all cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
