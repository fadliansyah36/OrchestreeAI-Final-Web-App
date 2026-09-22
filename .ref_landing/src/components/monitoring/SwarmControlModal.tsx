import React, { useState } from 'react';
import { AlertOctagon, ShieldAlert, X, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SwarmControlModalProps {
  isOpen: boolean;
  action: 'FREEZE' | 'RESUME';
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  isProcessing: boolean;
}

export const SwarmControlModal: React.FC<SwarmControlModalProps> = ({
  isOpen,
  action,
  onClose,
  onConfirm,
  isProcessing,
}) => {
  const [reason, setReason] = useState('');
  const [confirmationInput, setConfirmationInput] = useState('');

  if (!isOpen) return null;

  const isFreeze = action === 'FREEZE';
  const expectedConfirmation = isFreeze ? 'FREEZE' : 'RESUME';
  const isValid = reason.trim().length >= 5 && confirmationInput.trim().toUpperCase() === expectedConfirmation;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isProcessing) return;
    await onConfirm(reason);
    setReason('');
    setConfirmationInput('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl space-y-0 text-slate-200">
        {/* Header */}
        <div className={`p-5 border-b flex items-start justify-between ${
          isFreeze ? 'bg-rose-950/60 border-rose-800 text-rose-200' : 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl border shrink-0 ${
              isFreeze ? 'bg-rose-900/60 border-rose-700 text-rose-300' : 'bg-emerald-900/60 border-emerald-700 text-emerald-300'
            }`}>
              {isFreeze ? <AlertOctagon className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                {isFreeze ? 'Konfirmasi Emergency Swarm Freeze' : 'Konfirmasi Resume Swarm Operations'}
              </h2>
              <p className="text-xs opacity-90 mt-0.5">
                {isFreeze
                  ? 'Aksi berisiko tinggi: Menghentikan seketika seluruh orchestrasi agen AI pada seluruh tenant.'
                  : 'Mengaktifkan kembali seluruh dispatch agen AI pada seluruh tenant platform.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className={`p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
            isFreeze ? 'bg-rose-950/30 border-rose-800/80 text-rose-300' : 'bg-emerald-950/30 border-emerald-800/80 text-emerald-300'
          }`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Peringatan Kritis Super Admin:</span>
              <span>
                {isFreeze
                  ? 'Tindakan ini akan menghentikan execution pipeline, menunda job background, dan memblokir seluruh pemanggilan model otonom bagi 14 tenant aktif.'
                  : 'Pastikan seluruh insiden keamanan atau kendala overload provider telah tertangani sebelum melanjutkan operasional swarm.'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Alasan Operasional / Catatan Audit <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isFreeze ? 'Contoh: Terdeteksi lonjakan latensi provider & anomali rate limit lintas tenant...' : 'Contoh: Provider circuit breakers telah stabil dan investigasi selesai...'}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
            <p className="text-[10px] text-slate-400">Minimal 5 karakter. Akan dicatat secara permanen di Forensic Audit Ledger.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Ketik <span className="font-mono font-bold text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">{expectedConfirmation}</span> untuk mengonfirmasi:
            </label>
            <input
              type="text"
              required
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder={`Ketik ${expectedConfirmation}`}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!isValid || isProcessing}
              className={`px-4 py-2 text-xs font-bold rounded-lg border transition flex items-center gap-1.5 disabled:opacity-40 ${
                isFreeze
                  ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-950/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-950/50'
              }`}
            >
              {isProcessing && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <span>{isFreeze ? 'Bekukan Swarm Sekarang (Freeze)' : 'Lanjutkan Swarm (Resume)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
