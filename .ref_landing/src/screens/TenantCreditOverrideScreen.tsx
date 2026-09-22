import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Check,
  X,
  History,
  Lock,
  Search,
  Building2,
  FileText,
  UserCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  TenantWalletDetailsResponse,
  ManualCreditAdjustmentRequest,
  AiCreditLedgerItem,
} from '../types';

export const TenantCreditOverrideScreen: React.FC = () => {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState('');
  const [availableTenantsList, setAvailableTenantsList] = useState<{ id: string; name: string }[]>([]);
  const [walletData, setWalletData] = useState<TenantWalletDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Manual Adjustment Form State
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(500);
  const [adjustmentType, setAdjustmentType] = useState<string>('BONUS');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('SLA compensation credit topup ticket #9201');
  const [isExecuting, setIsExecuting] = useState(false);

  const fetchWallet = useCallback(async (tId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getTenantWalletDetails(tId);
      setWalletData(res);
    } catch (err: any) {
      setError(err.message || `Gagal memuat wallet dan ledger untuk tenant ${tId}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    api.getTenants().then((tenants) => {
      if (Array.isArray(tenants) && tenants.length > 0) {
        setAvailableTenantsList(tenants);
        setTenantId((prev) => prev || tenants[0].id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tenantId) {
      fetchWallet(tenantId);
    }
  }, [fetchWallet, tenantId]);

  const handleExecuteAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentReason.trim()) {
      setError('Alasan penyesuaian kredit (reason) wajib diisi untuk audit trail.');
      return;
    }

    if (adjustmentAmount <= 0) {
      setError('Nominal kredit harus lebih besar dari 0.');
      return;
    }

    const confirmMsg = `Konfirmasi Eksekusi Penyesuaian Kredit:
Tenant: ${tenantId}
Nominal: ${adjustmentAmount} Credits
Tipe Ledger: ${adjustmentType}
Operator: ${user?.email || 'superadmin@orchestree.ai'}
Alasan: ${adjustmentReason}

Lanjutkan eksekusi ke PostgreSQL Ledger?`;

    if (!confirm(confirmMsg)) return;

    setIsExecuting(true);
    setError(null);
    try {
      const req: ManualCreditAdjustmentRequest = {
        tenantId,
        amount: Number(adjustmentAmount),
        ledgerType: adjustmentType,
        reason: adjustmentReason,
        operatorId: user?.email || 'superadmin@orchestree.ai',
      };
      const res = await api.manualCreditAdjustment(req);
      setSuccessMessage(
        `Sukses: Ledger entry dibuat. Saldo kredit baru tenant ${res.tenantId}: ${res.newAvailableBalance.toLocaleString()} Credits.`
      );
      setTimeout(() => setSuccessMessage(null), 5000);
      setAdjustmentAmount(100);
      setAdjustmentReason('');
      await fetchWallet(tenantId);
    } catch (err: any) {
      setError(err.message || 'Gagal mengeksekusi penyesuaian kredit');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Tenant Credit Management & Override</h2>
            <p className="text-xs text-slate-400">
              Prinsip Kunci: <strong>TIDAK ADA edit saldo langsung</strong> — seluruh mutasi kredit wajib tercatat di <code>ai_credit_ledger</code> dan <code>audit_logs</code> dengan ID operator.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono bg-indigo-950/60 text-indigo-400 border border-indigo-800/60 px-2.5 py-1 rounded">
            Immutable Double-Entry Ledger
          </span>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 flex items-center space-x-3 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-4 flex items-center space-x-3 text-emerald-300 text-sm">
          <Check className="w-5 h-5 shrink-0 text-emerald-400" />
          <span className="flex-1">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tenant Selector Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-3">
          <Building2 className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300 font-medium">Pilih Tenant Target:</span>
          <div className="flex items-center space-x-2">
            {availableTenantsList.length > 0 && (
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
              >
                {availableTenantsList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.id})
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="Masukkan Tenant ID (UUID)..."
              className="bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded px-3 py-1.5 focus:border-indigo-500 focus:outline-none w-56"
            />
            <button
              onClick={() => fetchWallet(tenantId)}
              disabled={isLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium flex items-center space-x-1.5 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Cari Wallet</span>
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-slate-400">
          <button
            onClick={() => fetchWallet(tenantId)}
            disabled={isLoading}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3.1: Wallet Balances Display Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Available Balance (Aktif)</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {walletData?.availableBalance ? walletData.availableBalance.toLocaleString() : '0'}{' '}
            <span className="text-xs font-normal text-slate-400">Credits</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Siap digunakan untuk eksekusi AI</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Reserved Balance (Terkunci)</span>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {walletData?.wallet?.reservedBalance ? walletData.wallet.reservedBalance.toLocaleString() : '0'}{' '}
            <span className="text-xs font-normal text-slate-400">Credits</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Dalam proses workflow aktif</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Used Balance (Terpakai)</span>
          <div className="text-2xl font-bold font-mono text-sky-400 mt-1">
            {walletData?.wallet?.usedBalance ? walletData.wallet.usedBalance.toLocaleString() : '0'}{' '}
            <span className="text-xs font-normal text-slate-400">Credits</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Total konsumsi MTD periode ini</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Komposisi Total Saldo</span>
          <div className="text-xs font-mono text-slate-300 mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Plan:</span>
              <span>{walletData?.wallet?.subscriptionBalance?.toLocaleString() ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Top-up:</span>
              <span>{walletData?.wallet?.topupBalance?.toLocaleString() ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Bonus:</span>
              <span>{walletData?.wallet?.bonusBalance?.toLocaleString() ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3.2: Manual Credit Adjustment Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-100">Manual Credit Adjustment (Super Admin Override)</h3>
          </div>
          <span className="text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded font-mono">
            Mandatory Reason & Audit Logging Enforced
          </span>
        </div>

        <form onSubmit={handleExecuteAdjustment} className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs items-end">
          <div>
            <label className="block text-slate-400 mb-1">Nominal Kredit (Credits)</label>
            <input
              type="number"
              min={1}
              required
              value={adjustmentAmount}
              onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
              placeholder="e.g. 500"
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-indigo-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Tipe Mutasi Ledger</label>
            <select
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-indigo-500 focus:outline-none font-mono"
            >
              <option value="BONUS">BONUS (Penambahan Kredit Bonus)</option>
              <option value="TOPUP">TOPUP (Alokasi Pembelian Tambahan)</option>
              <option value="REVERT">REVERT (Kompensasi / Pengembalian)</option>
              <option value="MANUAL_ADJUSTMENT">MANUAL_ADJUSTMENT (Koreksi Admin)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Alasan Wajib (Audit Trail Reason)</label>
            <input
              type="text"
              required
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="e.g. Tiket dukungan #10293 SLA Refund"
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isExecuting}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isExecuting ? 'Memproses...' : 'Eksekusi Adjustment'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 3.3: Real-Time Audit Trail & Ledger History Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">Riwayat Mutasi Kredit Ledger (Cloud Database)</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Menampilkan {walletData?.entries?.length ?? 0} dari total {walletData?.totalLedger ?? 0} transaksi
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Ledger ID</th>
                <th className="py-3 px-4">Tipe Mutasi</th>
                <th className="py-3 px-4">Nominal</th>
                <th className="py-3 px-4">Saldo Sebelum</th>
                <th className="py-3 px-4">Saldo Sesudah</th>
                <th className="py-3 px-4">Keterangan / Alasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {!walletData || walletData.entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {isLoading ? 'Memuat riwayat ledger...' : 'Belum ada catatan mutasi kredit untuk tenant ini.'}
                  </td>
                </tr>
              ) : (
                walletData.entries.map((item: AiCreditLedgerItem) => {
                  const isCredit = item.amount >= 0;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">{item.id.slice(0, 8)}...</td>
                      <td className="py-3 px-4">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-700">
                          {item.ledgerType}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold">
                        <span className={isCredit ? 'text-emerald-400' : 'text-rose-400'}>
                          {isCredit ? `+${item.amount}` : item.amount}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">{item.balanceBefore.toLocaleString()}</td>
                      <td className="py-3 px-4 font-mono text-slate-200">{item.balanceAfter.toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-300">{item.description || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
