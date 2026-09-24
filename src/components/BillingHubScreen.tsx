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
  Calculator,
  Layers,
  Sparkles,
  Info,
  Check,
  X,
  Crown,
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

interface WalletSummary {
  available: number;
  reserved: number;
  used_this_cycle: number;
  total_allocated_this_cycle: number;
  is_unlimited: boolean;
  low_balance_warning: boolean;
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

interface SubscriptionPlan {
  id: string;
  plan_code: string;
  tier_level: number;
  display_name: string;
  monthly_price_idr: number | null;
  ai_credit_allowance: number | null;
  human_staff_limit: number | null;
  ai_agent_limit: number | null;
  is_trial: boolean;
  trial_duration_days: number | null;
  is_custom_quote: boolean;
  display_order: number;
  facilities: Record<string, string>;
}

interface TopUpPackage {
  id: string;
  name: string;
  credit_amount: number;
  price_idr: number;
  validity_days: number;
  is_active: boolean;
}

interface ActivityType {
  id: string;
  activity_code: string;
  display_name: string;
  base_work_unit_min: number;
  base_work_unit_max: number;
}

interface CreditEstimateResult {
  activity_code: string;
  base_work_units: number;
  complexity_multiplier: number;
  model_multiplier: number;
  tool_multiplier: number;
  execution_multiplier: number;
  final_estimate: number;
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
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [topupPackages, setTopupPackages] = useState<TopUpPackage[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'calculator' | 'transactions' | 'invoices'>('overview');

  // Top-Up Modal State
  const [isTopUpOpen, setIsTopUpOpen] = useState<boolean>(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [selectedPackageAmount, setSelectedPackageAmount] = useState<number>(500000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [selectedGateway, setSelectedGateway] = useState<'midtrans' | 'xendit'>('midtrans');
  const [topUpLoading, setTopUpLoading] = useState<boolean>(false);
  const [topUpSuccess, setTopUpSuccess] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Settlement Testing State
  const [settlingInvoiceNumber, setSettlingInvoiceNumber] = useState<string | null>(null);
  const [settleFeedback, setSettleFeedback] = useState<string | null>(null);

  // Calculator State
  const [calcActivity, setCalcActivity] = useState<string>('simple_chat');
  const [calcComplexity, setCalcComplexity] = useState<string>('medium');
  const [calcModel, setCalcModel] = useState<string>('default');
  const [calcToolRisk, setCalcToolRisk] = useState<string>('none');
  const [calcExecution, setCalcExecution] = useState<string>('single_step');
  const [calcResult, setCalcResult] = useState<CreditEstimateResult | null>(null);
  const [calcLoading, setCalcLoading] = useState<boolean>(false);

  const fetchBillingData = async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const headers: Record<string, string> = {
        'X-Tenant-Id': tenantId,
        'X-User-Roles': userRole,
      };

      const [wRes, sRes, tRes, iRes, pRes, pkgRes, actRes] = await Promise.all([
        fetch('/api/v1/billing/wallet', { headers }),
        fetch(`/api/v1/tenants/${tenantId}/credit-wallet/summary`, { headers }),
        fetch('/api/v1/billing/transactions', { headers }),
        fetch('/api/v1/billing/invoices', { headers }),
        fetch('/api/v1/billing/plans'),
        fetch('/api/v1/billing/topup-packages'),
        fetch('/api/v1/billing/activity-types'),
      ]);

      if (wRes.ok) {
        const wData = await wRes.json();
        setWallet(wData);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        setSummary(sData);
      }
      if (tRes.ok) {
        const tData = await tRes.json();
        setTransactions(tData);
      }
      if (iRes.ok) {
        const iData = await iRes.json();
        setInvoices(iData);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setPlans(pData);
      }
      if (pkgRes.ok) {
        const pkgData = await pkgRes.json();
        setTopupPackages(pkgData);
        if (pkgData.length > 0 && !selectedPackageId) {
          setSelectedPackageId(pkgData[0].id);
          setSelectedPackageAmount(pkgData[0].price_idr);
        }
      }
      if (actRes.ok) {
        const actData = await actRes.json();
        setActivityTypes(actData);
        if (actData.length > 0) {
          setCalcActivity(actData[0].activity_code);
        }
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

    const amount = customAmount ? parseFloat(customAmount) : selectedPackageAmount;
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
          package_id: selectedPackageId || undefined,
          package_name: `Top Up Kredit ${amount.toLocaleString('id-ID')} IDR`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Gagal membuat tagihan top-up.');
      }

      setTopUpSuccess(data);
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

      setSettleFeedback(`Faktur ${invoiceNumber} berhasil dilunasi. Entitlement paket & saldo kredit langsung aktif.`);
      fetchBillingData();
    } catch (err: any) {
      setSettleFeedback(`Gagal pelunasan: ${err.message}`);
    } finally {
      setSettlingInvoiceNumber(null);
    }
  };

  const handleRunEstimation = async () => {
    setCalcLoading(true);
    try {
      const res = await fetch('/api/v1/billing/estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
          'X-User-Roles': userRole,
        },
        body: JSON.stringify({
          activity_code: calcActivity,
          complexity_code: calcComplexity,
          llm_model_id: calcModel,
          tool_risk_tier: calcToolRisk === 'none' ? null : calcToolRisk,
          execution_mode: calcExecution,
        }),
      });
      if (res.ok) {
        const estData = await res.json();
        setCalcResult(estData);
      }
    } catch (err: any) {
      console.error('Estimation error:', err);
    } finally {
      setCalcLoading(false);
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
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Pusat Langganan & Dompet Kredit AI
                </h1>
                {summary?.is_unlimited && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <Crown className="w-3 h-3" /> Unlimited Override
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pengelolaan kuota siklus berjalan, paket komersial, estimasi kredit AI, dan faktur resmi {tenantName}
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
            Beli Paket Top-Up
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

      {/* 4 Metrik Siklus Berjalan (BAGIAN C Kontrak Spesifik) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Available Balance */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
            <span>Saldo Kredit Tersedia</span>
            <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {summary ? Number(summary.available).toLocaleString('id-ID') : '0'} CR
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            {summary?.low_balance_warning ? (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Peringatan: Saldo menipis
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Siap digunakan
              </span>
            )}
          </div>
        </div>

        {/* Reserved Balance */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
            <span>Sedang Direservasi</span>
            <span className="p-1 rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {summary ? Number(summary.reserved).toLocaleString('id-ID') : '0'} CR
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Terkunci selama eksekusi tugas AI
          </p>
        </div>

        {/* Used This Cycle */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
            <span>Terpakai Siklus Ini</span>
            <span className="p-1 rounded-lg bg-blue-500/10 text-blue-400">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {summary ? Number(summary.used_this_cycle).toLocaleString('id-ID') : '0'} CR
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Akumulasi konsumsi kredit
          </p>
        </div>

        {/* Total Allocated This Cycle */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
            <span>Total Kuota Siklus Ini</span>
            <span className="p-1 rounded-lg bg-purple-500/10 text-purple-400">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {summary ? Number(summary.total_allocated_this_cycle).toLocaleString('id-ID') : '0'} CR
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Jatah langganan & top-up aktif
          </p>
        </div>
      </div>

      {summary?.is_unlimited && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-transparent border border-amber-500/30 flex items-center gap-3">
          <Crown className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-amber-300">Akun Enterprise Unlimited (Override Aktif)</h4>
            <p className="text-xs text-amber-200/80">
              Organisasi memiliki hak eksekusi beban kerja AI tanpa batas saldo. Seluruh mutasi pemakaian tetap dicatat 100% pada buku besar audit.
            </p>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Ringkasan Mutasi
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'plans'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Crown className="w-4 h-4" />
          Katalog Paket & Fasilitas ({plans.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('calculator');
            if (!calcResult) handleRunEstimation();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'calculator'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Calculator className="w-4 h-4" />
          Kalkulator Estimasi Kredit AI
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
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
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'invoices'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Riwayat Tagihan & Faktur ({invoices.length})
        </button>
      </div>

      {/* Tab Content: KATALOG PAKET RESMI (BAGIAN A) */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Paket Komersial & Hak Akses Platform
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              5 Tingkatan Paket Resmi OrchestreeAI dengan alokasi AI credit allowance, plafon staf & agen AI, serta matriks akses 21 fasilitas terpadu.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {plans.map((p) => {
              const isHighlight = p.plan_code === 'PROFESSIONAL';
              return (
                <div
                  key={p.id}
                  className={`p-5 rounded-2xl bg-white dark:bg-[#0E1726] border flex flex-col justify-between transition-all ${
                    isHighlight
                      ? 'border-emerald-500 dark:border-emerald-500/80 shadow-lg ring-1 ring-emerald-500/30'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    {isHighlight && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full inline-block mb-2">
                        Paling Populer
                      </span>
                    )}
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {p.display_name}
                    </h3>
                    <div className="mt-3">
                      {p.is_custom_quote ? (
                        <div className="text-xl font-extrabold text-slate-900 dark:text-white">Kustom</div>
                      ) : (
                        <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                          {p.monthly_price_idr ? formatCurrency(p.monthly_price_idr) : 'Gratis'}
                          <span className="text-xs font-normal text-slate-500"> /bln</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span>Jatah AI Credit:</span>
                        <span className="font-bold text-emerald-400">
                          {p.ai_credit_allowance ? `${p.ai_credit_allowance.toLocaleString('id-ID')} CR` : 'Kustom'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span>Batas Human Staff:</span>
                        <span className="font-semibold">{p.human_staff_limit || 'Tak Terbatas'}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span>Batas AI Agent:</span>
                        <span className="font-semibold">{p.ai_agent_limit || 'Tak Terbatas'}</span>
                      </div>
                      {p.is_trial && (
                        <div className="text-[11px] text-amber-400 font-medium">
                          Masa percobaan: {p.trial_duration_days} hari
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="text-[11px] text-slate-500 block mb-2 font-medium">Fasilitas Utama:</span>
                    <div className="space-y-1 text-[11px] text-slate-400">
                      {Object.entries(p.facilities || {}).slice(0, 5).map(([fKey, level]) => (
                        <div key={fKey} className="flex items-center justify-between">
                          <span className="truncate pr-1">{fKey.replace(/_/g, ' ')}</span>
                          <span className="font-mono text-emerald-400 uppercase text-[10px]">{level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Content: KALKULATOR ESTIMASI KREDIT AI (BAGIAN B TAHAP 1) */}
      {activeTab === 'calculator' && (
        <div className="bg-white dark:bg-[#0E1726] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Kalkulator Estimasi Biaya Kredit AI (Tahap 1: estimate_credit_cost)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Formula transparan: Biaya = Base × Pengali Kompleksitas × Model LLM × Tool Risk × Mode Eksekusi
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Jenis Aktivitas AI (18 Baseline Types)
                </label>
                <select
                  value={calcActivity}
                  onChange={(e) => setCalcActivity(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  {activityTypes.map((act) => (
                    <option key={act.id} value={act.activity_code}>
                      {act.display_name} (Base: {act.base_work_unit_min} - {act.base_work_unit_max} WU)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Tingkat Kompleksitas
                  </label>
                  <select
                    value={calcComplexity}
                    onChange={(e) => setCalcComplexity(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="low">Low (×1.0)</option>
                    <option value="medium">Medium (×1.5)</option>
                    <option value="high">High (×2.2)</option>
                    <option value="very_high">Very High (×3.5)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Model LLM
                  </label>
                  <select
                    value={calcModel}
                    onChange={(e) => setCalcModel(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="default">Default Provider (×1.0)</option>
                    <option value="nim-llama3-70b">Llama 3 70B (×1.4)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (×1.0)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (×2.5)</option>
                    <option value="claude-3-7-sonnet">Claude 3.7 Sonnet (×3.0)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Risk Tier MCP Tool
                  </label>
                  <select
                    value={calcToolRisk}
                    onChange={(e) => setCalcToolRisk(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="none">Tanpa Tool Eksternal (×1.0)</option>
                    <option value="low">Low Risk - Read-only (×1.2)</option>
                    <option value="medium">Medium Risk - API Call (×1.5)</option>
                    <option value="high">High Risk - Write/Payment (×2.0)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Mode Eksekusi
                  </label>
                  <select
                    value={calcExecution}
                    onChange={(e) => setCalcExecution(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="single_step">Single Step (×1.0)</option>
                    <option value="multi_step">Multi-Step Directed (×1.5)</option>
                    <option value="autonomous">Autonomous Agent Loop (×2.5)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleRunEstimation}
                disabled={calcLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {calcLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
                Hitung Ulang Estimasi
              </button>
            </div>

            {/* Estimation Result Box */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Hasil Estimasi Reservasi
                </span>
                <div className="text-3xl font-extrabold text-purple-400">
                  {calcResult ? Number(calcResult.final_estimate).toFixed(2) : '0.00'} CR
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Kredit ini yang akan direservasi (Tahap 2) sebelum eksekusi dimulai.
                </p>

                {calcResult && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Base Work Units:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {calcResult.base_work_units} WU
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Faktor Kompleksitas:</span>
                      <span className="font-mono text-purple-400">×{calcResult.complexity_multiplier}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Faktor Model LLM:</span>
                      <span className="font-mono text-purple-400">×{calcResult.model_multiplier}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Faktor Tool Risk:</span>
                      <span className="font-mono text-purple-400">×{calcResult.tool_multiplier}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Faktor Mode Eksekusi:</span>
                      <span className="font-mono text-purple-400">×{calcResult.execution_multiplier}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Bila eksekusi dibatalkan atau gagal, reservasi 100% dikembalikan otomatis (Tahap 5: Refund).</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    Pilih paket kredit resmi dengan masa aktif otomatis
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
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Faktur Berhasil Dibuat
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nomor Faktur: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{topUpSuccess.invoice_number}</span>
                </p>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <a
                    href={topUpSuccess.payment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-2"
                  >
                    Buka Halaman Pembayaran <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => {
                      setIsTopUpOpen(false);
                      setTopUpSuccess(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Pilih Paket Top-Up Resmi
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {topupPackages.map((pkg) => (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => {
                          setSelectedPackageId(pkg.id);
                          setSelectedPackageAmount(pkg.price_idr);
                          setCustomAmount('');
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          selectedPackageId === pkg.id && !customAmount
                            ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-400 ring-1 ring-emerald-500'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{pkg.name}</div>
                        <div className="text-sm font-extrabold text-emerald-500 mt-1">
                          {formatCurrency(pkg.price_idr)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          +{Number(pkg.credit_amount).toLocaleString('id-ID')} CR • Berlaku {pkg.validity_days} hari
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Pilihan Saluran Pembayaran
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedGateway('midtrans')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedGateway === 'midtrans'
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-400 ring-1 ring-emerald-500'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Midtrans Snap</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">QRIS, GoPay, VA BCA/Mandiri/BNI</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedGateway('xendit')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedGateway === 'xendit'
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-400 ring-1 ring-emerald-500'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">Xendit Invoice</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">VA, OVO, Dana, Kartu Kredit</div>
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleInitiateTopUp}
                  disabled={topUpLoading}
                  className="w-full py-3 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {topUpLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menerbitkan Tagihan...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" /> Terbitkan Faktur Pembayaran
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
