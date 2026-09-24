import React, { useState } from 'react';
import {
  Clock,
  Search,
  Filter,
  ArrowDownRight,
  ArrowUpRight,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Info,
  Layers,
  CheckCircle2,
  Calendar,
  Hash,
} from 'lucide-react';

export interface CreditReservation {
  id: string;
  tenant_id: string;
  estimated_cost: number;
  actual_cost: number | null;
  status: 'reserved' | 'consumed' | 'refunded';
  reference_type: string;
  reference_id: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface CreditTransaction {
  id: string;
  transaction_type: 'topup' | 'consumed' | 'refunded' | 'reserved' | 'adjustment';
  amount: number;
  balance_after: number;
  reference_id?: string;
  description?: string;
  created_at: string;
  metadata?: Record<string, any>;
}

interface UsageHistoryScreenProps {
  reservations: CreditReservation[];
  transactions: CreditTransaction[];
  loading: boolean;
  onRefresh: () => void;
}

export function UsageHistoryScreen({
  reservations,
  transactions,
  loading,
  onRefresh,
}: UsageHistoryScreenProps) {
  const [activeView, setActiveView] = useState<'reservations' | 'ledger'>('reservations');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // Filtered reservations
  const filteredReservations = reservations.filter((r) => {
    const matchesSearch =
      (r.reference_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.reference_type || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filtered transactions
  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      (t.reference_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.transaction_type === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'consumed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Selesai / Terpakai
          </span>
        );
      case 'reserved':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Direservasi
          </span>
        );
      case 'refunded':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Dikembalikan
          </span>
        );
      case 'topup':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Top Up Saldo
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info & Switch View */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-400" />
            <span>Riwayat Konsumsi Kredit & Transaksi Operasional</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Audit rincian pemakaian kredit per eksekusi tugas AI dengan transparansi seluruh parameter pengali biaya.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => {
              setActiveView('reservations');
              setStatusFilter('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeView === 'reservations'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Reservasi Tugas ({reservations.length})
          </button>
          <button
            onClick={() => {
              setActiveView('ledger');
              setStatusFilter('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeView === 'ledger'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Buku Besar Mutasi ({transactions.length})
          </button>
        </div>
      </div>

      {/* Filter & Bar Pencarian */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari ID referensi, tipe pekerjaan..." // allowlist: HTML input field hint
            className="w-full bg-slate-950 border border-slate-750 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-750 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Semua Status</option>
            {activeView === 'reservations' ? (
              <>
                <option value="consumed">Selesai (Consumed)</option>
                <option value="reserved">Direservasi (Reserved)</option>
                <option value="refunded">Dikembalikan (Refunded)</option>
              </>
            ) : (
              <>
                <option value="topup">Top Up</option>
                <option value="consumed">Konsumsi</option>
                <option value="refunded">Pengembalian</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Tabel Data & Drill-Down Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Daftar Tabel */}
        <div className={`${selectedItem ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-3`}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {activeView === 'reservations' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-4 font-semibold">Tipe & Referensi</th>
                      <th className="py-3 px-4 font-semibold">Estimasi Awal</th>
                      <th className="py-3 px-4 font-semibold">Biaya Riil</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Waktu Eksekusi</th>
                      <th className="py-3 px-4 font-semibold text-right">Rincian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredReservations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Tidak ada data reservasi kredit yang cocok dengan filter.
                        </td>
                      </tr>
                    ) : (
                      filteredReservations.map((res) => {
                        const isSelected = selectedItem?.id === res.id;
                        return (
                          <tr
                            key={res.id}
                            onClick={() => setSelectedItem(res)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-slate-800/80'
                                : 'hover:bg-slate-850/50'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">
                                {res.reference_type || 'AI_TASK'}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono truncate max-w-[140px]">
                                {res.reference_id}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              {res.estimated_cost} AI Credits
                            </td>
                            <td className="py-3 px-4 font-semibold text-emerald-400">
                              {res.actual_cost !== null ? `${res.actual_cost} AI Credits` : '-'}
                            </td>
                            <td className="py-3 px-4">{getStatusBadge(res.status)}</td>
                            <td className="py-3 px-4 text-slate-400 text-[11px]">
                              {new Date(res.created_at).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <ChevronRight className="w-4 h-4 text-slate-500 inline" />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-4 font-semibold">Tipe Mutasi</th>
                      <th className="py-3 px-4 font-semibold">Deskripsi</th>
                      <th className="py-3 px-4 font-semibold">Nominal</th>
                      <th className="py-3 px-4 font-semibold">Saldo Akhir</th>
                      <th className="py-3 px-4 font-semibold">Waktu</th>
                      <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Tidak ada catatan mutasi kredit.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => {
                        const isSelected = selectedItem?.id === tx.id;
                        const isPositive = tx.transaction_type === 'topup' || tx.transaction_type === 'refunded';

                        return (
                          <tr
                            key={tx.id}
                            onClick={() => setSelectedItem(tx)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-slate-800/80'
                                : 'hover:bg-slate-850/50'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                {isPositive ? (
                                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <ArrowDownRight className="w-3.5 h-3.5 text-indigo-400" />
                                )}
                                <span className="font-semibold text-white capitalize">
                                  {tx.transaction_type}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-300 max-w-xs truncate">
                              {tx.description || tx.reference_id || '-'}
                            </td>
                            <td
                              className={`py-3 px-4 font-bold ${
                                isPositive ? 'text-emerald-400' : 'text-slate-200'
                              }`}
                            >
                              {isPositive ? '+' : '-'}
                              {Math.abs(tx.amount).toLocaleString('id-ID')} AI Credits
                            </td>
                            <td className="py-3 px-4 text-slate-400">
                              {tx.balance_after?.toLocaleString('id-ID')} AI Credits
                            </td>
                            <td className="py-3 px-4 text-slate-500 text-[11px]">
                              {new Date(tx.created_at).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <ChevronRight className="w-4 h-4 text-slate-500 inline" />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Kolom Kanan: Drill-Down Rincian Biaya (Cost Breakdown Modal/Panel) */}
        {selectedItem && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 h-fit">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-bold text-white">Transparansi Rincian Biaya</h4>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-xs text-slate-500 hover:text-white"
              >
                Tutup
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block">ID Identifikasi:</span>
                <span className="font-mono text-white text-[11px] break-all">{selectedItem.id}</span>
              </div>

              {selectedItem.reference_type && (
                <div>
                  <span className="text-slate-500 block">Tipe Aktivitas / Domain:</span>
                  <span className="font-semibold text-emerald-400">{selectedItem.reference_type}</span>
                </div>
              )}

              {selectedItem.reference_id && (
                <div>
                  <span className="text-slate-500 block">Nomor Referensi Pekerjaan:</span>
                  <span className="font-mono text-slate-300 text-[11px] break-all">
                    {selectedItem.reference_id}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 rounded-xl">
                <div>
                  <span className="text-slate-500 text-[10px] block">Estimasi Awal</span>
                  <span className="font-bold text-slate-200">
                    {selectedItem.estimated_cost !== undefined
                      ? `${selectedItem.estimated_cost} AI Credits`
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Biaya Aktual Akhir</span>
                  <span className="font-bold text-emerald-400">
                    {selectedItem.actual_cost !== undefined && selectedItem.actual_cost !== null
                      ? `${selectedItem.actual_cost} AI Credits`
                      : selectedItem.amount !== undefined
                      ? `${Math.abs(selectedItem.amount)} AI Credits`
                      : '-'}
                  </span>
                </div>
              </div>

              {/* Rincian Parameter Pengali Formula */}
              {selectedItem.metadata && Object.keys(selectedItem.metadata).length > 0 && (
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">
                    Parameter Formula Pemakaian:
                  </span>
                  <div className="bg-slate-950 p-3 rounded-xl space-y-1.5 text-[11px] text-slate-300 font-mono">
                    {selectedItem.metadata.base_units !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Unit Dasar (Base):</span>
                        <span>{selectedItem.metadata.base_units}</span>
                      </div>
                    )}
                    {selectedItem.metadata.complexity_multiplier !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Kompleksitas:</span>
                        <span>{selectedItem.metadata.complexity_multiplier}x</span>
                      </div>
                    )}
                    {selectedItem.metadata.model_used && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Model AI:</span>
                        <span className="text-emerald-400">{selectedItem.metadata.model_used}</span>
                      </div>
                    )}
                    {selectedItem.metadata.job_type && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Pekerjaan:</span>
                        <span>{selectedItem.metadata.job_type}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <span className="text-slate-500 block">Stempel Waktu:</span>
                <span className="text-slate-300">
                  {new Date(selectedItem.created_at).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
