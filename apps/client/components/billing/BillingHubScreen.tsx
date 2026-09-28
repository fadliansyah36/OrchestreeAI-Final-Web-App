import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Wallet,
  RefreshCw,
  PlusCircle,
  Receipt,
  FileText,
  Calculator,
  Crown,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Search,
  Download,
} from 'lucide-react';
import { downloadFileFromUrl } from '@orchestree/ui';
import { CreditWalletScreen, WalletSummary } from './CreditWalletScreen';
import { TopUpScreen, TopUpPackage } from './TopUpScreen';
import { PlanFacilitiesScreen, SubscriptionPlan } from './PlanFacilitiesScreen';
import { UsageHistoryScreen, CreditReservation, CreditTransaction } from './UsageHistoryScreen';
import { CreditEstimateConfirm, CreditEstimateParams } from './CreditEstimateConfirm';


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

interface ActivityType {
  id: string;
  activity_code: string;
  display_name: string;
  base_work_unit_min: number;
  base_work_unit_max: number;
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
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [reservations, setReservations] = useState<CreditReservation[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [reconCases, setReconCases] = useState<any[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [topupPackages, setTopupPackages] = useState<TopUpPackage[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'topup' | 'plans' | 'calculator' | 'transactions' | 'invoices'>('overview');

  // Modal / Confirm state for heavy tasks
  const [isEstimateConfirmOpen, setIsEstimateConfirmOpen] = useState<boolean>(false);
  const [estimateParams, setEstimateParams] = useState<CreditEstimateParams>({
    activity_code: 'generative_visual',
    activity_name: 'Studio Konten & Kreatif Generatif',
    complexity_code: 'high',
    llm_model_id: 'gemini-1.5-pro',
    tool_risk_tier: 'medium',
    execution_mode: 'single_step',
    reference_id: `task-gen-${Date.now()}`,
    reference_type: 'GENERATIVE_STUDIO',
  });
  const [taskExecutionFeedback, setTaskExecutionFeedback] = useState<string | null>(null);

  // Settlement feedback
  const [settleFeedback, setSettleFeedback] = useState<string | null>(null);
  const [settlingInvoiceNumber, setSettlingInvoiceNumber] = useState<string | null>(null);

  // Calculator form state
  const [calcActivity, setCalcActivity] = useState<string>('simple_chat');
  const [calcComplexity, setCalcComplexity] = useState<'low' | 'medium' | 'high' | 'very_high'>('medium');
  const [calcModel, setCalcModel] = useState<string>('default');
  const [calcToolRisk, setCalcToolRisk] = useState<'none' | 'low' | 'medium' | 'high'>('none');
  const [calcExecution, setCalcExecution] = useState<'single_step' | 'multi_step' | 'autonomous'>('single_step');
  const [calcResult, setCalcResult] = useState<any | null>(null);
  const [calcLoading, setCalcLoading] = useState<boolean>(false);

  const fetchBillingData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        'X-Tenant-Id': tenantId,
        'X-User-Roles': userRole,
      };

      const [sRes, tRes, rRes, iRes, pRes, pkgRes, actRes, reconRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/credit-wallet/summary`, { headers }),
        fetch('/api/v1/billing/transactions', { headers }),
        fetch('/api/v1/billing/reservations', { headers }),
        fetch('/api/v1/billing/invoices', { headers }),
        fetch('/api/v1/billing/plans'),
        fetch('/api/v1/billing/topup-packages'),
        fetch('/api/v1/billing/activity-types'),
        fetch('/api/v1/billing/reconciliation/cases', { headers }),
      ]);

      if (sRes.ok) {
        const sData = await sRes.json();
        setSummary(sData);
      }
      if (tRes.ok) {
        const tData = await tRes.json();
        setTransactions(tData);
      }
      if (rRes.ok) {
        const rData = await rRes.json();
        setReservations(rData);
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
      }
      if (reconRes.ok) {
        const rData = await reconRes.json();
        setReconCases(rData.cases || []);
      }
      if (actRes.ok) {
        const actData = await actRes.json();
        setActivityTypes(actData);
        if (actData.length > 0 && !calcActivity) {
          setCalcActivity(actData[0].activity_code);
        }
      }
    } catch (err: any) {
      console.error('Error fetching billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, [tenantId]);

  const handleRunEstimation = async () => {
    setCalcLoading(true);
    try {
      const res = await fetch('/api/v1/billing/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_code: calcActivity,
          complexity_code: calcComplexity,
          llm_model_id: calcModel,
          tool_risk_tier: calcToolRisk === 'none' ? undefined : calcToolRisk,
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

  const handleSettleSandboxInvoice = async (invoiceNumber: string) => {
    setSettlingInvoiceNumber(invoiceNumber);
    setSettleFeedback(null);
    try {
      const res = await fetch('/api/v1/billing/sandbox-settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          payment_reference: `sandbox-ref-${Date.now().toString(36)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyelesaikan pelunasan faktur.');
      }

      setSettleFeedback(`Faktur ${invoiceNumber} berhasil dilunasi. Saldo kredit langsung aktif di dompet.`);
      fetchBillingData();
    } catch (err: any) {
      setSettleFeedback(`Gagal pelunasan: ${err.message}`);
    } finally {
      setSettlingInvoiceNumber(null);
    }
  };

  const handleReportPaymentClaim = async (invoiceNumber: string) => {
    setSettlingInvoiceNumber(invoiceNumber);
    setSettleFeedback(null);
    try {
      const res = await fetch('/api/v1/billing/reconciliation/report-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
          'X-User-Roles': userRole,
        },
        body: JSON.stringify({
          reference_id: invoiceNumber,
          notes: 'Konfirmasi pembayaran diajukan melalui portal organisasi.',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Gagal memeriksa status ke gateway.');
      }
      if (data.resolution_status === 'verified_matched') {
        setSettleFeedback(`Faktur ${invoiceNumber} terverifikasi lunas di Midtrans! Hak layanan dan kuota kredit telah diaktifkan.`);
      } else {
        setSettleFeedback(`Status gateway untuk ${invoiceNumber}: '${data.gateway_status}'. Permintaan verifikasi tercatat dan status 'Sedang Diverifikasi'.`);
      }
      await fetchBillingData();
    } catch (err: any) {
      setSettleFeedback(`Gagal memeriksa status pembayaran: ${err.message}`);
    } finally {
      setSettlingInvoiceNumber(null);
    }
  };

  const handleConfirmReservation = async (reservation: { reservation_id: string; estimated_cost: number }) => {
    setIsEstimateConfirmOpen(false);
    setTaskExecutionFeedback(
      `Reservasi berhasil (${reservation.estimated_cost} AI Credits dialokasikan). ID Reservasi: ${reservation.reservation_id}`
    );
    fetchBillingData();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Pusat Langganan & Dompet Kredit AI
                </h1>
                {summary?.is_unlimited && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <Crown className="w-3 h-3" /> Akun Bebas Kuota
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Pengelolaan saldo operasional, paket komersial, simulasi biaya AI, dan faktur resmi {tenantName}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBillingData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Perbarui Data</span>
          </button>

          <button
            onClick={() => setActiveTab('topup')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/10 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Isi Saldo Kredit</span>
          </button>
        </div>
      </div>

      {settleFeedback && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{settleFeedback}</span>
          </div>
          <button
            onClick={() => setSettleFeedback(null)}
            className="text-xs text-emerald-400 hover:underline"
          >
            Tutup
          </button>
        </div>
      )}

      {taskExecutionFeedback && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{taskExecutionFeedback}</span>
          </div>
          <button
            onClick={() => setTaskExecutionFeedback(null)}
            className="text-xs text-emerald-400 hover:underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Navigasi Tab Utama Hub */}
      <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Dompet Kredit AI</span>
        </button>

        <button
          onClick={() => setActiveTab('topup')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'topup'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Pengisian Saldo ({topupPackages.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'plans'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Crown className="w-4 h-4" />
          <span>Paket & Fasilitas ({plans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'transactions'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Riwayat Konsumsi ({reservations.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('calculator');
            if (!calcResult) handleRunEstimation();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'calculator'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Simulasi & Konfirmasi Biaya</span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'invoices'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Faktur Pembayaran ({invoices.length})</span>
        </button>
      </div>

      {/* Konten Tab 1: CreditWalletScreen */}
      {activeTab === 'overview' && (
        <CreditWalletScreen
          summary={summary}
          loading={loading}
          onRefresh={fetchBillingData}
          onOpenTopUp={() => setActiveTab('topup')}
          onNavigateToTab={(tab) => setActiveTab(tab)}
        />
      )}

      {/* Konten Tab 2: TopUpScreen */}
      {activeTab === 'topup' && (
        <TopUpScreen
          packages={topupPackages}
          tenantId={tenantId}
          onSuccess={() => {
            fetchBillingData();
          }}
        />
      )}

      {/* Konten Tab 3: PlanFacilitiesScreen */}
      {activeTab === 'plans' && (
        <PlanFacilitiesScreen
          plans={plans}
          activePlanCode="TRIAL"
          onUpgradeClick={(planCode) => {
            setActiveTab('topup');
          }}
        />
      )}

      {/* Konten Tab 4: UsageHistoryScreen */}
      {activeTab === 'transactions' && (
        <UsageHistoryScreen
          reservations={reservations}
          transactions={transactions}
          loading={loading}
          onRefresh={fetchBillingData}
        />
      )}

      {/* Konten Tab 5: Kalkulator & Simulasi CreditEstimateConfirm */}
      {activeTab === 'calculator' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-emerald-400" />
                  <span>Kalkulator & Estimator Biaya Eksekusi</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hitung perkiraan kebutuhan AI Credits sebelum mengeksekusi operasi agen cerdas atau tugas berat.
                </p>
              </div>

              <button
                onClick={() => {
                  setEstimateParams({
                    activity_code: calcActivity,
                    activity_name: activityTypes.find((a) => a.activity_code === calcActivity)?.display_name || calcActivity,
                    complexity_code: calcComplexity,
                    llm_model_id: calcModel,
                    tool_risk_tier: calcToolRisk,
                    execution_mode: calcExecution,
                    reference_id: `manual-sim-${Date.now()}`,
                    reference_type: 'SIMULATION',
                  });
                  setIsEstimateConfirmOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-semibold rounded-xl transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>Uji Dialog Konfirmasi Biaya</span>
              </button>
            </div>

            {/* Form Input Kalkulator */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-5">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Tipe Aktivitas Operasional
                </label>
                <select
                  value={calcActivity}
                  onChange={(e) => setCalcActivity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {activityTypes.map((a) => (
                    <option key={a.id} value={a.activity_code}>
                      {a.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Tingkat Kompleksitas
                </label>
                <select
                  value={calcComplexity}
                  onChange={(e) => setCalcComplexity(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="low">Rendah (1.0x)</option>
                  <option value="medium">Menengah (1.5x)</option>
                  <option value="high">Tinggi (2.5x)</option>
                  <option value="very_high">Sangat Tinggi (4.0x)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Model AI yang Digunakan
                </label>
                <select
                  value={calcModel}
                  onChange={(e) => setCalcModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="default">Default Router (1.0x)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (0.7x)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (0.75x)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (1.5x)</option>
                  <option value="gpt-4o">GPT-4o (2.0x)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Tingkat Risiko Perkakas
                </label>
                <select
                  value={calcToolRisk}
                  onChange={(e) => setCalcToolRisk(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="none">Tanpa Perkakas Eksternal (1.0x)</option>
                  <option value="low">Perkakas Standar (1.0x)</option>
                  <option value="medium">Perkakas Menengah (1.3x)</option>
                  <option value="high">Perkakas Berisiko Tinggi (2.0x)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Modus Eksekusi
                </label>
                <select
                  value={calcExecution}
                  onChange={(e) => setCalcExecution(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="single_step">Satu Langkah (1.0x)</option>
                  <option value="multi_step">Multi Langkah (1.8x)</option>
                  <option value="autonomous">Otonom Penuh (3.0x)</option>
                </select>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={handleRunEstimation}
                disabled={calcLoading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              >
                {calcLoading ? 'Menghitung...' : 'Hitung Estimasi'}
              </button>

              {calcResult && (
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-400">Hasil Estimasi:</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {calcResult.final_estimate} AI Credits
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Konten Tab 6: Invoices / Faktur Tagihan */}
      {activeTab === 'invoices' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h4 className="text-base font-bold text-white">Daftar Faktur & Tagihan Resmi</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Dokumen pembayaran sah dengan tautan gateway dan riwayat pelunasan.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Nomor Faktur</th>
                  <th className="py-3 px-4 font-semibold">Nominal</th>
                  <th className="py-3 px-4 font-semibold">Saluran Gateway</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Tanggal Terbit</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Belum ada catatan faktur pembayaran.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const reconCase = reconCases.find(
                      (c) => c.gateway_reference_id === inv.invoice_number || c.invoice_number === inv.invoice_number
                    );
                    const isUnderReconciliation =
                      reconCase &&
                      (reconCase.resolution_status === 'open' ||
                        reconCase.resolution_status === 'verified_mismatch_escalated');

                    return (
                      <tr key={inv.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-white font-mono">
                          {inv.invoice_number}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-200">
                          Rp {inv.amount.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 uppercase text-slate-400 font-medium">
                          {inv.payment_gateway}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                inv.status === 'paid'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {inv.status === 'paid' ? 'Lunas' : 'Menunggu'}
                            </span>
                            {/* Transparan: Badge Sedang Diverifikasi bila ada kasus rekonsiliasi aktif */}
                            {isUnderReconciliation && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30 inline-flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 text-sky-400 animate-pulse" />
                                <span>Sedang Diverifikasi</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(inv.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await downloadFileFromUrl(
                                  `/api/v1/billing/invoices/${inv.invoice_number}/download?tenant_id=${tenantId}`,
                                  `Faktur_${inv.invoice_number}.html`
                                );
                              } catch (e: any) {
                                alert('Gagal mengunduh faktur: ' + (e.message || 'Kesalahan jaringan'));
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[10px] font-semibold transition cursor-pointer"
                            title="Unduh Berkas Faktur Resmi"
                          >
                            <Download className="w-3 h-3 text-emerald-400" />
                            <span>Unduh Faktur</span>
                          </button>
                          {inv.payment_url && (
                            <a
                              href={inv.payment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                            >
                              <span>Gateway</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {inv.status !== 'paid' && (
                            <>
                              <button
                                onClick={() => handleReportPaymentClaim(inv.invoice_number)}
                                disabled={settlingInvoiceNumber === inv.invoice_number}
                                className="px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-[10px] font-semibold transition cursor-pointer"
                                title="Verifikasi status transaksi langsung ke gateway Midtrans"
                              >
                                {settlingInvoiceNumber === inv.invoice_number ? 'Memeriksa...' : 'Cek Status Gateway'}
                              </button>
                              <button
                                onClick={() => handleSettleSandboxInvoice(inv.invoice_number)}
                                disabled={settlingInvoiceNumber === inv.invoice_number}
                                className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-semibold transition cursor-pointer"
                              >
                                {settlingInvoiceNumber === inv.invoice_number ? 'Memproses...' : 'Simulasi Lunas'}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Komponen Konfirmasi Reservasi untuk Tugas Berat */}
      <CreditEstimateConfirm
        isOpen={isEstimateConfirmOpen}
        tenantId={tenantId}
        params={estimateParams}
        availableBalance={summary?.available || 250000}
        onConfirm={handleConfirmReservation}
        onCancel={() => setIsEstimateConfirmOpen(false)}
      />
    </div>
  );
}
