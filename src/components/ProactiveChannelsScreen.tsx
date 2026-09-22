import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Bell,
  Sparkles,
  Shield,
  Smartphone,
  ExternalLink,
  Bot,
  Zap,
  ArrowLeft,
  X,
  Lock,
  ChevronRight,
  Flame
} from 'lucide-react';
import { TenantRegistrationResponse } from '../types';

interface ProactiveChannelsScreenProps {
  tenant: TenantRegistrationResponse | null;
  onBack: () => void;
}

export const ProactiveChannelsScreen: React.FC<ProactiveChannelsScreenProps> = ({
  tenant,
  onBack,
}) => {
  const tenantId = tenant?.tenant_id || 'tenant-alpha-001';
  const membershipId = tenant?.membership_id || tenant?.user_id || 'member-001';

  // Tabs: 'channels' | 'notifications' | 'logs'
  const [activeTab, setActiveTab] = useState<'channels' | 'notifications' | 'logs'>('channels');

  // WhatsApp State
  const [waPhone, setWaPhone] = useState('+628');
  const [waOtp, setWaOtp] = useState('');
  const [waOtpSent, setWaOtpSent] = useState(false);
  const [waVerified, setWaVerified] = useState(false);
  const [waLoading, setWaLoading] = useState(false);
  const [waMessage, setWaMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Telegram State
  const [tgDeeplink, setTgDeeplink] = useState<string | null>(null);
  const [tgVerifyCode, setTgVerifyCode] = useState<string | null>(null);
  const [tgVerified, setTgVerified] = useState(false);
  const [tgLoading, setTgLoading] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Logs & Scheduler State
  const [logs, setLogs] = useState<any[]>([]);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerResult, setSchedulerResult] = useState<any | null>(null);

  // Ask AI Modal State
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string; provider?: string; cost?: number }[]>([
    {
      role: 'assistant',
      content: 'Halo! Saya asisten kognitif cerdas OrchestreeAI. Ada yang dapat saya bantu mengenai operasional atau analisis tim Anda hari ini?',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Fetch Subscriptions & Notifications
  useEffect(() => {
    fetchSubscriptions();
    fetchNotifications();
    fetchLogs();
  }, [tenantId, membershipId]);

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch(`/api/v1/proactive/subscriptions?tenant_id=${tenantId}&membership_id=${membershipId}`);
      if (res.ok) {
        const data = await res.json();
        const subs = data.subscriptions || [];
        const wa = subs.find((s: any) => s.channel === 'whatsapp');
        if (wa && wa.verification_status === 'verified') {
          setWaVerified(true);
          setWaPhone(wa.destination_target || waPhone);
        }
        const tg = subs.find((s: any) => s.channel === 'telegram');
        if (tg && tg.verification_status === 'verified') {
          setTgVerified(true);
        }
      }
    } catch (e) {
      console.warn('Gagal memuat status langganan:', e);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`/api/v1/proactive/notifications?tenant_id=${tenantId}&membership_id=${membershipId}&unread_only=${unreadOnly}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (e) {
      console.warn('Gagal memuat notifikasi:', e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/v1/proactive/logs?tenant_id=${tenantId}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.warn('Gagal memuat logs audit:', e);
    }
  };

  // WhatsApp OTP Request
  const handleRequestWaOtp = async () => {
    if (!waPhone || waPhone.length < 9) {
      setWaMessage({ type: 'error', text: 'Format nomor WhatsApp tidak valid. Gunakan format E.164 (mis. +628...)' });
      return;
    }
    setWaLoading(true);
    setWaMessage(null);
    try {
      const res = await fetch('/api/v1/proactive/channels/whatsapp/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          membership_id: membershipId,
          phone_number: waPhone,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setWaOtpSent(true);
        setWaMessage({ type: 'success', text: 'Kode OTP 6 digit telah dikirimkan ke WhatsApp Anda.' });
      } else {
        setWaMessage({ type: 'error', text: data.error || 'Gagal mengirim OTP' });
      }
    } catch (err: any) {
      setWaMessage({ type: 'error', text: err.message });
    } finally {
      setWaLoading(false);
    }
  };

  // WhatsApp OTP Verification
  const handleVerifyWaOtp = async () => {
    if (!waOtp || waOtp.length !== 6) {
      setWaMessage({ type: 'error', text: 'Masukkan 6 digit kode OTP verifikasi.' });
      return;
    }
    setWaLoading(true);
    setWaMessage(null);
    try {
      const res = await fetch('/api/v1/proactive/channels/whatsapp/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          membership_id: membershipId,
          verification_code: waOtp,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setWaVerified(true);
        setWaOtpSent(false);
        setWaMessage({ type: 'success', text: 'Nomor WhatsApp berhasil terverifikasi! Pesan proaktif aktif.' });
        fetchSubscriptions();
      } else {
        setWaMessage({ type: 'error', text: data.error || 'Verifikasi OTP gagal' });
      }
    } catch (err: any) {
      setWaMessage({ type: 'error', text: err.message });
    } finally {
      setWaLoading(false);
    }
  };

  // Telegram Deep-link Request
  const handleGenerateTelegramLink = async () => {
    setTgLoading(true);
    try {
      const res = await fetch('/api/v1/proactive/channels/telegram/deeplink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          membership_id: membershipId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTgDeeplink(data.deeplink);
        setTgVerifyCode(data.verification_code);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTgLoading(false);
    }
  };

  // Trigger Scheduler Cycle
  const handleTriggerScheduler = async () => {
    setSchedulerLoading(true);
    try {
      const res = await fetch('/api/v1/proactive/scheduler/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setSchedulerResult(data.summary || data);
      fetchLogs();
    } catch (e) {
      console.error(e);
    } finally {
      setSchedulerLoading(false);
    }
  };

  // Mark all notifications read
  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/v1/proactive/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, membership_id: membershipId }),
      });
      fetchNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  // Ask AI SSE Streaming Handler
  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || isStreaming) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsStreaming(true);

    // Empty assistant message container for streaming
    setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/v1/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          membership_id: membershipId,
          message: userMsg,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Gagal menghubungi asisten AI');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let partialChunk = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partialChunk += decoder.decode(value, { stream: true });
        const lines = partialChunk.split('\n');
        partialChunk = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.event === 'token') {
                setChatMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: updated[lastIdx].content + parsed.token,
                  };
                  return updated;
                });
              } else if (parsed.event === 'done') {
                setChatMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    provider: parsed.provider,
                    cost: parsed.cost,
                  };
                  return updated;
                });
              } else if (parsed.event === 'error') {
                setChatMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: `[Error: ${parsed.error}]`,
                  };
                  return updated;
                });
              }
            } catch (err) {
              // Ignore partial JSON
            }
          }
        }
      }
    } catch (err: any) {
      setChatMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
          ...updated[lastIdx],
          content: `Terjadi kesalahan saat berkomunikasi: ${err.message}`,
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070D18] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <div className="border-b border-slate-800/80 bg-[#0B1426]/90 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali</span>
          </button>
          <span className="text-slate-700">/</span>
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">Kanal Komunikasi Proaktif & Ask AI</h1>
              <p className="text-[11px] text-slate-400">Meta WhatsApp Business, Telegram Bot & Asisten Kognitif</p>
            </div>
          </div>
        </div>

        {/* Quick Action: Ask AI Assistant */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsAskAiOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-300 hover:brightness-110 transition cursor-pointer"
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>Ask AI Assistant</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 flex-1 flex flex-col space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('channels')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition cursor-pointer ${
              activeTab === 'channels'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Integrasi Kanal (WhatsApp & Telegram)</span>
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition cursor-pointer ${
              activeTab === 'notifications'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Pusat Notifikasi In-App</span>
            {notifications.filter((n) => !n.is_read).length > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-[10px] font-bold text-slate-950 flex items-center justify-center">
                {notifications.filter((n) => !n.is_read).length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Scheduler & Audit Logs</span>
          </button>
        </div>

        {/* TAB 1: KANAL INTEGRASI WHATSAPP & TELEGRAM */}
        {activeTab === 'channels' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* KARTU 1: META WHATSAPP PROAKTIF */}
            <div className="p-6 rounded-2xl bg-[#0B1528] border border-slate-800/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">Meta WhatsApp Cloud API</h2>
                      <p className="text-xs text-slate-400">Nomor Resmi Platform OrchestreeAI</p>
                    </div>
                  </div>
                  {waVerified ? (
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Terverifikasi</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Belum Terhubung</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  Dapatkan ringkasan operasional harian (Morning Digest 08:00 WIB & Evening Summary 17:00 WIB) langsung ke nomor WhatsApp Anda dari staf AI organisasi.
                </p>

                {waMessage && (
                  <div
                    className={`p-3 rounded-xl mb-4 text-xs ${
                      waMessage.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border border-red-500/30 text-red-300'
                    }`}
                  >
                    {waMessage.text}
                  </div>
                )}

                {/* Form Input Nomor & Request OTP */}
                {!waVerified && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Nomor WhatsApp (E.164)
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={waPhone}
                          onChange={(e) => setWaPhone(e.target.value)}
                          placeholder="+628123456789" // allowlist: HTML input attribute
                          className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" // allowlist: Tailwind CSS placeholder utility class
                        />
                        <button
                          onClick={handleRequestWaOtp}
                          disabled={waLoading}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-xs font-semibold text-slate-950 transition cursor-pointer"
                        >
                          {waLoading ? 'Mengirim...' : 'Minta OTP'}
                        </button>
                      </div>
                    </div>

                    {waOtpSent && (
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <label className="block text-xs font-semibold text-slate-200">
                          Masukkan 6-Digit Kode Verifikasi OTP
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={waOtp}
                            onChange={(e) => setWaOtp(e.target.value)}
                            placeholder="123456" // allowlist: HTML input attribute
                            className="w-36 text-center tracking-widest font-mono text-sm px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={handleVerifyWaOtp}
                            disabled={waLoading}
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold text-slate-950 transition cursor-pointer"
                          >
                            Verifikasi & Aktifkan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Terverifikasi Info Card */}
                {waVerified && (
                  <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Nomor Terdaftar:</span>
                      <span className="font-mono text-emerald-400 font-semibold">{waPhone}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Jadwal Pengiriman:</span>
                      <span className="text-slate-200">08:00 & 17:00 WIB</span>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-start space-x-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>
                        Protokol Privasi: Balas <strong>STOP</strong> atau <strong>BERHENTI</strong> kapan saja untuk menjeda pesan otomatis.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>Webhook: /api/v1/webhooks/whatsapp</span>
                <span className="font-mono">Meta Graph API v21.0</span>
              </div>
            </div>

            {/* KARTU 2: TELEGRAM BOT INTEGRASI */}
            <div className="p-6 rounded-2xl bg-[#0B1528] border border-slate-800/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                      <Send className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">Telegram Bot Platform</h2>
                      <p className="text-xs text-slate-400">Deep-link Verifikasi Instan</p>
                    </div>
                  </div>
                  {tgVerified ? (
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Terhubung</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-400">
                      Belum Terhubung
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  Tautkan akun Telegram Anda dengan bot resmi platform untuk menerima notifikasi, eskalasi tugas kritis, dan ringkasan kerja harian secara instan.
                </p>

                {/* Generate Deep-Link Section */}
                <div className="space-y-4">
                  {!tgDeeplink && (
                    <button
                      onClick={handleGenerateTelegramLink}
                      disabled={tgLoading}
                      className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-xs font-semibold text-white transition flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{tgLoading ? 'Membuat Tautan...' : 'Buat Tautan Verifikasi Telegram'}</span>
                    </button>
                  )}

                  {tgDeeplink && (
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                      <div className="text-xs font-semibold text-slate-200">
                        Langkah Verifikasi Bot Telegram:
                      </div>
                      <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside leading-relaxed">
                        <li>Buka tautan bot resmi di aplikasi Telegram Anda.</li>
                        <li>Tekan tombol <strong>Start</strong> di Telegram.</li>
                        <li>Akun akan otomatis terverifikasi tanpa login ulang.</li>
                      </ol>

                      <div className="pt-2 flex items-center space-x-2">
                        <a
                          href={tgDeeplink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-center text-xs font-semibold text-white flex items-center justify-center space-x-1.5 transition"
                        >
                          <span>Buka Telegram Bot</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono text-center">
                        Kode Verifikasi: {tgVerifyCode} (Berlaku 15 menit)
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>Webhook: /api/v1/webhooks/telegram-bot</span>
                <span className="font-mono">@OrchestreeAiBot</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: IN-APP NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div className="p-6 rounded-2xl bg-[#0B1528] border border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <Bell className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">Notifikasi In-App & Sistem</h2>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setUnreadOnly(!unreadOnly)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    unreadOnly
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {unreadOnly ? 'Hanya Belum Dibaca' : 'Semua Notifikasi'}
                </button>
                <button
                  onClick={handleMarkAllRead}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white transition cursor-pointer"
                >
                  Tandai Semua Dibaca
                </button>
              </div>
            </div>

            {notifications.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Tidak ada notifikasi saat ini.
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 rounded-xl border flex items-start justify-between transition ${
                      n.is_read
                        ? 'bg-slate-900/30 border-slate-800/50 text-slate-400'
                        : 'bg-slate-900 border-emerald-500/30 text-slate-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white">{n.title}</span>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase font-mono">
                          {n.category || 'sistem'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{n.body}</p>
                      <span className="text-[10px] text-slate-500 block">
                        {new Date(n.created_at).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SCHEDULER & AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            {/* Scheduler Status Banner */}
            <div className="p-6 rounded-2xl bg-[#0B1528] border border-slate-800/80 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400">
                  <Clock className="w-4 h-4" />
                  <span>Siklus Otomatis Proaktif (PRD v2.2 Bagian 10.6)</span>
                </div>
                <p className="text-xs text-slate-300">
                  Jendela pengiriman aktif: <strong>08:00 – 20:00 WIB</strong> (Anti-Spam Guard maksimal 3 pesan/hari per kanal).
                </p>
                {schedulerResult && (
                  <div className="text-xs text-emerald-300 mt-2 font-mono">
                    Siklus Terakhir: Dispatched {schedulerResult.messages_dispatched || 0} pesan dari {schedulerResult.total_subscriptions || 0} langganan aktif.
                  </div>
                )}
              </div>
              <button
                onClick={handleTriggerScheduler}
                disabled={schedulerLoading}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-xs font-semibold text-slate-950 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${schedulerLoading ? 'animate-spin' : ''}`} />
                <span>{schedulerLoading ? 'Menjalankan...' : 'Pemicu Siklus Manual'}</span>
              </button>
            </div>

            {/* Audit Logs Table */}
            <div className="p-6 rounded-2xl bg-[#0B1528] border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Log Riwayat Pengiriman Pesan Proaktif</h3>
                <span className="text-xs text-slate-400 font-mono">Database: proactive_message_logs</span>
              </div>

              {logs.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Belum ada catatan log pesan yang dikirimkan.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-3">Waktu</th>
                        <th className="py-2.5 px-3">Kanal</th>
                        <th className="py-2.5 px-3">Tujuan</th>
                        <th className="py-2.5 px-3">Tipe Pesan</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Isi Pesan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                            {new Date(log.created_at).toLocaleTimeString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 uppercase font-semibold text-slate-300 text-[11px]">
                            {log.channel || 'system'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                            {log.destination_target || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {log.message_type}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                log.delivery_status === 'delivered'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}
                            >
                              {log.delivery_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 max-w-xs truncate text-slate-400">
                            {log.content}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL / DRAWER: ASK AI ASSISTANT (SSE STREAMING) */}
      {isAskAiOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-[#0B1528] border-l border-slate-800 flex flex-col h-full shadow-2xl">
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0E1B33]">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Ask AI Assistant</h3>
                  <p className="text-[10px] text-emerald-400 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Real-time SSE Streaming</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAskAiOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    {msg.content || (isStreaming && idx === chatMessages.length - 1 ? (
                      <span className="flex items-center space-x-1 text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce delay-100" />
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce delay-200" />
                      </span>
                    ) : null)}
                  </div>
                  {msg.provider && (
                    <div className="mt-1 text-[10px] text-slate-500 font-mono">
                      Via {msg.provider} • Biaya: {msg.cost} CR
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Chat Input Bar */}
            <div className="p-4 border-t border-slate-800 bg-[#0E1B33]">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                  placeholder="Ketik pertanyaan untuk Ask AI..." // allowlist: HTML input attribute
                  disabled={isStreaming}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50" // allowlist: Tailwind CSS placeholder utility class
                />
                <button
                  onClick={handleSendChatMessage}
                  disabled={isStreaming || !chatInput.trim()}
                  className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 transition cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 text-center">
                Terhubung ke Multi-LLM Model Router (NVIDIA NIM, OpenRouter, Gemini).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
