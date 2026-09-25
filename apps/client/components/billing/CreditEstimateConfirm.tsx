import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  X,
  RotateCw,
  Layers,
  Cpu,
  Sliders,
  ShieldAlert,
} from 'lucide-react';

export interface CreditEstimateParams {
  activity_code: string;
  activity_name?: string;
  complexity_code?: 'low' | 'medium' | 'high' | 'very_high';
  llm_model_id?: string;
  tool_risk_tier?: 'none' | 'low' | 'medium' | 'high';
  execution_mode?: 'single_step' | 'multi_step' | 'autonomous';
  reference_id?: string;
  reference_type?: string;
  metadata?: Record<string, any>;
}

export interface CreditEstimateResult {
  activity_code: string;
  base_work_units: number;
  complexity_multiplier: number;
  model_multiplier: number;
  tool_multiplier: number;
  execution_multiplier: number;
  final_estimate: number;
}

interface CreditEstimateConfirmProps {
  isOpen: boolean;
  tenantId: string;
  params: CreditEstimateParams;
  availableBalance?: number;
  onConfirm: (reservation: { reservation_id: string; estimated_cost: number }) => void;
  onCancel: () => void;
}

export function CreditEstimateConfirm({
  isOpen,
  tenantId,
  params,
  availableBalance = 250000,
  onConfirm,
  onCancel,
}: CreditEstimateConfirmProps) {
  const [estimating, setEstimating] = useState<boolean>(true);
  const [estimateResult, setEstimateResult] = useState<CreditEstimateResult | null>(null);
  const [reserving, setReserving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setEstimating(true);
    setError(null);

    fetch('/api/v1/billing/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_code: params.activity_code,
        complexity_code: params.complexity_code || 'medium',
        llm_model_id: params.llm_model_id || 'gemini-1.5-pro',
        tool_risk_tier: params.tool_risk_tier || 'none',
        execution_mode: params.execution_mode || 'single_step',
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Gagal menghitung estimasi biaya.');
        return res.json();
      })
      .then((data: CreditEstimateResult) => {
        if (isMounted) {
          setEstimateResult(data);
          setEstimating(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err.message || 'Terjadi kesalahan kalkulasi.');
          setEstimating(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, params]);

  if (!isOpen) return null;

  const cost = estimateResult?.final_estimate || 0;
  const isSufficient = availableBalance >= cost;

  const handleReserveAndExecute = async () => {
    if (!isSufficient) {
      setError('Saldo AI Credits tidak mencukupi untuk reservasi tugas ini.');
      return;
    }

    setReserving(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/billing/reserve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          estimated_cost: cost,
          reference_type: params.reference_type || params.activity_code,
          reference_id: params.reference_id || `job-${Date.now()}`,
          metadata: {
            ...params.metadata,
            activity_code: params.activity_code,
            complexity_code: params.complexity_code || 'medium',
            llm_model_id: params.llm_model_id,
            tool_risk_tier: params.tool_risk_tier,
            execution_mode: params.execution_mode,
            base_units: estimateResult?.base_work_units,
            complexity_multiplier: estimateResult?.complexity_multiplier,
            model_multiplier: estimateResult?.model_multiplier,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Gagal melakukan reservasi kredit.');
      }

      const reservationData = await res.json();
      onConfirm({
        reservation_id: reservationData.reservation_id,
        estimated_cost: cost,
      });
    } catch (err: any) {
      setError(err.message || 'Gagal mereservasi saldo kredit.');
      setReserving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative">
        {/* Tombol Tutup */}
        <button
          onClick={onCancel}
          disabled={reserving}
          className="absolute right-4 top-4 text-slate-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Konfirmasi */}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Transparansi Biaya Eksekusi AI</span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1">
            Konfirmasi Reservasi Kredit Operasional
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Periksa rincian parameter dan estimasi biaya sebelum tugas berat dijalankan.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {estimating ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RotateCw className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-xs">Menghitung matriks biaya berdasarkan beban kerja...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Kartu Ringkasan Biaya Utama */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">
                  Estimasi Reservasi (AI Credits)
                </span>
                <span className="text-2xl font-bold text-emerald-400">
                  {cost.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Tugas: {params.activity_name || params.activity_code}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-400 block font-medium">
                  Saldo Tersedia
                </span>
                <span
                  className={`text-sm font-bold ${
                    isSufficient ? 'text-white' : 'text-red-400'
                  }`}
                >
                  {availableBalance.toLocaleString('id-ID')} AI Credits
                </span>
                <span className="text-[10px] block mt-0.5">
                  {isSufficient ? (
                    <span className="text-emerald-400 flex items-center justify-end gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Saldo Cukup
                    </span>
                  ) : (
                    <span className="text-red-400 flex items-center justify-end gap-1">
                      <ShieldAlert className="w-3 h-3" /> Saldo Kurang
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Rincian Komponen Formula */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="text-slate-400 font-semibold text-[11px] block">
                Komposisi Pengali Formula (Transparansi Komersial):
              </span>

              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Unit Kerja Dasar:</span>
                  <span className="font-semibold">{estimateResult?.base_work_units}</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Kompleksitas ({params.complexity_code || 'med'}):</span>
                  <span className="font-semibold">{estimateResult?.complexity_multiplier}x</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Model AI:</span>
                  <span className="font-semibold">{estimateResult?.model_multiplier}x</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Risiko Perkakas:</span>
                  <span className="font-semibold">{estimateResult?.tool_multiplier}x</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 pt-1">
                Catatan: Saldo hanya akan dipotong sesuai konsumsi riil token dan waktu eksekusi. Sisa reservasi akan otomatis dikembalikan ke dompet organisasi.
              </div>
            </div>
          </div>
        )}

        {/* Tombol Aksi */}
        <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
          <button
            onClick={onCancel}
            disabled={reserving}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-medium rounded-xl transition-colors"
          >
            Batal
          </button>

          <button
            onClick={handleReserveAndExecute}
            disabled={estimating || reserving || !isSufficient}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/10"
          >
            {reserving ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
            <span>Konfirmasi & Reservasi Saldo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
