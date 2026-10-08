import { apiClient } from '@orchestree/api-client';
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, CheckCircle2, RotateCcw, XCircle, AlertTriangle, ShieldCheck, ArrowRight, RefreshCw, Eye } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader } from '@orchestree/ui';

interface MergeReviewItem {
  id: string;
  target_customer_id: string;
  source_customer_id: string;
  match_type: string;
  confidence_score: number;
  match_reasons: string[];
  status: string;
  created_at: string;
  target_name: string;
  target_phone: string | null;
  source_name: string;
  source_phone: string | null;
  snapshot_before_merge: {
    channel_type?: string;
    external_user_id?: string;
  };
}

interface CustomerMergeReviewScreenProps {
  tenantId: string;
}

export const CustomerMergeReviewScreen: React.FC<CustomerMergeReviewScreenProps> = ({ tenantId }) => {
  const [reviews, setReviews] = useState<MergeReviewItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED'>('PENDING');

  const fetchReviews = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/customers/merge-reviews?status=${activeTab}`);
      if (!res.ok) {
        throw new Error('Gagal memuat daftar peninjauan penggabungan profil pelanggan.');
      }
      const data = await res.json();
      setReviews(data);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeTab]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleApprove = async (logId: string) => {
    setActionLoading(logId);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/customers/merge-reviews/${logId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal menyetujui penggabungan');
      }
      // Refresh data
      fetchReviews();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async (logId: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan penggabungan profil pelanggan ini (rollback)?')) return;
    setActionLoading(logId);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/customers/merge-reviews/${logId}/rollback`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal membatalkan penggabungan');
      }
      fetchReviews();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Peninjauan Penggabungan Identitas Pelanggan (WEAK Match)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Mencegah penggabungan salah sasaran secara otomatis. Verifikasi profil yang memiliki kemiripan nama tanpa nomor terverifikasi.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('PENDING')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'PENDING'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Menunggu Verifikasi ({activeTab === 'PENDING' ? reviews.length : '...'})
          </button>
          <button
            onClick={() => setActiveTab('APPROVED')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'APPROVED'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Riwayat Disetujui (Dapat Di-Rollback)
          </button>
        </div>
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="p-8 bg-white rounded-2xl border border-slate-200/80 space-y-3">
          <SkeletonLoader className="h-4 w-3/4" />
          <SkeletonLoader className="h-4 w-1/2" />
          <SkeletonLoader className="h-4 w-5/6" />
        </div>
      ) : error ? (
        <div className="bg-white p-8 rounded-2xl border border-red-200">
          <ErrorState
            title="Gagal Mengambil Data Review"
            message={error}
            onRetry={fetchReviews}
          />
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200/80 text-center">
          <EmptyState
            title={activeTab === 'PENDING' ? 'Tidak Ada Antrian Review' : 'Belum Ada Riwayat Penggabungan'}
            description={
              activeTab === 'PENDING'
                ? 'Semua identitas pelanggan yang terdeteksi cocok dengan akurat atau telah disetujui secara tuntas.'
                : 'Belum ada profil yang digabungkan lewat mekanisme peninjauan manual.'
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((rev) => {
            const confidencePercent = Math.round(rev.confidence_score * 100);
            return (
              <div
                key={rev.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs transition-all hover:border-indigo-200"
              >
                {/* Top Badge bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Kemiripan Nama {confidencePercent}% (WEAK MATCH)
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      ID: {rev.id.slice(0, 8)}...
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Terdeteksi: {new Date(rev.created_at).toLocaleString('id-ID')}
                  </span>
                </div>

                {/* Side-by-Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-5">
                  {/* Sisi Kiri: Profil Baru / Kandidat Sementara */}
                  <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Profil Baru Masuk (Kandidat)</span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">
                        {rev.snapshot_before_merge.channel_type || 'Kanal'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-slate-500 block">Nama Tampilan:</span>
                        <span className="text-sm font-semibold text-slate-900">{rev.source_name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Nomor Telepon:</span>
                        <span className="text-xs font-mono text-slate-700">{rev.source_phone || 'Tidak tercantum'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Customer ID:</span>
                        <span className="text-[11px] font-mono text-slate-400">{rev.source_customer_id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sisi Kanan: Profil Eksisting Target */}
                  <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100">
                    <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Profil Terdaftar (Target Penggabungan)</span>
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-semibold">
                        Kanonik
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-indigo-500 block">Nama Terverifikasi:</span>
                        <span className="text-sm font-semibold text-slate-900">{rev.target_name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-indigo-500 block">Nomor Telepon Primer:</span>
                        <span className="text-xs font-mono text-slate-700">{rev.target_phone || 'Tidak tercantum'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-indigo-500 block">Customer ID:</span>
                        <span className="text-[11px] font-mono text-slate-400">{rev.target_customer_id}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alasan Deteksi */}
                <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3.5 mb-5">
                  <span className="text-xs font-semibold text-amber-900 block mb-1.5">
                    Faktor Kecurigaan Identitas:
                  </span>
                  <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                    {Array.isArray(rev.match_reasons) && rev.match_reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  {activeTab === 'PENDING' ? (
                    <>
                      <button
                        onClick={() => handleApprove(rev.id)}
                        disabled={actionLoading === rev.id}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all disabled:opacity-50"
                      >
                        {actionLoading === rev.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Setujui Penggabungan Profil
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleRollback(rev.id)}
                      disabled={actionLoading === rev.id}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all disabled:opacity-50"
                    >
                      {actionLoading === rev.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Batalkan Penggabungan (Rollback Reversibel)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
