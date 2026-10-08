'use client';

import { apiClient } from '@orchestree/api-client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2, Plus, QrCode, Power, ShieldAlert, CheckCircle2,
  Clock, AlertCircle, RefreshCw, Smartphone, Key
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader } from '@orchestree/ui';
import { QRConnectModal } from './QRConnectModal';

interface ChannelAccount {
  id: string;
  channel_type: string;
  connection_mode: string;
  account_label: string;
  external_identifier: string;
  status: 'PENDING_SETUP' | 'ACTIVE' | 'ERROR' | 'REVOKED' | 'SUSPENDED';
  requires_owner_approval: boolean;
  is_approved: boolean;
  created_at: string;
}

interface ChannelAccountsScreenProps {
  tenantId: string;
}

export const ChannelAccountsScreen: React.FC<ChannelAccountsScreenProps> = ({ tenantId }) => {
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form tambah akun
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [accountLabel, setAccountLabel] = useState<string>('');
  const [channelType, setChannelType] = useState<string>('telegram_mtproto');
  const [connectionMode, setConnectionMode] = useState<string>('mtproto_qr');
  const [externalIdentifier, setExternalIdentifier] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Modal QR connect
  const [selectedCaId, setSelectedCaId] = useState<string>('');
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [isQrOpen, setIsQrOpen] = useState<boolean>(false);

  const fetchAccounts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/channel-accounts`);
      if (!res.ok) throw new Error('Gagal mengambil daftar akun kanal');
      const data = await res.json();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountLabel || !externalIdentifier) return;
    setSubmitting(true);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/channel-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_label: accountLabel,
          channel_type: channelType,
          connection_mode: connectionMode,
          external_identifier: externalIdentifier,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal mendaftarkan akun');
      }
      const newAcc = await res.json();
      setShowAddForm(false);
      setAccountLabel('');
      setExternalIdentifier('');
      fetchAccounts();

      // Jika MTProto QR, langsung buka modal QR
      if (channelType === 'telegram_mtproto') {
        setSelectedCaId(newAcc.id);
        setSelectedLabel(newAcc.account_label);
        setIsQrOpen(true);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeSession = async (caId: string, label: string) => {
    if (!confirm(`Apakah Anda yakin ingin memutuskan sesi Telegram untuk '${label}' secara resmi (auth.logOut)?`)) {
      return;
    }
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/channel-accounts/${caId}/qr-session`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Gagal mencabut sesi Telegram');
      fetchAccounts();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Share2 className="w-5 h-5 text-indigo-600" />
            Manajemen Akun Kanal & Gateway
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Koneksi resmi Kategori A (WhatsApp Cloud API) dan Kategori B (Telegram MTProto QR Session).
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
        >
          <Plus className="w-4 h-4" />
          Tambah Akun Kanal
        </button>
      </div>

      {/* Form Tambah Akun Kanal */}
      {showAddForm && (
        <form
          onSubmit={handleCreateAccount}
          className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm space-y-4 animate-in fade-in duration-200"
        >
          <h3 className="text-sm font-bold text-slate-900">Registrasi Akun Kanal Organisasi</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Label Akun (cth: Layanan Pelanggan Utama)
              </label>
              <input
                type="text"
                required
                value={accountLabel}
                onChange={(e) => setAccountLabel(e.target.value)}
                aria-label="Nama identitas akun"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tipe Kanal & Mode
              </label>
              <select
                value={channelType}
                onChange={(e) => {
                  setChannelType(e.target.value);
                  if (e.target.value === 'telegram_mtproto') {
                    setConnectionMode('mtproto_qr');
                  } else {
                    setConnectionMode('official_business_api');
                  }
                }}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900"
              >
                <option value="telegram_mtproto">Telegram Pribadi/Bisnis (MTProto QR Code)</option>
                <option value="whatsapp_cloud">WhatsApp Business Cloud API (Official)</option>
                <option value="instagram">Instagram Direct (OAuth)</option>
                <option value="tiktok">TikTok Messaging</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor Telepon atau ID Akun
              </label>
              <input
                type="text"
                required
                value={externalIdentifier}
                onChange={(e) => setExternalIdentifier(e.target.value)}
                aria-label="Nomor telepon atau ID akun"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs disabled:opacity-50"
            >
              {submitting ? 'Mendaftarkan...' : 'Daftarkan Akun'}
            </button>
          </div>
        </form>
      )}

      {/* List Akun */}
      {loading ? (
        <div className="p-8 bg-white rounded-2xl border border-slate-200/80 space-y-3">
          <SkeletonLoader className="h-4 w-3/4" />
          <SkeletonLoader className="h-4 w-1/2" />
          <SkeletonLoader className="h-4 w-5/6" />
        </div>
      ) : error ? (
        <div className="p-8 bg-white rounded-2xl border border-red-200">
          <ErrorState title="Gagal Memuat Akun" message={error} onRetry={fetchAccounts} />
        </div>
      ) : accounts.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200/80 text-center">
          <EmptyState
            title="Belum Ada Akun Kanal Terhubung"
            description="Tambahkan akun Telegram MTProto atau WhatsApp Cloud API untuk mulai menerima dan membalas pesan pelanggan."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => {
            const isMtproto = acc.channel_type === 'telegram_mtproto';
            const isActive = acc.status === 'ACTIVE';

            return (
              <div
                key={acc.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        {acc.account_label}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            isMtproto
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isMtproto ? 'Telegram MTProto' : 'WhatsApp Cloud API'}
                        </span>
                      </h4>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">
                        {acc.external_identifier}
                      </p>
                    </div>

                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : acc.status === 'PENDING_SETUP'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {isActive && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                      {acc.status === 'PENDING_SETUP' && <Clock className="w-3 h-3 text-amber-600" />}
                      {acc.status}
                    </span>
                  </div>

                  {acc.requires_owner_approval && !acc.is_approved && (
                    <div className="mt-2 text-[11px] bg-amber-50 text-amber-800 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                      <span>Menunggu persetujuan Owner organisasi untuk aktivasi.</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">
                    Mode: {acc.connection_mode}
                  </span>

                  <div className="flex items-center gap-2">
                    {isMtproto && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedCaId(acc.id);
                            setSelectedLabel(acc.account_label);
                            setIsQrOpen(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Pindai QR</span>
                        </button>

                        {isActive && (
                          <button
                            onClick={() => handleRevokeSession(acc.id, acc.account_label)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                            title="Putuskan sesi Telegram resmi (auth.logOut)"
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>Putuskan</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR Connect Modal */}
      <QRConnectModal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        tenantId={tenantId}
        channelAccountId={selectedCaId}
        accountLabel={selectedLabel}
        onSuccess={() => fetchAccounts()}
      />
    </div>
  );
};
