import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  RefreshCw,
  CheckCircle2,
  Calendar,
  ShieldCheck,
  Zap,
  Mail,
  Phone,
  Building2,
  Search,
  Filter,
  X,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { ProspectRegistrationItem, ProspectAnalyticsResponse } from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const ProspectManagementScreen: React.FC = () => {
  const [prospects, setProspects] = useState<ProspectRegistrationItem[]>([]);
  const [analytics, setAnalytics] = useState<ProspectAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterInterest, setFilterInterest] = useState<string>('ALL');

  // Schedule meeting modal state
  const [schedulingProspect, setSchedulingProspect] = useState<ProspectRegistrationItem | null>(null);
  const [meetingDate, setMeetingDate] = useState<string>('');
  const [meetingLink, setMeetingLink] = useState<string>('https://meet.google.com/orc-demo-ai');
  const [meetingNotes, setMeetingNotes] = useState<string>('Live Executive Demo 15 Business Functions');

  const fetchData = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const [list, stats] = await Promise.all([
        api.getProspectRegistrations(),
        api.getProspectAnalytics(),
      ]);
      setProspects(list);
      setAnalytics(stats);
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/prospect-registrations',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat data prospek pendaftar.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memuat data prospek pendaftar.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Supabase Real-time Logical Replication Channel for live leads
    const channel = supabase
      .channel('public:prospect_registrations_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prospect_registrations' },
        (payload) => {
          console.log('[Supabase Realtime] prospect_registrations change:', payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSelectTrial = async (id: string) => {
    setProcessingId(id);
    setBackendError(null);
    try {
      await api.selectProspectForTrial(id, { trialStatus: 'SELECTED', trialNotes: 'Super Admin manual approval' });
      setMessage({ type: 'success', text: 'Prospek berhasil dipilih untuk alokasi 36 slot trial 7 hari.' });
      fetchData();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/prospect-registrations/${id}/select-trial`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memilih prospek trial.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memilih prospek trial.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleActivateTrial = async (id: string) => {
    setProcessingId(id);
    setBackendError(null);
    try {
      const res = await api.activateProspectTrial(id);
      setMessage({
        type: 'success',
        text: `Tenant trial aktif! ID: ${res.tenantId}, Saldo: ${res.initialCredits} kredit, Berlaku hingga: ${new Date(res.trialExpiresAt).toLocaleDateString('id-ID')}`,
      });
      fetchData();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/prospect-registrations/${id}/activate-trial`,
        status: err?.status || 500,
        message: err?.message || 'Gagal mengaktifkan tenant trial.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal mengaktifkan tenant trial.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingProspect) return;
    setProcessingId(schedulingProspect.id);
    setBackendError(null);
    try {
      await api.scheduleProspectMeeting(schedulingProspect.id, {
        scheduledDate: meetingDate || new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
        notes: meetingNotes,
        meetingLink,
      });
      setMessage({
        type: 'success',
        text: `Jadwal demo berhasil dikonfirmasi untuk ${schedulingProspect.companyName || schedulingProspect.fullName}.`,
      });
      setSchedulingProspect(null);
      fetchData();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/prospect-registrations/${schedulingProspect.id}/schedule-meeting`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menjadwalkan demo meeting.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal menjadwalkan demo meeting.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteProspect = async (id: string, name: string) => {
    if (!window.confirm(`Yakin ingin menghapus pendaftaran prospek "${name}"?`)) return;
    setProcessingId(id);
    try {
      await api.deleteProspectRegistration(id);
      setMessage({ type: 'success', text: `Pendaftaran prospek "${name}" berhasil dihapus.` });
      fetchData();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/prospect-registrations/${id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menghapus pendaftaran prospek.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const filteredProspects = prospects.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterInterest === 'ALL' || p.interestOption === filterInterest;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-400" />
            <span>Prospect Registrations & 36 Trial Slot Allocation</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pendaftar kuesioner publik, seleksi kuota eksklusif 36 slot trial 7 hari, dan auto-provisioning tenant trial 1,000 kredit.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start sm:self-auto flex items-center gap-1.5 text-xs font-semibold"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Honest Backend Error Banner */}
      <HonestErrorBanner error={backendError} onRetry={fetchData} isRetrying={isLoading} />

      {message && (
        <div
          className={`p-3 text-xs rounded-lg border ${
            message.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Analytics Banner */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block">Total Pendaftar</span>
            <span className="text-xl font-bold text-white mt-1 block">{analytics.totalLeads}</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block">Trial Slots Terpakai</span>
            <span className="text-xl font-bold text-emerald-400 mt-1 block">
              {analytics.trialSlotsOccupied} / {analytics.maxTrialSlots}
            </span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block">Jadwal Demo Terjadwal</span>
            <span className="text-xl font-bold text-indigo-400 mt-1 block">{analytics.scheduledDemos}</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block">Conversion Rate</span>
            <span className="text-xl font-bold text-cyan-400 mt-1 block">{analytics.conversionRate}%</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari nama, perusahaan, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={filterInterest}
            onChange={(e) => setFilterInterest(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Semua Opsi Minat</option>
            <option value="direct_trial_or_subscription">Direct Trial / Subscription</option>
            <option value="schedule_meeting_presentation">Demo Meeting Presentation</option>
            <option value="info_only">Info Only</option>
          </select>
        </div>
      </div>

      {/* Prospects Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Nama & Perusahaan</th>
                <th className="px-4 py-3">Kontak Email / Telp</th>
                <th className="px-4 py-3">Opsi Minat</th>
                <th className="px-4 py-3">Status Trial & Meeting</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredProspects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {isLoading ? 'Memuat prospek...' : 'Tidak ada prospek yang sesuai filter.'}
                  </td>
                </tr>
              ) : (
                filteredProspects.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white block">{p.fullName}</span>
                      <span className="text-[11px] text-slate-400">{p.companyName} ({p.industryName || 'General'})</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-300">
                      <div>{p.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                        {p.interestOption === 'direct_trial_or_subscription' ? 'Trial/Sub' : p.interestOption === 'schedule_meeting_presentation' ? 'Demo Meeting' : 'Info'}
                      </span>
                    </td>
                    <td className="px-4 py-3 space-y-1">
                      <div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.trialStatus === 'ACTIVATED' || p.trialStatus === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : p.trialStatus === 'SELECTED'
                              ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          Trial: {p.trialStatus}
                        </span>
                      </div>
                      {p.meetingStatus && p.meetingStatus !== 'NOT_SCHEDULED' && (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.meetingStatus === 'SCHEDULED' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}>
                            Demo: {p.meetingStatus}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {(p.trialStatus === 'PENDING' || p.trialStatus === 'REGISTERED') && (
                        <button
                          onClick={() => handleSelectTrial(p.id)}
                          disabled={processingId === p.id}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded text-[11px] transition"
                        >
                          Pilih Trial
                        </button>
                      )}
                      {p.trialStatus === 'SELECTED' && (
                        <button
                          onClick={() => handleActivateTrial(p.id)}
                          disabled={processingId === p.id}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-[11px] transition"
                        >
                          Aktivasi Tenant (1k Credit)
                        </button>
                      )}
                      {p.meetingStatus !== 'SCHEDULED' && (
                        <button
                          onClick={() => {
                            setSchedulingProspect(p);
                            const defaultD = new Date(Date.now() + 2 * 24 * 3600 * 1000);
                            setMeetingDate(defaultD.toISOString().slice(0, 16));
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold rounded text-[11px] border border-cyan-900/50 transition"
                        >
                          Jadwalkan Demo
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteProspect(p.id, p.fullName || p.companyName)}
                        disabled={processingId === p.id}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition inline-flex items-center"
                        title="Hapus / Tolak Pendaftaran Prospek"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule Meeting Modal */}
      {schedulingProspect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-cyan-400">
                <Calendar className="w-4 h-4" />
                <span>Jadwalkan Demo Meeting</span>
              </h3>
              <button
                onClick={() => setSchedulingProspect(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Menjadwalkan presentasi executive workforce untuk <strong className="text-white">{schedulingProspect.companyName || schedulingProspect.fullName}</strong> ({schedulingProspect.email}).
            </p>
            <form onSubmit={handleScheduleMeeting} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Tanggal & Jam Demo</label>
                <input
                  type="datetime-local"
                  required
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Link Google Meet / Zoom</label>
                <input
                  type="url"
                  required
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Catatan Demo</label>
                <input
                  type="text"
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSchedulingProspect(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={processingId !== null}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Konfirmasi Jadwal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
