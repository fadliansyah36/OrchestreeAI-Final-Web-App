import React, { useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
  ArrowRight,
  Sparkles,
  Receipt,
  RotateCw,
} from 'lucide-react';

export interface TopUpPackage {
  id: string;
  name: string;
  credit_amount: number;
  price_idr: number;
  validity_days: number;
  is_active: boolean;
  description?: string;
}

interface TopUpScreenProps {
  packages: TopUpPackage[];
  tenantId: string;
  onSuccess: () => void;
}

export function TopUpScreen({ packages, tenantId, onSuccess }: TopUpScreenProps) {
  const [selectedPackageId, setSelectedPackageId] = useState<string>(packages[0]?.id || '');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [selectedGateway, setSelectedGateway] = useState<'midtrans' | 'xendit'>('midtrans');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);
  const [settling, setSettling] = useState<boolean>(false);
  const [settleMessage, setSettleMessage] = useState<string | null>(null);

  const activePackage = packages.find((p) => p.id === selectedPackageId);
  const currentAmount = isCustom
    ? parseFloat(customAmount) || 0
    : activePackage?.price_idr || 0;

  const currentCredit = isCustom
    ? currentAmount
    : activePackage?.credit_amount || 0;

  const handleInitiateTopUp = async () => {
    setLoading(true);
    setErrorMessage(null);
    setCreatedInvoice(null);
    setSettleMessage(null);

    if (currentAmount <= 0) {
      setErrorMessage('Nominal top-up harus lebih besar dari 0.');
      setLoading(false);
      return;
    }

    try {
      const packageName = isCustom
        ? `Top Up Kustom ${currentAmount.toLocaleString('id-ID')} IDR`
        : activePackage?.name || 'Top Up Kredit AI';

      const response = await fetch('/api/v1/billing/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          amount: currentAmount,
          payment_gateway: selectedGateway,
          package_name: packageName,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Gagal membuat tagihan pembayaran.');
      }

      const inv = await response.json();
      setCreatedInvoice(inv);
    } catch (err: any) {
      console.error('Error initiating top-up:', err);
      setErrorMessage(err.message || 'Terjadi kesalahan saat memproses transaksi.');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateSettlement = async () => {
    if (!createdInvoice?.invoice_number) return;
    setSettling(true);
    setSettleMessage(null);
    try {
      const res = await fetch('/api/v1/billing/sandbox-settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_number: createdInvoice.invoice_number }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses settlement simulasi.');
      }
      setSettleMessage('Pembayaran berhasil dikonfirmasi. Saldo kredit telah ditambahkan ke dompet.');
      setCreatedInvoice({ ...createdInvoice, status: 'paid' });
      onSuccess();
    } catch (err: any) {
      setSettleMessage(`Gagal konfirmasi: ${err.message}`);
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <span>Pengisian Saldo Kredit AI</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Pilih paket top-up resmi untuk menambah alokasi operasional. Kredit aktif langsung siap digunakan untuk seluruh agen dan alur kerja.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Gateway Terverifikasi • Enkripsi SSL</span>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid Paket Top-Up Resmi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {packages.map((pkg) => {
          const isSelected = !isCustom && selectedPackageId === pkg.id;
          const hasBonus = pkg.credit_amount > pkg.price_idr;
          const bonusAmount = pkg.credit_amount - pkg.price_idr;

          return (
            <div
              key={pkg.id}
              onClick={() => {
                setIsCustom(false);
                setSelectedPackageId(pkg.id);
              }}
              className={`cursor-pointer rounded-2xl p-5 border transition-all relative flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-850 border-emerald-500 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              {hasBonus && (
                <div className="absolute -top-2.5 right-4 px-2 py-0.5 bg-emerald-500 text-slate-950 font-bold text-[10px] rounded-full shadow-sm">
                  +{bonusAmount.toLocaleString('id-ID')} Bonus
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-white text-sm">{pkg.name}</h4>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-slate-700 bg-slate-950'
                    }`}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>}
                  </div>
                </div>

                <div className="mt-4">
                  <span className="text-2xl font-bold text-white">
                    Rp {pkg.price_idr.toLocaleString('id-ID')}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                  <Zap className="w-3.5 h-3.5" />
                  <span>{pkg.credit_amount.toLocaleString('id-ID')} AI Credits</span>
                </div>

                <p className="mt-2 text-[11px] text-slate-400 line-clamp-2">
                  {pkg.description || `Masa aktif alokasi ${pkg.validity_days} hari operasional.`}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
                <span>Masa Berlaku</span>
                <span className="text-slate-400 font-medium">{pkg.validity_days} Hari</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Opsi Nominal Kustom */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Nominal Fleksibel / Kustom</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Tentukan sendiri nominal saldo sesuai kebutuhan beban kerja organisasi Anda (1 IDR = 1 AI Credit).
            </p>
          </div>
          <button
            onClick={() => setIsCustom(!isCustom)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isCustom
                ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-semibold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
            }`}
          >
            {isCustom ? 'Gunakan Paket Standar' : 'Gunakan Nominal Kustom'}
          </button>
        </div>

        {isCustom && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-semibold">Rp</span>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="750000" // allowlist: HTML input field hint
                min="10000"
                step="10000"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="text-xs text-slate-400">
              Setara: <span className="font-semibold text-emerald-400">{currentCredit.toLocaleString('id-ID')} AI Credits</span>
            </div>
          </div>
        )}
      </div>

      {/* Konfigurasi Gateway Pembayaran & Checkout */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h4 className="text-sm font-semibold text-white mb-3">Pilihan Saluran Pembayaran</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <label
            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
              selectedGateway === 'midtrans'
                ? 'bg-slate-850 border-emerald-500'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="gateway"
                value="midtrans"
                checked={selectedGateway === 'midtrans'}
                onChange={() => setSelectedGateway('midtrans')}
                className="text-emerald-500 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-semibold text-white block">Midtrans Gateway</span>
                <span className="text-[11px] text-slate-400">QRIS, GoPay, ShopeePay, Virtual Account & Kartu Kredit</span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Instan
            </span>
          </label>

          <label
            className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
              selectedGateway === 'xendit'
                ? 'bg-slate-850 border-emerald-500'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="gateway"
                value="xendit"
                checked={selectedGateway === 'xendit'}
                onChange={() => setSelectedGateway('xendit')}
                className="text-emerald-500 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-semibold text-white block">Xendit Gateway</span>
                <span className="text-[11px] text-slate-400">Virtual Account Mandiri, BCA, BNI, BRI, OVO & DANA</span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Instan
            </span>
          </label>
        </div>

        {/* Ringkasan & Tombol Aksi */}
        <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">Total Pembayaran:</div>
            <div className="text-xl font-bold text-white">
              Rp {currentAmount.toLocaleString('id-ID')}
              <span className="text-xs font-normal text-emerald-400 ml-2">
                (+{currentCredit.toLocaleString('id-ID')} AI Credits)
              </span>
            </div>
          </div>

          <button
            onClick={handleInitiateTopUp}
            disabled={loading || currentAmount <= 0}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/10"
          >
            {loading ? (
              <RotateCw className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            <span>Lanjutkan ke Pembayaran</span>
          </button>
        </div>
      </div>

      {/* Modal / Dialog Hasil Invoice */}
      {createdInvoice && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-400" />
              <h4 className="text-base font-bold text-white">Faktur Pembayaran Diterbitkan</h4>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-medium uppercase ${
                createdInvoice.status === 'paid'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {createdInvoice.status === 'paid' ? 'Lunas' : 'Menunggu Pembayaran'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-950 rounded-xl text-xs">
            <div>
              <span className="text-slate-400 block">Nomor Faktur:</span>
              <span className="font-semibold text-white">{createdInvoice.invoice_number}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Nominal:</span>
              <span className="font-semibold text-white">
                Rp {createdInvoice.amount?.toLocaleString('id-ID')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Saluran Gateway:</span>
              <span className="font-semibold text-white uppercase">{createdInvoice.payment_gateway}</span>
            </div>
          </div>

          {settleMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{settleMessage}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            {createdInvoice.payment_url && (
              <a
                href={createdInvoice.payment_url}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
              >
                <span>Buka Halaman Pembayaran Gateway</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {createdInvoice.status !== 'paid' && (
              <button
                onClick={handleSimulateSettlement}
                disabled={settling}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-lg transition-colors"
              >
                {settling ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Verifikasi Pelunasan Pembayaran</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
