'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { QrCode, RefreshCw, Smartphone, ShieldCheck, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface QRConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  channelAccountId: string;
  accountLabel: string;
  onSuccess: () => void;
}

export const QRConnectModal: React.FC<QRConnectModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  channelAccountId,
  accountLabel,
  onSuccess,
}) => {
  const [qrToken, setQrToken] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(35);
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'PENDING' | 'AUTHORIZING' | 'CONNECTED' | 'EXPIRED' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 1. Ambil / Generate QR Token Baru dari Backend (panggilan auth.exportLoginToken nyata ke server Telegram)
  const fetchQrSession = useCallback(async () => {
    if (!channelAccountId || !tenantId) return;
    setStatus('LOADING');
    setErrorMessage('');
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/channel-accounts/${channelAccountId}/qr-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal memicu pembuatan sesi QR');
      }
      const data = await res.json();
      setQrToken(data.qr_token || data.qr_url);
      setSecondsRemaining(data.expires_in_seconds || 35);
      setStatus('PENDING');
    } catch (err: any) {
      setErrorMessage(err.message || 'Koneksi ke backend gateway terputus');
      setStatus('ERROR');
    }
  }, [tenantId, channelAccountId]);

  // Inisialisasi saat modal terbuka
  useEffect(() => {
    if (isOpen) {
      fetchQrSession();
    } else {
      setStatus('IDLE');
      setQrToken('');
    }
  }, [isOpen, fetchQrSession]);

  // 2. Countdown Timer masa berlaku token
  useEffect(() => {
    if (status !== 'PENDING') return;
    if (secondsRemaining <= 0) {
      setStatus('EXPIRED');
      // Otomatis refresh saat masa berlaku habis
      fetchQrSession();
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [status, secondsRemaining, fetchQrSession]);

  // 3. Polling Status Pindaian setiap 2.5 detik (menunggu konfirmasi otorisasi nyata dari Telegram)
  useEffect(() => {
    if (status !== 'PENDING' && status !== 'AUTHORIZING') return;

    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/tenants/${tenantId}/channel-accounts/${channelAccountId}/qr-status`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'authorized') {
          setStatus('CONNECTED');
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1500);
        } else if (data.status === 'refreshed' && (data.new_qr_url || data.qr_token)) {
          // Token resmi diperbarui langsung dari server Telegram
          setQrToken(data.new_qr_url || data.qr_token);
          setSecondsRemaining(data.expires_in_seconds || 30);
          setStatus('PENDING');
        } else if (data.status === 'qr_expired') {
          setStatus('EXPIRED');
          fetchQrSession();
        }
      } catch {
        // Abaikan kegagalan poll sesaat pada jaringan transien
      }
    }, 2500);

    return () => clearInterval(pollTimer);
  }, [status, tenantId, channelAccountId, onSuccess, onClose, fetchQrSession]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Tautkan Telegram MTProto</h3>
              <p className="text-xs text-slate-500 font-mono">{accountLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Isi Modal */}
        <div className="p-6 flex flex-col items-center text-center">
          {/* Status Badge */}
          <div className="mb-4">
            {status === 'LOADING' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menyiapkan Sesi Telegram...
              </span>
            )}
            {status === 'PENDING' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                Menunggu Pindaian ({secondsRemaining}s)
              </span>
            )}
            {status === 'AUTHORIZING' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                Sedang Mengotorisasi...
              </span>
            )}
            {status === 'CONNECTED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Terhubung dengan Sukses!
              </span>
            )}
            {status === 'EXPIRED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Token Kadaluarsa — Memperbarui...
              </span>
            )}
            {status === 'ERROR' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                Gagal Membuat Sesi
              </span>
            )}
          </div>

          {/* Area QR Code Nyata dari Telegram tg://login?token=... */}
          <div className="relative mb-6 flex justify-center">
            {qrToken ? (
              <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-md">
                <QRCodeSVG
                  value={qrToken}
                  size={216}
                  level="M"
                  includeMargin={true}
                  className="rounded-xl"
                />
              </div>
            ) : (
              <div className="w-56 h-56 bg-slate-100 rounded-xl flex flex-col items-center justify-center gap-3 border border-dashed border-slate-300">
                <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                <span className="text-xs text-slate-500">Memuat kode QR resmi Telegram...</span>
              </div>
            )}

            {/* Overlay saat Kadaluarsa */}
            {status === 'EXPIRED' && (
              <div className="absolute inset-0 bg-white/85 backdrop-blur-[2px] rounded-xl flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                <span className="text-xs font-medium text-slate-800">Menyegarkan token QR resmi...</span>
              </div>
            )}
          </div>

          {/* Instruksi Langkah Pindaian untuk Staff */}
          <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-left mb-4">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              Langkah Menautkan Akun Telegram:
            </h4>
            <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Buka aplikasi <strong>Telegram</strong> di ponsel Anda.</li>
              <li>Masuk ke menu <strong>Pengaturan (Settings)</strong> &gt; <strong>Perangkat (Devices)</strong>.</li>
              <li>Pilih <strong>Tautkan Perangkat Desktop (Link Desktop Device)</strong>.</li>
              <li>Arahkan kamera ponsel Anda ke kode QR di atas.</li>
            </ol>
          </div>

          {/* Jaminan Enkripsi KMS */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Terenkripsi envelope KMS. Tidak ada kata sandi yang disimpan.</span>
          </div>

          {errorMessage && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 w-full">
              {errorMessage}
            </p>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={fetchQrSession}
            disabled={status === 'LOADING'}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 transition-colors font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === 'LOADING' ? 'animate-spin' : ''}`} />
            Perbarui Kode QR
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
