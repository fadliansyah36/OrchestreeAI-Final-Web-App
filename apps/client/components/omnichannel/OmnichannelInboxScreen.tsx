import { apiClient } from '@orchestree/api-client';
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, Send, Bot, User, Phone, CheckCheck, Clock,
  RefreshCw, Plus, ShieldCheck, Zap, AlertCircle, QrCode
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader } from '@orchestree/ui';
import { QRConnectModal } from './QRConnectModal';

interface Conversation {
  id: string;
  status: string;
  assigned_type: 'AI' | 'HUMAN';
  last_message_preview: string;
  last_message_at: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  avatar_url: string | null;
  channel_account_id: string;
  account_label: string;
  channel_type: 'telegram_mtproto' | 'whatsapp_cloud' | string;
}

interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender_type: 'CUSTOMER' | 'AI_AGENT' | 'HUMAN_STAFF' | 'SYSTEM';
  sender_identifier?: string;
  content_text: string;
  delivery_status: string;
  created_at: string;
}

interface OmnichannelInboxScreenProps {
  tenantId: string;
  onOpenConnectModal?: () => void;
}

export const OmnichannelInboxScreen: React.FC<OmnichannelInboxScreenProps> = ({
  tenantId,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState<boolean>(true);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [filterChannel, setFilterChannel] = useState<string>('ALL');

  // Anti-Flood Guard state
  const [antiFloodWait, setAntiFloodWait] = useState<number>(0);
  const [lastSentTime, setLastSentTime] = useState<number>(0);

  // Modal QR connect
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [targetChannelAccountId, setTargetChannelAccountId] = useState<string>('');
  const [targetAccountLabel, setTargetAccountLabel] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Ambil daftar percakapan
  const fetchConversations = useCallback(async () => {
    if (!tenantId) return;
    try {
      let url = `/api/v1/tenants/${tenantId}/conversations`;
      if (filterChannel !== 'ALL') {
        url += `?channel_type=${filterChannel}`;
      }
      const res = await apiClient.fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data);
      if (data.length > 0 && !selectedConvId) {
        setSelectedConvId(data[0].id);
      }
    } catch {
      // Background polling silent fail
    } finally {
      setLoadingConvs(false);
    }
  }, [tenantId, filterChannel, selectedConvId]);

  useEffect(() => {
    fetchConversations();
    // Realtime polling interval (2.5s) sebagai fallback channel Supabase
    const timer = setInterval(fetchConversations, 3000);
    return () => clearInterval(timer);
  }, [fetchConversations]);

  // 2. Ambil riwayat pesan saat percakapan dipilih
  const fetchMessages = useCallback(async (convId: string) => {
    if (!tenantId || !convId) return;
    setLoadingMessages(true);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/conversations/${convId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data);
    } catch {
      // Error handled
    } finally {
      setLoadingMessages(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (selectedConvId) {
      fetchMessages(selectedConvId);
    }
  }, [selectedConvId, fetchMessages]);

  // Auto-scroll ke pesan terbaru
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Anti-Flood countdown loop
  useEffect(() => {
    if (antiFloodWait <= 0) return;
    const timer = setInterval(() => {
      setAntiFloodWait((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [antiFloodWait]);

  // 4. Kirim Pesan Keluar
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedConvId || sending) return;

    // Periksa anti-flood guard di sisi client
    const now = Date.now();
    const elapsed = (now - lastSentTime) / 1000;
    if (elapsed < 2.0 && lastSentTime !== 0) {
      setAntiFloodWait(Math.ceil(2.0 - elapsed));
      return;
    }

    setSending(true);
    const textToSend = inputText.trim();
    setInputText('');

    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_text: textToSend }),
      });

      if (res.status === 429) {
        const errData = await res.json();
        const waitSec = errData.detail?.wait_seconds || 2;
        setAntiFloodWait(Math.ceil(waitSec));
        setInputText(textToSend); // Kembalikan teks
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal mengirim pesan');
      }

      setLastSentTime(Date.now());
      // Refresh pesan segera
      fetchMessages(selectedConvId);
      fetchConversations();
    } catch (err: any) {
      alert(err.message);
      setInputText(textToSend);
    } finally {
      setSending(false);
    }
  };

  // 5. Toggle Handover (AI <-> Human)
  const handleToggleHandover = async (currentType: 'AI' | 'HUMAN') => {
    if (!selectedConvId) return;
    const nextType = currentType === 'AI' ? 'HUMAN' : 'AI';
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/conversations/${selectedConvId}/handover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_agent_type: nextType,
          handover_reason: nextType === 'HUMAN' ? 'Staf mengambil alih tanggapan obrolan' : 'Staf mengembalikan ke AI Agent Maya'
        }),
      });
      if (res.ok) {
        fetchConversations();
        fetchMessages(selectedConvId);
      }
    } catch {
      // Ignore error
    }
  };

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  return (
    <div className="flex flex-col lg:flex-row h-[780px] bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* 1. PANEL KIRI: DAFTAR PERCAKAPAN */}
      <div className="w-full lg:w-80 border-r border-slate-200/80 flex flex-col bg-slate-50/40">
        {/* Header Panel Kiri */}
        <div className="p-4 border-b border-slate-200/80 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              Kotak Masuk Omnichannel
            </h3>
            <button
              onClick={() => {
                // Cari channel account telegram yang pending atau buat baru
                setTargetChannelAccountId(selectedConv?.channel_account_id || '');
                setTargetAccountLabel('Akun Telegram Organisasi');
                setIsQrModalOpen(true);
              }}
              title="Tautkan Telegram MTProto"
              className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="text-[11px]">QR MTProto</span>
            </button>
          </div>

          {/* Filter Tab Kanal */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
            <button
              onClick={() => setFilterChannel('ALL')}
              className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${
                filterChannel === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterChannel('telegram_mtproto')}
              className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${
                filterChannel === 'telegram_mtproto' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Telegram
            </button>
            <button
              onClick={() => setFilterChannel('whatsapp_cloud')}
              className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${
                filterChannel === 'whatsapp_cloud' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              WhatsApp
            </button>
          </div>
        </div>

        {/* List Obrolan */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingConvs ? (
            <div className="p-4 space-y-3">
              <SkeletonLoader className="h-4 w-3/4" />
              <SkeletonLoader className="h-4 w-1/2" />
              <SkeletonLoader className="h-4 w-5/6" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Belum ada obrolan aktif pada kanal yang dipilih.
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = conv.id === selectedConvId;
              const isTelegram = conv.channel_type === 'telegram_mtproto';

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                    isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-100/60'
                  }`}
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                      {conv.customer_name?.charAt(0) || 'P'}
                    </div>
                    <span
                      className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white ${
                        isTelegram ? 'bg-blue-500' : 'bg-emerald-500'
                      }`}
                      title={isTelegram ? 'Telegram MTProto' : 'WhatsApp Cloud API'}
                    >
                      {isTelegram ? 'T' : 'W'}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {conv.customer_name}
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {conv.last_message_preview || 'Percakapan baru dimulai'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                          conv.assigned_type === 'AI'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {conv.assigned_type === 'AI' ? 'AI Maya' : 'Staf Manusia'}
                      </span>
                      <span className="text-[9px] text-slate-400 truncate">
                        {conv.account_label}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. PANEL TENGAH: THREAD CHAT TERPILIH */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col bg-white">
          {/* Header Percakapan */}
          <div className="px-6 py-3.5 border-b border-slate-200/80 flex items-center justify-between bg-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs">
                {selectedConv.customer_name?.charAt(0) || 'P'}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  {selectedConv.customer_name}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      selectedConv.channel_type === 'telegram_mtproto'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {selectedConv.channel_type === 'telegram_mtproto' ? 'Telegram MTProto' : 'WhatsApp Cloud API'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedConv.customer_phone || selectedConv.account_label}
                </p>
              </div>
            </div>

            {/* Handover Toggle Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleToggleHandover(selectedConv.assigned_type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                  selectedConv.assigned_type === 'AI'
                    ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                }`}
              >
                {selectedConv.assigned_type === 'AI' ? (
                  <>
                    <Bot className="w-3.5 h-3.5 text-purple-600" />
                    <span>Ditangani AI (Maya) — Ambil Alih</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 text-amber-600" />
                    <span>Staf Manusia — Serahkan ke AI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Area Riwayat Pesan */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
            {loadingMessages ? (
              <div className="space-y-3">
                <SkeletonLoader className="h-4 w-1/3" />
                <SkeletonLoader className="h-10 w-2/3" />
                <SkeletonLoader className="h-10 w-1/2 ml-auto" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">
                Belum ada pesan dalam percakapan ini.
              </div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === 'OUTBOUND';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs ${
                        isOutbound
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content_text}</p>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1 px-1">
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isOutbound && (
                        <CheckCheck className="w-3 h-3 text-indigo-500" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Pesan Keluar & Anti-Flood Bar */}
          <div className="p-4 border-t border-slate-200/80 bg-white">
            {/* Indikator Anti-Flood Guard */}
            {antiFloodWait > 0 && (
              <div className="mb-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 animate-pulse">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Pencegahan limit flood Telegram aktif. Harap tunggu <strong>{antiFloodWait} detik</strong> sebelum mengirim pesan berikutnya.</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={sending || antiFloodWait > 0}
                aria-label={
                  antiFloodWait > 0
                    ? `Menunggu jeda flood (${antiFloodWait}s)...`
                    : "Ketik pesan balasan resmi..."
                }
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending || antiFloodWait > 0}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-40"
              >
                {sending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Kirim</span>
              </button>
            </form>

            {/* Catatan Transparansi Biaya Kredit */}
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-500" />
                Pemotongan: {selectedConv.channel_type === 'telegram_mtproto' ? '0.05' : '0.10'} kredit terpadu per pesan
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Anti-Flood Guard Aktif
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 bg-slate-50/20 text-center">
          <EmptyState
            title="Pilih Percakapan"
            description="Pilih salah satu obrolan di panel kiri untuk melihat pesan masuk dan berinteraksi secara real-time."
          />
        </div>
      )}

      {/* MODAL QR MTPROTO */}
      <QRConnectModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        tenantId={tenantId}
        channelAccountId={targetChannelAccountId}
        accountLabel={targetAccountLabel}
        onSuccess={() => {
          fetchConversations();
        }}
      />
    </div>
  );
};
