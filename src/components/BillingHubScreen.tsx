import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  Zap,
  Receipt,
  FileText,
  DollarSign,
  TrendingUp,
  ExternalLink,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';

interface WalletData {
  id: string;
  tenant_id: string;
  balance: number;
  reserved_balance: number;
  available_balance: number;
  low_balance_threshold: number;
  currency: string;
  auto_topup_enabled: boolean;
  auto_topup_amount: number;
  is_low_balance: boolean;
}

interface TransactionItem {
  id: string;
  transaction_type: 'topup' | 'reserved' | 'consumed' | 'refunded';
  amount: number;
  balance_after: number;
  reference_id: string;
  description: string;
  created_at: string;
}

interface InvoiceItem {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  payment_gateway: string;
  payment_reference?: string;
  payment_url?: string;
  items?: Array<{ name: string; price: number; quantity: number }>;
  created_at: string;
  paid_at?: string;
}

interface BillingHubScreenProps {
  tenantId: string;
  tenantName?: string;
  userRole?: string;
}

export function BillingHubScreen({
  tenantId,
  tenantName = 'Organisasi Aktif',
  userRole = 'TENANT_ADMIN',
}: BillingHubScreenProps) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'invoices'>('overview');

  // Top-Up Modal State
  const [isTopUpOpen, setIsTopUpOpen] = useState<boolean>(false);
  const [selectedPackage, setSelectedPackage] = useState<number>(500000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [selectedGateway, setSelectedGateway] = useState<'midtrans' | 'xendit'>('midtrans');
  const [topUpLoading, setTopUpLoading] = useState<boolean>(false);
  const [topUpSuccess, setTopUpSuccess] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Settlement Testing State
  const [settlingInvoiceNumber, setSettlingInvoiceNumber] = useState<string | null>(null);
  const [settleFeedback, setSettleFeedback] = useState<string | null>(null);

  const fetchBillingData = async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const headers: Record<string, string> = {
        'X-Tenant-Id': tenantId,
        'X-User-Roles': userRole,
      };

      const [wRes, tRes, iRes] = await Promise.all([
        fetch('/api/v1/billing/wallet', { headers }),
        fetch('/api/v1/billing/transactions', { headers }),
        fetch('/api/v1/billing/invoices', { headers }),
      ]);

      if (wRes.ok) {
        const wData = await wRes.json();
        setWallet(wData);
      }
      if (tRes.ok) {
        const tData = await tRes.json();
        setTransactions(tData);
      }
      if (iRes.ok) {
        const iData = await iRes.json();
        setInvoices(iData);
      }
    } catch (err: any) {
      console.error('Error fetching billing data:', err);
      setErrorMessage('Gagal memuat data dompet kredit. Pastikan koneksi server aktif.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, [tenantId]);

  const handleInitiateTopUp = async () => {
    setTopUpLoading(true);
    setErrorMessage(null);
    setTopUpSuccess(null);

    const amount = customAmount ? parseFloat(customAmount) : selectedPackage;
    if (isNaN(amount) || amount <= 0) {
      setErrorMessage('Nominal top-up harus lebih besar dari 0.');
      setTopUpLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/v1/billing/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
          'X-User-Roles': userRole,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          amount,
          payment_gateway: selectedGateway,
          package_name: `Top Up Kredit ${amount.toLocaleString('id-ID')} IDR`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Gagal membuat tagihan top-up.');
      }

      setTopUpSuccess(data);
      // Refresh billing data
      fetchBillingData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses tagihan.');
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleSettleSandboxInvoice = async (invoiceNumber: string) => {
    setSettlingInvoiceNumber(invoiceNumber);
    setSettleFeedback(null);
    try {
      const res = await fetch('/api/v1/billing/sandbox-settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
          'X-User-Roles': userRole,
        },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          payment_reference: `sandbox-ref-${Date.now().toString(36)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Gagal menyelesaikan pelunasan faktur.');
      }

      setSettleFeedback(`Faktur ${invoiceNumber} berhasil dilunasi. Saldo kredit telah ditambahkan ke dompet organisasi.`);
      fetchBillingData();
    } catch (err: any) {
      setSettleFeedback(`Gagal pelunasan: ${err.message}`);
    } finally {
      setSettlingInvoiceNumber(null);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'topup':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ArrowDownLeft className="w-3 h-3" /> Top Up Masuk
          </span>
        );
      case 'consumed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Zap className="w-3 h-3" /> Konsumsi Layanan
          </span>
        );
      case 'reserved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> Reservasi Sementara
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <RefreshCw className="w-3 h-3" /> Pengembalian Kredit
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {type}
          </span>
        );
    }
  };

  const getInvoiceBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Lunas
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> Menunggu Pembayaran
          </span>
        );
      case 'expired':
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" /> Kedaluwarsa
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Pusat Kredit & Keuangan Organisasi
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pengelolaan saldo pemakaian model cerdas, perkakas otomatisasi, dan faktur resmi {tenantName}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBillingData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Perbarui Data
          </button>

          <button
            onClick={() => {
              setIsTopUpOpen(true);
              setTopUpSuccess(null);
              setErrorMessage(null);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Top Up Saldo Kredit
          </button>
        </div>
      </div>

      {settleFeedback && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{settleFeedback}</span>
          </div>
          <button
            onClick={() => setSettleFeedback(null)}
            className="text-xs text-emerald-400 hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Wallet Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Available Balance Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
            <span>Saldo Kredit Tersedia</span>
            <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {wallet ? formatCurrency(wallet.available_balance) : 'Rp 0'}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs">
            {wallet?.is_low_balance ? (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> Saldo mendekati batas minimum
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> Kapasitas pemakaian optimal
              </span>
            )}
          </div>
        </div>

        {/* Reserved Balance Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
            <span>Kredit Sedang Direservasi</span>
            <span className="p-1 rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {wallet ? formatCurrency(wallet.reserved_balance) : 'Rp 0'}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Saldo: {wallet ? formatCurrency(wallet.balance) : 'Rp 0'}</span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Dalam proses eksekusi</span>
          </div>
        </div>

        {/* Auto Top-Up & SLA Policy Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
            <span>Kebijakan Batas Minimum</span>
            <span className="p-1 rounded-lg bg-blue-500/10 text-blue-400">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">
            {wallet ? formatCurrency(wallet.low_balance_threshold) : 'Rp 50.000'}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Notifikasi peringatan akan dikirimkan otomatis ketika saldo mencapai ambang batas minimum.
          </p>
          <div className="mt-3 text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Proteksi saldo negatif aktif (Row-Level Locking)
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Ringkasan Mutasi Terkini
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'transactions'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Buku Besar Transaksi ({transactions.length})
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'invoices'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Riwayat Tagihan & Faktur ({invoices.length})
        </button>
      </div>

      {/* Tab Content: Overview & Transactions Table */}
      {(activeTab === 'overview' || activeTab === 'transactions') && (
        <div className="bg-white dark:bg-[#0E1726] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Buku Besar Pemakaian & Penambahan Kredit
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pencatatan mutasi kredit transparan dengan penomoran referensi dan saldo penutup
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              Total Entri: {transactions.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Waktu Transaksi</th>
                  <th className="py-3 px-4 font-semibold">Tipe Mutasi</th>
                  <th className="py-3 px-4 font-semibold">Deskripsi / Layanan</th>
                  <th className="py-3 px-4 font-semibold">Referensi</th>
                  <th className="py-3 px-4 font-semibold text-right">Nominal</th>
                  <th className="py-3 px-4 font-semibold text-right">Saldo Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                      Belum ada transaksi mutasi tercatat pada organisasi ini.
                    </td>
                  </tr>
                ) : (
                  transactions.slice(0, activeTab === 'overview' ? 10 : 50).map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(tx.created_at)}
                      </td>
                      <td className="py-3 px-4">{getTransactionBadge(tx.transaction_type)}</td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium">
                        {tx.description}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {tx.reference_id || '-'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold whitespace-nowrap ${
                          tx.amount >= 0 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {tx.amount > 0 ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(tx.balance_after)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Invoices Table */}
      {activeTab === 'invoices' && (
        <div className="bg-white dark:bg-[#0E1726] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Daftar Tagihan & Faktur Pembayaran
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Faktur resmi pembayaran top up kredit via payment gateway berizin resmi
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              Total Faktur: {invoices.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Nomor Faktur</th>
                  <th className="py-3 px-4 font-semibold">Tanggal Terbit</th>
                  <th className="py-3 px-4 font-semibold">Gateway</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Nominal</th>
                  <th className="py-3 px-4 font-semibold text-center">Aksi / Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                      Belum ada faktur tagihan yang diterbitkan.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(inv.created_at)}
                      </td>
                      <td className="py-3 px-4 uppercase font-semibold text-[11px] text-slate-600 dark:text-slate-300">
                        {inv.payment_gateway}
                      </td>
                      <td className="py-3 px-4">{getInvoiceBadge(inv.status)}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          {inv.status === 'pending' && (
                            <>
                              {inv.payment_url && (
                                <a
                                  href={inv.payment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors"
                                >
                                  Bayar Sekarang <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              <button
                                onClick={() => handleSettleSandboxInvoice(inv.invoice_number)}
                                disabled={settlingInvoiceNumber === inv.invoice_number}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-colors cursor-pointer"
                                title="Verifikasi pelunasan langsung untuk environment sandbox"
                              >
                                {settlingInvoiceNumber === inv.invoice_number ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" /> Memproses...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" /> Lunaskan di Sandbox
                                  </>
                                )}
                              </button>
                            </>
                          )}
                          {inv.status === 'paid' && (
                            <span className="text-[11px] text-emerald-400 font-medium">
                              Lunas pada {inv.paid_at ? formatDate(inv.paid_at) : '-'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Up Modal Drawer */}
      {isTopUpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Top Up Saldo Kredit Organisasi
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Kredit langsung aktif untuk eksekusi workflow cerdas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTopUpOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {topUpSuccess ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    Faktur Berhasil Dibuat!
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Nomor Faktur: <span className="font-mono font-semibold">{topUpSuccess.invoice_number}</span>
                  </p>
                  <p className="text-sm font-extrabold text-emerald-400 mt-2">
                    {formatCurrency(topUpSuccess.amount)}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-left space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gateway:</span>
                    <span className="font-semibold uppercase text-slate-200">{topUpSuccess.payment_gateway}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="text-amber-400 font-semibold uppercase">{topUpSuccess.status}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  {topUpSuccess.payment_url && (
                    <a
                      href={topUpSuccess.payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      Buka Halaman Pembayaran Gateway <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  <button
                    onClick={() => {
                      handleSettleSandboxInvoice(topUpSuccess.invoice_number);
                      setIsTopUpOpen(false);
                    }}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Lunaskan Langsung di Sandbox
                  </button>

                  <button
                    onClick={() => setIsTopUpOpen(false)}
                    className="w-full py-2 rounded-xl text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Preset Packages */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Pilih Paket Nominal Kredit
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { amount: 250000, label: 'Starter', desc: 'Pemula' },
                      { amount: 500000, label: 'Bisnis', desc: 'Populer' },
                      { amount: 1500000, label: 'Pertumbuhan', desc: 'Optimal' },
                      { amount: 5000000, label: 'Enterprise', desc: 'Skala Besar' },
                    ].map((pkg) => (
                      <button
                        key={pkg.amount}
                        type="button"
                        onClick={() => {
                          setSelectedPackage(pkg.amount);
                          setCustomAmount('');
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          selectedPackage === pkg.amount && !customAmount
                            ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/30 text-emerald-400 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold">{pkg.label}</div>
                        <div className="text-sm font-extrabold mt-0.5">{formatCurrency(pkg.amount)}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{pkg.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Amount */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Atau Masukkan Nominal Kustom (IDR)
                  </label>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="Contoh: 750000" // allowlist: atribut input HTML
                    min="50000"
                    step="10000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Gateway Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Metode Gateway Pembayaran
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedGateway('midtrans')}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        selectedGateway === 'midtrans'
                          ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/30 text-emerald-400 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 text-slate-400'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">Midtrans Snap</div>
                        <div className="text-[10px] text-slate-500">QRIS, VA, Kartu Kredit</div>
                      </div>
                      {selectedGateway === 'midtrans' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedGateway('xendit')}
                      className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        selectedGateway === 'xendit'
                          ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/30 text-emerald-400 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 text-slate-400'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">Xendit Invoice</div>
                        <div className="text-[10px] text-slate-500">Virtual Account & e-Wallet</div>
                      </div>
                      {selectedGateway === 'xendit' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </button>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    onClick={handleInitiateTopUp}
                    disabled={topUpLoading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {topUpLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Memproses Pembuatan Faktur...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Terbitkan Faktur & Lanjutkan Pembayaran
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
