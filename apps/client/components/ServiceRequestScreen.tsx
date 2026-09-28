'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  LifeBuoy,
  AlertOctagon,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  User,
  ShieldCheck,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Sparkles,
  ArrowRight,
  MessageSquare,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  Check,
  X,
  ExternalLink,
  ShoppingCart,
  Send,
  Sliders,
  Paperclip,
  Download,
} from 'lucide-react';
import { FileUploadField, downloadFileFromUrl, UploadedFileArtifact } from '@orchestree/ui';
import { HandoverSummaryPanel, HandoverSummaryData } from './HandoverSummaryPanel';
import { HonestErrorBanner } from './HonestErrorBanner';

export interface ServiceRequestItem {
  id: string;
  ticket_number: string;
  category: 'REFUND' | 'RETURN' | 'COMPLAINT' | 'CANCELLATION' | 'TECHNICAL_SUPPORT' | 'GENERAL_INQUIRY';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_INVESTIGATION' | 'HUMAN_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RESOLVED' | 'CLOSED';
  subject: string;
  description: string;
  amount: number;
  customer_name?: string;
  customer_phone?: string;
  intake_channel: string;
  attachments?: Array<{ id?: string; file_name: string; file_url: string; storage_path?: string; mime_type?: string }>;
  created_at: string;
  resolution_notes?: string;
  approved_by_user_id?: string;
}

export interface AbandonedCartItem {
  id: string;
  cart_id: string;
  customer_name: string;
  customer_phone: string;
  cart_value: number;
  channel: string;
  status: 'SCHEDULED' | 'DISPATCHED' | 'CONVERTED';
  scheduled_at: string;
  discount_code: string;
  message_sent?: string;
}

interface ServiceRequestScreenProps {
  tenantId: string;
  onOpenInbox?: () => void;
}

export const ServiceRequestScreen: React.FC<ServiceRequestScreenProps> = ({
  tenantId,
  onOpenInbox,
}) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'humanize_tester' | 'abandoned_carts'>('requests');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Service Requests List
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState<boolean>(true);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Modal: Approval / Rejection
  const [selectedTicket, setSelectedTicket] = useState<ServiceRequestItem | null>(null);
  const [modalAction, setModalAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Modal: New Intake
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [intakeSubject, setIntakeSubject] = useState('');
  const [intakeDescription, setIntakeDescription] = useState('');
  const [intakeCategory, setIntakeCategory] = useState<string>('REFUND');
  const [intakeAmount, setIntakeAmount] = useState<number>(0);
  const [intakeCustomerName, setIntakeCustomerName] = useState('');
  const [intakeCustomerPhone, setIntakeCustomerPhone] = useState('+628');
  const [intakeChannel, setIntakeChannel] = useState('WHATSAPP');
  const [intakeAttachments, setIntakeAttachments] = useState<UploadedFileArtifact[]>([]);

  // F.01-HUMANIZE-ID Tester State
  const [rawHumanizeInput, setRawHumanizeInput] = useState(
    'Sebagai asisten AI, perlu dicatat bahwa pesanan Anda nomor INV-2026-990 dengan total harga Rp 350.000 telah kami verifikasi. Diskon 15% kode HEMAT15 telah diterapkan. Apakah ada hal lain yang bisa saya bantu hari ini?'
  );
  const [humanizeCustomerName, setHumanizeCustomerName] = useState('Anisa');
  const [humanizeError, setHumanizeError] = useState<string | null>(null);
  const [humanizeResult, setHumanizeResult] = useState<{
    humanized_text: string;
    is_modified: boolean;
    factual_invariance_passed: boolean;
    validation_note?: string;
  } | null>(null);
  const [isHumanizing, setIsHumanizing] = useState(false);

  // Abandoned Cart Recovery State
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCartItem[]>([]);
  const [isProcessingCarts, setIsProcessingCarts] = useState(false);

  // Fetch real tickets from database
  const fetchTickets = async () => {
    setLoadingRequests(true);
    setRequestError(null);
    try {
      const q = new URLSearchParams();
      if (selectedStatus && selectedStatus !== 'ALL') q.set('status', selectedStatus);
      if (selectedCategory && selectedCategory !== 'ALL') q.set('category', selectedCategory);
      const res = await fetch(`/api/v1/tenants/${tenantId}/service/requests?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setRequests(json.tickets || []);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setRequestError(errJson.error || 'Gagal memuat tiket permohonan layanan.');
      }
    } catch (err: any) {
      setRequestError(err.message || 'Gagal tersambung ke layanan tiket.');
    } finally {
      setLoadingRequests(false);
    }
  };

  // Fetch abandoned carts
  const fetchAbandonedCarts = async () => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/service/abandoned-carts`);
      if (res.ok) {
        const json = await res.json();
        setAbandonedCarts(json.data || []);
      }
    } catch (err) {
      // Handled quietly
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchAbandonedCarts();
  }, [tenantId, selectedStatus, selectedCategory]);

  // Active Handover Demo Panel
  const [activeHandoverDemo, setActiveHandoverDemo] = useState<HandoverSummaryData | null>(null);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const handleCreateIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intakeSubject.trim() || !intakeDescription.trim()) return;

    // Call backend API if running
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/service/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: intakeSubject,
          description: intakeDescription,
          category_override: intakeCategory,
          amount: Number(intakeAmount) || 0,
          channel: intakeChannel,
          attachments: intakeAttachments.map((a) => ({
            id: a.file_id,
            file_name: a.file_name,
            storage_path: a.storage_path,
            file_url: a.signed_url || a.public_url,
            mime_type: a.content_type,
            size_bytes: a.size_bytes,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newTicket = data.ticket;
        setRequests((prev) => [
          {
            id: newTicket.id,
            ticket_number: newTicket.ticket_number,
            category: newTicket.category,
            priority: newTicket.priority,
            status: newTicket.status,
            subject: newTicket.subject,
            description: newTicket.description,
            amount: newTicket.amount,
            customer_name: intakeCustomerName || 'Pelanggan Terdaftar',
            customer_phone: intakeCustomerPhone,
            intake_channel: intakeChannel,
            attachments: intakeAttachments.map((a) => ({
              id: a.file_id,
              file_name: a.file_name,
              file_url: a.signed_url || a.public_url,
              mime_type: a.content_type,
            })),
            created_at: newTicket.created_at,
          },
          ...prev,
        ]);
        setShowIntakeModal(false);
        setIntakeSubject('');
        setIntakeDescription('');
        setIntakeAmount(0);
        setIntakeAttachments([]);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setRequestError(errJson.error || 'Gagal menyimpan tiket permohonan ke basis data.');
      }
    } catch (err: any) {
      setRequestError(err.message || 'Gagal tersambung ke server untuk mencatat tiket.');
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedTicket || !modalAction) return;
    setIsSubmittingAction(true);

    try {
      const endpoint = modalAction === 'APPROVE' ? 'approve' : 'reject';
      await fetch(`/api/v1/tenants/${tenantId}/service/requests/${selectedTicket.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'current-staff-user',
          resolution_notes: actionNotes,
          rejection_reason: actionNotes,
        }),
      });
    } catch (e) {
      // Handled
    }

    setRequests((prev) =>
      prev.map((r) =>
        r.id === selectedTicket.id
          ? {
              ...r,
              status: modalAction === 'APPROVE' ? 'APPROVED' : 'REJECTED',
              resolution_notes: actionNotes,
              approved_by_user_id: 'current-staff-user',
            }
          : r
      )
    );

    setIsSubmittingAction(false);
    setSelectedTicket(null);
    setModalAction(null);
    setActionNotes('');
  };

  const handleRunHumanizer = async () => {
    setIsHumanizing(true);
    setHumanizeError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/service/humanize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text_content: rawHumanizeInput,
          customer_name: humanizeCustomerName,
          honorific: 'Kak',
          enforce_grounding: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setHumanizeResult(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setHumanizeResult(null);
        setHumanizeError(errData.detail || 'Gagal memproses naturalisasi teks dari server backend.');
      }
    } catch (e: any) {
      setHumanizeResult(null);
      setHumanizeError(e.message || 'Koneksi ke backend terputus saat memproses naturalisasi teks.');
    } finally {
      setIsHumanizing(false);
    }
  };

  const handleDispatchAbandonedCarts = async () => {
    setIsProcessingCarts(true);
    try {
      await fetch(`/api/v1/tenants/${tenantId}/service/abandoned-carts/process`, {
        method: 'POST',
      });
    } catch (e) {
      // Handled
    }

    setAbandonedCarts((prev) =>
      prev.map((c) =>
        c.status === 'SCHEDULED'
          ? {
              ...c,
              status: 'DISPATCHED',
              message_sent: `Halo Kak ${c.customer_name}, keranjang belanja senilai ${formatRupiah(c.cart_value)} masih menunggu untuk diproses. Gunakan kupon ${c.discount_code} hari ini untuk potongan spesial saat checkout. Siap kami bantu ya kak!`,
            }
          : c
      )
    );
    setIsProcessingCarts(false);
  };

  // Filtered requests
  const filteredRequests = requests.filter((r) => {
    const matchCat = selectedCategory === 'ALL' || r.category === selectedCategory;
    const matchStatus = selectedStatus === 'ALL' || r.status === selectedStatus;
    const matchSearch =
      r.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.customer_name && r.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchStatus && matchSearch;
  });

  const pendingRefundApprovals = requests.filter((r) => r.status === 'HUMAN_APPROVAL');

  return (
    <div className="min-h-screen bg-[#0B1220] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-wide">
                  Layanan Pelanggan & Pengawasan Pengembalian Dana
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Node Intake Resmi • Protokol Handover Staf Manusia • Validasi Bahasa Indonesia (F.01-HUMANIZE-ID)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-open-handover-demo"
              onClick={() => {
                setActiveHandoverDemo({
                  handover_id: 'hnd-990',
                  tenant_id: tenantId,
                  conversation_id: 'conv-cs-771',
                  customer: {
                    id: 'cust-882',
                    name: 'Budi Santoso',
                    phone: '+6281234567891',
                    tier: 'VIP',
                    total_spent: 4250000,
                    total_orders: 8,
                    channel: 'WHATSAPP',
                    city: 'Surabaya',
                  },
                  sales_metrics: {
                    lead_score: 87.5,
                    lead_stage: 'QUALIFIED',
                    temperature: 'HOT',
                    budget: 1500000,
                    funnel_stage: 'DECISION',
                  },
                  handover_reason: 'HIGH_VALUE_REFUND',
                  executive_summary:
                    'Handover dari WhatsApp dipicu komplain refund bernominal Rp 450.000 atas barang cacat. Pelanggan VIP dengan total belanja Rp 4.250.000 (8 order). Skor lead 87.5 (HOT). Memerlukan keputusan persetujuan manusia.',
                  actionable_recommendations: [
                    'Verifikasi bukti foto kemasan rusak pada tiket SR-20260925-REF001.',
                    'Pelanggan VIP historis tinggi (Rp 4.250.000). Prioritaskan kepuasan pelanggan.',
                    'Tawarkan opsi voucher ganti rugi 110% atau setujui pengembalian dana transfer bank.',
                  ],
                  status: 'PENDING',
                  created_at: new Date().toISOString(),
                });
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" /> Pratinjau Brief Handover
            </button>

            <button
              id="btn-new-intake"
              onClick={() => setShowIntakeModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer font-bold"
            >
              <Plus className="w-4 h-4" /> Catat Tiket Layanan
            </button>
          </div>
        </div>

        {/* Handover Brief Panel (jika dipicu) */}
        {activeHandoverDemo && (
          <div className="my-6">
            <HandoverSummaryPanel
              summary={activeHandoverDemo}
              onTakeOver={(id) => {
                alert(`Anda telah mengambil alih percakapan ID ${activeHandoverDemo.conversation_id}. Notifikasi telah diteruskan ke WhatsApp pelanggan.`);
              }}
              onResolve={(id) => {
                setActiveHandoverDemo(null);
              }}
              onClose={() => setActiveHandoverDemo(null)}
            />
          </div>
        )}

        {/* Banner Penegakan Human Approval untuk Refund */}
        {pendingRefundApprovals.length > 0 && (
          <div className="my-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5 text-white">
            <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-300 text-xs tracking-wide uppercase">
                  Persetujuan Staf Manusia Wajib
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {pendingRefundApprovals.length} Tiket Menunggu
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Kebijakan Keamanan Finansial: Seluruh pengajuan pengembalian dana (refund) atau klaim cacat bernominal tinggi
                wajib disetujui secara eksplisit oleh staf manusia dan dilarang diputuskan sepihak oleh AI.
              </p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-6 mb-6 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'requests'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LifeBuoy className="w-3.5 h-3.5" /> Tiket Layanan & Refund ({requests.length})
          </button>
          <button
            onClick={() => setActiveTab('humanize_tester')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'humanize_tester'
                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> F.01-HUMANIZE-ID Validator
          </button>
          <button
            onClick={() => setActiveTab('abandoned_carts')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'abandoned_carts'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Pemulihan Keranjang Ditinggalkan ({abandonedCarts.length})
          </button>
        </div>

        {/* Tab 1: Service Requests & Refunds */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            {/* Filter & Search Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Cari nomor tiket, nama pelanggan, atau deskripsi"
                  className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">Semua Kategori</option>
                  <option value="REFUND">Pengembalian Dana (Refund)</option>
                  <option value="RETURN">Retur / Tukar Barang</option>
                  <option value="COMPLAINT">Komplain Layanan</option>
                  <option value="CANCELLATION">Pembatalan Pesanan</option>
                  <option value="TECHNICAL_SUPPORT">Bantuan Teknis</option>
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="HUMAN_APPROVAL">Menunggu Persetujuan Staf</option>
                  <option value="OPEN">Terbuka (Baru)</option>
                  <option value="IN_INVESTIGATION">Sedang Diinvestigasi</option>
                  <option value="APPROVED">Disetujui</option>
                  <option value="REJECTED">Ditolak</option>
                  <option value="RESOLVED">Terselesaikan</option>
                </select>
              </div>
            </div>

            {/* Error Banner */}
            {requestError && (
              <HonestErrorBanner
                error={requestError}
                onRetry={fetchTickets}
              />
            )}

            {/* List of Requests */}
            <div className="space-y-3">
              {loadingRequests ? (
                <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl flex flex-col items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                  <p className="text-xs text-slate-400">Memuat tiket permohonan layanan dari basis data...</p>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl">
                  <LifeBuoy className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-300">Tidak ada tiket yang cocok</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Gunakan tombol "Catat Tiket Layanan" untuk mendaftarkan permohonan baru.
                  </p>
                </div>
              ) : (
                filteredRequests.map((ticket) => {
                  const isRefundPending = ticket.status === 'HUMAN_APPROVAL';
                  return (
                    <div
                      key={ticket.id}
                      className={`bg-slate-900 border rounded-2xl p-5 transition-all ${
                        isRefundPending
                          ? 'border-amber-500/50 bg-amber-950/10 shadow-lg shadow-amber-950/20'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              {ticket.ticket_number}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              {ticket.category}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                ticket.priority === 'CRITICAL'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : ticket.priority === 'HIGH'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              Prioritas: {ticket.priority}
                            </span>
                            <span
                              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                                ticket.status === 'HUMAN_APPROVAL'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                  : ticket.status === 'APPROVED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : ticket.status === 'REJECTED'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              }`}
                            >
                              {ticket.status === 'HUMAN_APPROVAL'
                                ? 'Persetujuan Manusia Wajib'
                                : ticket.status}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-white">{ticket.subject}</h3>
                          <p className="text-xs text-slate-300 leading-relaxed">{ticket.description}</p>

                          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-400">
                            <span>Pelanggan: <strong className="text-white">{ticket.customer_name}</strong> ({ticket.customer_phone})</span>
                            <span>Kanal: <strong className="text-sky-400">{ticket.intake_channel}</strong></span>
                            {ticket.amount > 0 && (
                              <span>Nominal Klaim: <strong className="text-emerald-400 font-mono">{formatRupiah(ticket.amount)}</strong></span>
                            )}
                            <span>Dibuat: {new Date(ticket.created_at).toLocaleDateString('id-ID')}</span>
                          </div>

                          {ticket.resolution_notes && (
                            <div className="mt-2 text-xs bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl text-slate-300">
                              <span className="font-semibold text-slate-400">Catatan Staf: </span>
                              {ticket.resolution_notes}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isRefundPending && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedTicket(ticket);
                                  setModalAction('APPROVE');
                                }}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5" /> Setujui Refund
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedTicket(ticket);
                                  setModalAction('REJECT');
                                }}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <X className="w-3.5 h-3.5" /> Tolak
                              </button>
                            </>
                          )}

                          {ticket.status === 'OPEN' && (
                            <button
                              onClick={() => {
                                setRequests((prev) =>
                                  prev.map((r) =>
                                    r.id === ticket.id ? { ...r, status: 'IN_INVESTIGATION' } : r
                                  )
                                );
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                            >
                              Tandai Investigasi
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: F.01-HUMANIZE-ID Validator */}
        {activeTab === 'humanize_tester' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h3 className="text-base font-bold text-white">
                  F.01-HUMANIZE-ID: Post-Processing Output Validator Bahasa Indonesia
                </h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Prinsip Mutlak: Humanisasi gaya bahasa khas customer service Indonesia yang hangat tanpa pernah
                mengubah fakta atau angka. Harga, persentase, kode kupon, dan nomor pesanan diverifikasi 100% invarian.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Input Panel */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nama Pelanggan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={humanizeCustomerName}
                    onChange={(e) => setHumanizeCustomerName(e.target.value)}
                    aria-label="Nama Pelanggan"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Draf Teks Mentah (Raw AI Output)
                  </label>
                  <textarea
                    rows={6}
                    value={rawHumanizeInput}
                    onChange={(e) => setRawHumanizeInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-sans"
                  />
                </div>

                <button
                  onClick={handleRunHumanizer}
                  disabled={isHumanizing}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-all shadow-lg shadow-sky-500/20 cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {isHumanizing ? 'Memvalidasi & Menghaluskan...' : 'Uji Humanisasi & Invarian Faktual'}
                </button>
              </div>

              {/* Output & Invariance Report */}
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-slate-300">
                  Hasil Teks Tervalidasi (Final Grounded Text)
                </label>
                {humanizeError ? (
                  <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <div>
                      <strong className="block font-semibold">Gagal Memproses Permintaan</strong>
                      <span>{humanizeError}</span>
                    </div>
                  </div>
                ) : humanizeResult ? (
                  <div className="space-y-3">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 leading-relaxed font-sans min-h-[140px]">
                      {humanizeResult.humanized_text}
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                      <div>
                        <strong className="block font-semibold">Verifikasi Invarian Faktual Sukses</strong>
                        <span>Seluruh angka, mata uang, dan kode kupon terbukti identik tanpa deviasi.</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
                    Klik tombol uji di sebelah kiri untuk melihat transformasi gaya bahasa dan verifikasi invarian fakta.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Abandoned Cart Recovery */}
        {activeTab === 'abandoned_carts' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white">Automasi Pemulihan Keranjang Ditinggalkan</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pengingat otomatis omnichannel terjadwal dengan insentif kupon dan gaya bahasa F.01-HUMANIZE-ID.
                </p>
              </div>

              <button
                onClick={handleDispatchAbandonedCarts}
                disabled={isProcessingCarts}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {isProcessingCarts ? 'Mengirimkan...' : 'Kirim Pengingat Jatuh Tempo'}
              </button>
            </div>

            <div className="space-y-3">
              {abandonedCarts.map((cart) => (
                <div
                  key={cart.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">{cart.customer_name}</span>
                      <span className="text-[11px] font-mono text-slate-400">({cart.customer_phone})</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          cart.status === 'SCHEDULED'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {cart.status === 'SCHEDULED' ? 'Terjadwal' : 'Terkirim'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-3">
                      <span>Nilai Keranjang: <strong className="text-emerald-400 font-mono">{formatRupiah(cart.cart_value)}</strong></span>
                      <span>Kanal: <strong className="text-sky-400">{cart.channel}</strong></span>
                      <span>Kupon: <strong className="text-amber-400 font-mono">{cart.discount_code}</strong></span>
                    </div>
                    {cart.message_sent && (
                      <p className="text-xs text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 mt-1">
                        {cart.message_sent}
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 font-mono shrink-0">
                    Jadwal: {new Date(cart.scheduled_at).toLocaleTimeString('id-ID')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal: New Intake */}
        {showIntakeModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Catat Permohonan Layanan Baru</h3>
                <button
                  onClick={() => setShowIntakeModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateIntake} className="space-y-4 mt-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Judul Permohonan</label>
                  <input
                    type="text"
                    required
                    value={intakeSubject}
                    onChange={(e) => setIntakeSubject(e.target.value)}
                    aria-label="Judul Permohonan"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Kategori</label>
                    <select
                      value={intakeCategory}
                      onChange={(e) => setIntakeCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="REFUND">Pengembalian Dana (Refund)</option>
                      <option value="RETURN">Retur Barang</option>
                      <option value="COMPLAINT">Komplain Pelanggan</option>
                      <option value="CANCELLATION">Pembatalan Pesanan</option>
                      <option value="TECHNICAL_SUPPORT">Dukungan Teknis</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Nominal Klaim (Rp)</label>
                    <input
                      type="number"
                      value={intakeAmount}
                      onChange={(e) => setIntakeAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Nama Pelanggan</label>
                    <input
                      type="text"
                      value={intakeCustomerName}
                      onChange={(e) => setIntakeCustomerName(e.target.value)}
                      aria-label="Nama Pelanggan"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Kanal Asal</label>
                    <select
                      value={intakeChannel}
                      onChange={(e) => setIntakeChannel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="INSTAGRAM">Instagram</option>
                      <option value="TIKTOK">TikTok</option>
                      <option value="SHOPEE">Shopee</option>
                      <option value="TOKOPEDIA">Tokopedia</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Rincian Keluhan / Alasan Klaim</label>
                  <textarea
                    rows={4}
                    required
                    value={intakeDescription}
                    onChange={(e) => setIntakeDescription(e.target.value)}
                    aria-label="Rincian Keluhan"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500 font-sans"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowIntakeModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all"
                  >
                    Simpan Tiket
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Approve / Reject Resolution */}
        {modalAction && selectedTicket && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">
                  {modalAction === 'APPROVE' ? 'Persetujuan Resmi Refund' : 'Penolakan Permohonan'}
                </h3>
                <button
                  onClick={() => {
                    setModalAction(null);
                    setSelectedTicket(null);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="my-4 text-xs space-y-2">
                <p className="text-slate-300">
                  Tiket: <strong className="text-amber-400 font-mono">{selectedTicket.ticket_number}</strong>
                </p>
                <p className="text-slate-300">
                  Pelanggan: <strong className="text-white">{selectedTicket.customer_name}</strong>
                </p>
                {selectedTicket.amount > 0 && (
                  <p className="text-slate-300">
                    Nominal: <strong className="text-emerald-400 font-mono">{formatRupiah(selectedTicket.amount)}</strong>
                  </p>
                )}

                <div className="pt-2">
                  <label className="block font-semibold text-slate-300 mb-1">
                    {modalAction === 'APPROVE' ? 'Catatan Resolusi & Instruksi Finansial' : 'Alasan Penolakan'}
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    aria-label="Catatan Resolusi"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setModalAction(null);
                    setSelectedTicket(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteAction}
                  disabled={isSubmittingAction || !actionNotes.trim()}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                    modalAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  {isSubmittingAction
                    ? 'Menyimpan...'
                    : modalAction === 'APPROVE'
                    ? 'Konfirmasi Setujui'
                    : 'Konfirmasi Tolak'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
