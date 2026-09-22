import React, { useState } from 'react';
import {
  X,
  Building2,
  User,
  Mail,
  Phone,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface ProspectRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProspectRegistrationModal: React.FC<ProspectRegistrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyScale, setCompanyScale] = useState('11-50');
  const [interestType, setInterestType] = useState('demo_request');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ id: string; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/public/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          work_email: workEmail.trim(),
          phone_number: phoneNumber.trim() || null,
          company_name: companyName.trim(),
          company_scale: companyScale,
          interest_type: interestType,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Gagal mengirim pengajuan.');
      }

      setSuccessInfo({
        id: data.id,
        message: data.message || 'Permintaan demonstrasi organisasi berhasil tercatat.',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi gangguan koneksi ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSuccessInfo(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0B1220] border border-white/15 p-6 sm:p-8 shadow-2xl text-white max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleResetAndClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          aria-label="Tutup Dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {successInfo ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-[#1FA35A]/20 border border-[#1FA35A]/40 text-[#34D399] flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Permintaan Berhasil Diterima</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm mx-auto mb-4">
              {successInfo.message}
            </p>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300 mb-6">
              Nomor Referensi Pendaftaran: <span className="text-[#34D399]">{successInfo.id}</span>
            </div>
            <button
              onClick={handleResetAndClose}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white text-xs font-bold cursor-pointer"
            >
              Selesai
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-[#34D399] mb-1">
              <Sparkles className="w-4 h-4" />
              <span>KONSULTASI & DEMONSTRASI EKSKLUSIF</span>
            </div>
            <h3 className="text-xl font-extrabold text-white">Jadwalkan Demo Organisasi</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Diskusikan implementasi tenaga kerja AI yang disesuaikan dengan arsitektur data dan alur operasional perusahaan Anda.
            </p>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Lengkap Pemohon *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-[#34D399]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Kantor Perusahaan *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={workEmail}
                    onChange={(e) => setWorkEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-[#34D399]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Perusahaan / Organisasi *
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-[#34D399]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nomor WhatsApp / Kontak
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-[#34D399]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Skala Jumlah Karyawan
                  </label>
                  <select
                    value={companyScale}
                    onChange={(e) => setCompanyScale(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-[#34D399]"
                  >
                    <option value="1-10" className="bg-[#0B1220]">1 - 10 Karyawan</option>
                    <option value="11-50" className="bg-[#0B1220]">11 - 50 Karyawan</option>
                    <option value="51-200" className="bg-[#0B1220]">51 - 200 Karyawan</option>
                    <option value="200+" className="bg-[#0B1220]">Lebih dari 200 Karyawan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tujuan Pengajuan
                  </label>
                  <select
                    value={interestType}
                    onChange={(e) => setInterestType(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-[#34D399]"
                  >
                    <option value="demo_request" className="bg-[#0B1220]">Permintaan Demo Langsung</option>
                    <option value="enterprise_discussion" className="bg-[#0B1220]">Diskusi Kemitraan Enterprise</option>
                    <option value="direct_trial_or_subscription" className="bg-[#0B1220]">Uji Coba Terpandu</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Catatan Kebutuhan Khusus (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-[#34D399]"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white text-xs font-bold shadow-lg shadow-[#1FA35A]/25 hover:opacity-95 transition-opacity flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Mengirim ke Basis Data...</span>
                    </>
                  ) : (
                    <span>Kirim Pengajuan Demo</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
