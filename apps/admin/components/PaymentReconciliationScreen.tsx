'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  FileCheck2,
  FileX2,
  Building2,
  CreditCard,
  X,
  Sparkles,
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

export interface ReconciliationCase {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  tenant_legal_name?: string;
  order_id?: string;
  invoice_id?: string;
  order_number?: string;
  invoice_number?: string;
  order_amount?: number;
  invoice_amount?: number;
  gateway_reference_id: string;
  detected_status: 'success' | 'pending' | 'error_confirm';
  internal_status_before: string;
  gateway_status_latest?: string;
  resolution_status: 'open' | 'verified_matched' | 'verified_mismatch_escalated' | 'resolved' | 'rejected';
  resolved_by?: string;
  resolution_notes?: string;
  created_at: string;
  resolved_at?: string;
}

export interface ReconciliationMetrics {
  success: number;
  pending: number;
  error_confirm: number;
}

export function PaymentReconciliationScreen() {
  const [activeTab, setActiveTab] = useState<'error_confirm' | 'pending' | 'success'>('error_confirm');
  const [metrics, setMetrics] = useState<ReconciliationMetrics>({ success: 0, pending: 0, error_confirm: 0 });
  const [cases, setCases] = useState<ReconciliationCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Re-check loading state per case
  const [recheckingCaseId, setRecheckingCaseId] = useState<string | null>(null);

  // Manual review modal
  const [reviewCase, setReviewCase] = useState<ReconciliationCase | null>(null);
  const [manualStatus, setManualStatus] = useState<'resolved' | 'rejected'>('resolved');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // Auto-detection state
  const [detecting, setDetecting] = useState<boolean>(false);
  const [detectionReport, setDetectionReport] = useState<any | null>(null);

  const getHeaders = () => ({ 'Content-Type': 'application/json' });

  const fetchCasesData = async (tabToFetch: 'error_confirm' | 'pending' | 'success') => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/billing/admin/reconciliation/cases?tab=${tabToFetch}`, {
        headers: getHeaders(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal memuat data rekonsiliasi gateway.');
      }
      const data = await res.json();
      setMetrics(data.counts || { success: 0, pending: 0, error_confirm: 0 });
      setCases(data.cases || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat memuat transaksi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCasesData(activeTab);
  }, [activeTab]);

  const handleRecheckGateway = async (caseItem: ReconciliationCase) => {
    setRecheckingCaseId(caseItem.id);
    setActionSuccess(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/billing/admin/reconciliation/cases/${caseItem.id}/recheck`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal memeriksa ulang transaksi ke gateway.');
      }
      const resData = await res.json();
      setActionSuccess(
        `Hasil cek ulang referensi ${caseItem.gateway_reference_id}: Status Gateway '${resData.gateway_status}', Resolusi '${resData.resolution_status}'.`
      );
      // Refresh list & metrics
      await fetchCasesData(activeTab);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengeksekusi cek ulang status gateway.');
    } finally {
      setRecheckingCaseId(null);
    }
  };

  const handleTriggerAutoDetect = async () => {
    setDetecting(true);
    setActionSuccess(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/billing/admin/reconciliation/detect', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ threshold_minutes: 15 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal menjalankan pemindaian otomatis.');
      }
      const data = await res.json();
      setDetectionReport(data.report);
      setActionSuccess(
        `Pemindaian selesai: ${data.report?.detected_cases || 0} kasus terdeteksi, ${data.report?.auto_resolved_cases || 0} otomatis diaktifkan hak layanannya.`
      );
      await fetchCasesData(activeTab);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menjalankan pemindaian rekonsiliasi otomatis.');
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmitManualReview = async () => {
    if (!reviewCase) return;
    if (!resolutionNotes || resolutionNotes.trim().length < 5) {
      setErrorMessage('Catatan verifikasi manual wajib diisi dengan bukti valid minimal 5 karakter.');
      return;
    }
    setIsSubmittingReview(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/billing/admin/reconciliation/cases/${reviewCase.id}/resolve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resolution_status: manualStatus,
          resolution_notes: resolutionNotes.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal menyimpan penyelesaian manual.');
      }
      setActionSuccess(
        `Kasus ${reviewCase.gateway_reference_id} berhasil diselesaikan dengan keputusan '${manualStatus}'. Hak layanan diperbarui.`
      );
      setReviewCase(null);
      setResolutionNotes('');
      await fetchCasesData(activeTab);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses penyelesaian manual.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const filteredCases = cases.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.gateway_reference_id?.toLowerCase().includes(term) ||
      c.tenant_name?.toLowerCase().includes(term) ||
      c.tenant_legal_name?.toLowerCase().includes(term) ||
      c.order_number?.toLowerCase().includes(term) ||
      c.invoice_number?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 text-white font-sans">
      {/* Top Banner with Real Metrics */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0B1220] via-[#0E1726] to-[#0B1220] border border-slate-800 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                Pusat Rekonsiliasi Gateway
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400 font-mono">Verifikasi Langsung ke Midtrans</span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>Rekonsiliasi Pembayaran & Audit Webhook</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Memvalidasi kebenaran status transaksi tertunda langsung ke sumber resmi Midtrans. Mengaktifkan hak paket dan saldo kredit secara aman tanpa duplikasi alur eksekusi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTriggerAutoDetect}
              disabled={detecting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 border border-emerald-500/40 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${detecting ? 'animate-spin' : ''}`} />
              <span>{detecting ? 'Memindai Gateway...' : 'Jalankan Deteksi Otomatis'}</span>
            </button>
            <button
              onClick={() => fetchCasesData(activeTab)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>
          </div>
        </div>

        {/* 3 Real Counter Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div
            onClick={() => setActiveTab('error_confirm')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'error_confirm'
                ? 'bg-amber-950/30 border-amber-500/60 shadow-lg shadow-amber-950/20'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                Error Konfirmasi & Perlu Review
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-white font-mono">
              {metrics.error_confirm}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Kasus klaim atau ketidakcocokan webhook yang memerlukan audit.
            </p>
          </div>

          <div
            onClick={() => setActiveTab('pending')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-sky-950/30 border-sky-500/60 shadow-lg shadow-sky-950/20'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-sky-300 uppercase tracking-wider">
                Menunggu Pembayaran (Pending)
              </span>
              <Clock className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-white font-mono">
              {metrics.pending}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Faktur dan pesanan aktif dalam batas waktu pelunasan.
            </p>
          </div>

          <div
            onClick={() => setActiveTab('success')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'success'
                ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg shadow-emerald-950/20'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                Berhasil & Selesai (Lunas)
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-white font-mono">
              {metrics.success}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Total transaksi dengan pembayaran sah dan hak layanan aktif.
            </p>
          </div>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-[#0B1220] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              {activeTab === 'error_confirm' && 'Daftar Kasus Error Konfirmasi & Tertunda'}
              {activeTab === 'pending' && 'Daftar Transaksi Sedang Menunggu Pembayaran'}
              {activeTab === 'success' && 'Daftar Transaksi Berhasil Diselesaikan'}
            </span>
            <span className="text-xs text-slate-500 font-mono">({filteredCases.length} rekaman)</span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari referensi, nomor faktur, tenant..." // allowlist: standard HTML input guidance
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" // allowlist: standard tailwind styling
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8">
            <SkeletonLoader variant="table" count={5} />
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="py-16 px-4">
            <EmptyState
              id="reconciliation-empty"
              icon={CheckCircle2}
              title={
                activeTab === 'error_confirm'
                  ? 'Tidak Ada Kasus Error Konfirmasi Aktif'
                  : activeTab === 'pending'
                  ? 'Tidak Ada Transaksi Tertunda'
                  : 'Belum Ada Transaksi Tercatat'
              }
              description={
                activeTab === 'error_confirm'
                  ? 'Seluruh pembayaran terverifikasi serasi antara gateway Midtrans dan basis data operasional.'
                  : 'Tidak ditemukan transaksi yang sedang menunggu konfirmasi pembayaran pada filter ini.'
              }
              actionLabel="Jalankan Deteksi Ulang"
              onAction={handleTriggerAutoDetect}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Referensi Gateway</th>
                  <th className="py-3 px-4 font-semibold">Organisasi (Tenant)</th>
                  <th className="py-3 px-4 font-semibold">Nominal</th>
                  <th className="py-3 px-4 font-semibold">Status Internal</th>
                  <th className="py-3 px-4 font-semibold">Status Gateway Terkini</th>
                  <th className="py-3 px-4 font-semibold">Resolusi</th>
                  <th className="py-3 px-4 font-semibold">Waktu Pembuatan</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi Tindak Lanjut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredCases.map((c) => {
                  const amount = c.invoice_amount || c.order_amount || 0;
                  const isRechecking = recheckingCaseId === c.id;

                  return (
                    <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{c.gateway_reference_id}</span>
                        </div>
                        <span className="text-[10px] font-sans text-slate-400 block font-normal mt-0.5">
                          {c.invoice_number ? `Faktur: ${c.invoice_number}` : c.order_number ? `Pesanan: ${c.order_number}` : 'Gateway ID'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-white font-medium">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate max-w-[150px]">{c.tenant_name || c.tenant_legal_name || 'Organisasi Terdaftar'}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono block">
                          {c.tenant_id ? `${c.tenant_id.slice(0, 8)}...` : '-'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                        {amount > 0 ? `Rp ${Number(amount).toLocaleString('id-ID')}` : '-'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                          {c.internal_status_before}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            c.gateway_status_latest === 'settlement' || c.gateway_status_latest === 'capture'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : c.gateway_status_latest === 'pending'
                              ? 'bg-sky-950 text-sky-400 border border-sky-800'
                              : c.gateway_status_latest
                              ? 'bg-red-950 text-red-400 border border-red-800'
                              : 'bg-slate-900 text-slate-500 border border-slate-800'
                          }`}
                        >
                          {c.gateway_status_latest || 'Belum Diperiksa'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            c.resolution_status === 'verified_matched'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : c.resolution_status === 'resolved'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                              : c.resolution_status === 'verified_mismatch_escalated'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                              : c.resolution_status === 'rejected'
                              ? 'bg-slate-800 text-slate-400 border border-slate-700'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {c.resolution_status === 'verified_matched' && <CheckCircle2 className="w-3 h-3" />}
                          {c.resolution_status === 'verified_mismatch_escalated' && <AlertTriangle className="w-3 h-3" />}
                          <span>
                            {c.resolution_status === 'verified_matched' && 'Serasi & Lunas'}
                            {c.resolution_status === 'open' && 'Terbuka'}
                            {c.resolution_status === 'verified_mismatch_escalated' && 'Perlu Review Manual'}
                            {c.resolution_status === 'resolved' && 'Disetujui Manual'}
                            {c.resolution_status === 'rejected' && 'Ditolak'}
                          </span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(c.created_at).toLocaleString('id-ID')}
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleRecheckGateway(c)}
                          disabled={isRechecking}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 hover:text-white border border-emerald-800/80 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRechecking ? 'animate-spin' : ''}`} />
                          <span>{isRechecking ? 'Memverifikasi...' : 'Cek Ulang Gateway'}</span>
                        </button>

                        {c.resolution_status === 'verified_mismatch_escalated' && (
                          <button
                            onClick={() => {
                              setReviewCase(c);
                              setManualStatus('resolved');
                              setResolutionNotes('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 hover:text-white border border-amber-800/80 text-[11px] font-semibold transition cursor-pointer"
                          >
                            <ShieldAlert className="w-3 h-3 text-amber-400" />
                            <span>Review Manual</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Review Modal for Escalated Mismatches */}
      {reviewCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0B1220] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in duration-150">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-800/60 flex items-center justify-center text-amber-300 font-bold">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Investigasi & Review Manual Super Admin</h3>
                  <p className="text-[11px] text-slate-400">Verifikasi klaim pembayaran dengan bukti transfer otentik</p>
                </div>
              </div>
              <button
                onClick={() => setReviewCase(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">ID Referensi Gateway:</span>
                  <span className="font-mono font-bold text-white">{reviewCase.gateway_reference_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nama Organisasi:</span>
                  <span className="font-semibold text-white">{reviewCase.tenant_name || reviewCase.tenant_legal_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nominal Tagihan:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    Rp {Number(reviewCase.invoice_amount || reviewCase.order_amount || 0).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status Gateway Terkini:</span>
                  <span className="font-semibold text-amber-400 uppercase">{reviewCase.gateway_status_latest || 'Tidak Lunas'}</span>
                </div>
              </div>

              {/* Warning Risk Tier High */}
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Tindakan Berisiko Tinggi (Audit Ledger Risk Tier HIGH)</span>
                </div>
                <p className="text-slate-300">
                  Keputusan penyelesaian manual akan mengaktifkan kuota paket dan saldo kredit organisasi. Catatan alasan serta identitas Anda akan direkam secara permanen dalam catatan audit keamanan.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Keputusan Resolusi
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setManualStatus('resolved')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition ${
                      manualStatus === 'resolved'
                        ? 'bg-blue-950/60 border-blue-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileCheck2 className={`w-4 h-4 ${manualStatus === 'resolved' ? 'text-blue-400' : 'text-slate-500'}`} />
                    <div>
                      <div className="font-bold">Setujui (Lunas)</div>
                      <div className="text-[10px] text-slate-400">Aktifkan hak layanan</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setManualStatus('rejected')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition ${
                      manualStatus === 'rejected'
                        ? 'bg-red-950/60 border-red-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileX2 className={`w-4 h-4 ${manualStatus === 'rejected' ? 'text-red-400' : 'text-slate-500'}`} />
                    <div>
                      <div className="font-bold">Tolak Klaim</div>
                      <div className="text-[10px] text-slate-400">Status tetap gagal</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Catatan Bukti Verifikasi Manual (Wajib)
                </label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Cantumkan nomor referensi mutasi bank, nama pengirim, atau bukti pendukung otentik..." // allowlist: standard HTML input guidance
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" // allowlist: standard tailwind styling
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setReviewCase(null)}
                disabled={isSubmittingReview}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitManualReview}
                disabled={isSubmittingReview || !resolutionNotes || resolutionNotes.trim().length < 5}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 border border-emerald-500/40 transition cursor-pointer disabled:opacity-50"
              >
                {isSubmittingReview ? 'Menyimpan...' : 'Terapkan Keputusan Resolusi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
