import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  RefreshCw,
  Trash2,
  Search,
  Tag,
  X,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Info,
  Code2,
  Cpu,
  TrendingUp,
  Megaphone,
  DollarSign,
  Users,
  Settings,
  Palette,
  Headset,
  Shield,
  Zap,
  Database,
  Terminal,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../../lib/api';
import { DepartmentCategoryRecord, RawApiExchangeLog } from '../../types';
import { HonestErrorBanner, HonestErrorInfo } from '../HonestErrorBanner';

export const ICON_OPTIONS = [
  { key: 'cpu', label: 'CPU • Teknologi & AI Engine', icon: Cpu },
  { key: 'trending-up', label: 'Trending • Penjualan & Bisnis', icon: TrendingUp },
  { key: 'megaphone', label: 'Megaphone • Pemasaran & Media', icon: Megaphone },
  { key: 'dollar-sign', label: 'Dollar • Finansial & Akuntansi', icon: DollarSign },
  { key: 'users', label: 'Users • SDM & Manajemen Talenta', icon: Users },
  { key: 'settings', label: 'Settings • Operasional & Logistik', icon: Settings },
  { key: 'palette', label: 'Palette • Kreatif & Visual Studio', icon: Palette },
  { key: 'headset', label: 'Headset • Customer Support & Helpdesk', icon: Headset },
  { key: 'shield', label: 'Shield • Legal, Audit & Kepatuhan', icon: Shield },
  { key: 'zap', label: 'Zap • Otomasi, Triggers & Workflows', icon: Zap },
  { key: 'database', label: 'Database • Data Engineering & Analitik', icon: Database },
  { key: 'building', label: 'Building • Eksekutif & C-Level', icon: Building2 },
  { key: 'tag', label: 'Tag • Kategori Umum', icon: Tag },
];

export const renderDepartmentIcon = (iconKey?: string, className = 'w-4 h-4') => {
  const match = ICON_OPTIONS.find((opt) => opt.key === iconKey);
  if (match) {
    const IconComponent = match.icon;
    return <IconComponent className={className} />;
  }
  return <Tag className={className} />;
};

export const DepartmentCategoriesTab: React.FC = () => {
  const [categories, setCategories] = useState<DepartmentCategoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Diagnostics & Raw Logs
  const [rawLogs, setRawLogs] = useState<RawApiExchangeLog[]>([]);
  const [showRawInspector, setShowRawInspector] = useState<boolean>(true);
  const [selectedRawLog, setSelectedRawLog] = useState<RawApiExchangeLog | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // Modal - Create
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newCode, setNewCode] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newIcon, setNewIcon] = useState<string>('cpu');
  const [newActive, setNewActive] = useState<boolean>(true);

  // Modal - Edit
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<DepartmentCategoryRecord | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editIcon, setEditIcon] = useState<string>('tag');
  const [editActive, setEditActive] = useState<boolean>(true);

  const fetchCategories = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const { categories: data, rawLog } = await api.getDepartmentCategories();
      setCategories(data);
      const logs = api.getRawExchangeLogs();
      setRawLogs(logs);
      if (rawLog && (!selectedRawLog || selectedRawLog.endpoint.includes('department-categories'))) {
        setSelectedRawLog(rawLog);
      }
    } catch (err: any) {
      setBackendError({
        endpoint: '/public/department-categories',
        status: err?.status || 502,
        message: err?.message || 'Gagal memuat kategori departemen dari GET /public/department-categories.',
        rawDetails: err?.rawDetails || err,
      });
      setRawLogs(api.getRawExchangeLogs());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;

    setIsCreating(true);
    setBackendError(null);
    setMessage(null);

    try {
      const result = await api.createDepartmentCategory({
        category_code: newCode.trim().toUpperCase(),
        category_name: newName.trim(),
        description: newDesc.trim() || undefined,
        icon_key: newIcon,
        is_active: newActive,
      });

      const updatedLogs = api.getRawExchangeLogs();
      setRawLogs(updatedLogs);
      setSelectedRawLog(result.rawLog);

      setMessage({
        type: 'success',
        text: `Kategori departemen "${result.record.category_name}" (${result.record.category_code}) berhasil dibuat melalui POST /public/department-categories.`,
      });

      setIsCreateOpen(false);
      // Reset form
      setNewCode('');
      setNewName('');
      setNewDesc('');
      setNewIcon('cpu');
      setNewActive(true);

      await fetchCategories();
    } catch (err: any) {
      setBackendError({
        endpoint: '/public/department-categories',
        status: err?.status || 500,
        message: err?.message || 'Gagal membuat kategori departemen baru di POST /public/department-categories.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const openEditModal = (item: DepartmentCategoryRecord) => {
    setEditingItem(item);
    setEditName(item.category_name);
    setEditDesc(item.description || '');
    setEditIcon(item.icon_key || 'tag');
    setEditActive(item.is_active);
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editName.trim()) return;

    setIsUpdating(true);
    setBackendError(null);

    try {
      const updated = await api.updateDepartmentCategory(editingItem.id, {
        category_name: editName.trim(),
        description: editDesc.trim() || undefined,
        icon_key: editIcon,
        is_active: editActive,
      });

      setMessage({
        type: 'success',
        text: `Kategori departemen "${updated.category_name}" berhasil diperbarui.`,
      });
      setIsEditOpen(false);
      await fetchCategories();
    } catch (err: any) {
      setBackendError({
        endpoint: `/public/department-categories/${editingItem.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memperbarui kategori departemen.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (item: DepartmentCategoryRecord) => {
    if (!window.confirm(`Yakin ingin menghapus kategori departemen "${item.category_name}" (${item.category_code})?`)) return;

    try {
      await api.deleteDepartmentCategory(item.id);
      setMessage({
        type: 'success',
        text: `Kategori departemen "${item.category_name}" (${item.category_code}) berhasil dihapus.`,
      });
      await fetchCategories();
    } catch (err: any) {
      setBackendError({
        endpoint: `/public/department-categories/${item.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menghapus kategori departemen.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const handleToggleActive = async (item: DepartmentCategoryRecord) => {
    try {
      await api.updateDepartmentCategory(item.id, {
        is_active: !item.is_active,
      });
      await fetchCategories();
    } catch (err: any) {
      setBackendError({
        endpoint: `/public/department-categories/${item.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal mengubah status aktifasi.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const handleCopyJson = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      // Status filter
      if (statusFilter === 'ACTIVE' && !cat.is_active) return false;
      if (statusFilter === 'INACTIVE' && cat.is_active) return false;

      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        cat.category_code.toLowerCase().includes(q) ||
        cat.category_name.toLowerCase().includes(q) ||
        (cat.description && cat.description.toLowerCase().includes(q)) ||
        (cat.icon_key && cat.icon_key.toLowerCase().includes(q))
      );
    });
  }, [categories, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Honest Backend Error Banner */}
      <HonestErrorBanner
        error={backendError}
        onRetry={fetchCategories}
        isRetrying={isLoading}
        title="Laporan Status Endpoint /public/department-categories (Domain 3)"
      />

      {message && (
        <div
          className={`p-3 text-xs rounded-lg border flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* LANGKAH 0: AUDIT NOTICE & ARCHITECTURAL SUMMARY CARD */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/30 border border-cyan-800/60 rounded-xl p-5 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-700 text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Laporan Audit Relasi: POST /public/department-categories vs /admin/master-data
                </h3>
                <span className="px-2 py-0.5 rounded bg-cyan-900/80 border border-cyan-600 text-cyan-200 text-[10px] font-mono font-bold">
                  Kesimpulan: (b) Jalur Spesifik Terpisah
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Domain 3 (MasterDataRoutes.kt) • Dedicated Table: <code className="text-cyan-300 font-mono">department_categories</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kategori Departemen</span>
            </button>
            <button
              onClick={fetchCategories}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Audit Proof Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg space-y-1">
            <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Skema Entitas Spesifik</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Menggunakan skema <code className="text-white font-mono">DepartmentCategoryRecord</code>:
              (<code className="text-cyan-300">category_code</code>, <code className="text-cyan-300">category_name</code>, <code className="text-cyan-300">icon_key</code>, <code className="text-cyan-300">is_active</code>).
            </p>
            <p className="text-[10px] text-slate-400">
              Jauh lebih spesifik dibanding generic key-value (<code className="font-mono text-slate-300">category, key, value</code>).
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg space-y-1">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tabel Sasaran Berbeda</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Endpoint ini menulis langsung ke tabel <code className="text-emerald-300 font-mono">department_categories</code> (Domain 3).
            </p>
            <p className="text-[10px] text-slate-400">
              Bukan tabel generik <code className="font-mono text-slate-300">admin_master_data</code> yang dikelola oleh Domain 16/91.
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg space-y-1">
            <div className="font-semibold text-purple-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Kewenangan Super Admin & Client App</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              <span className="text-cyan-300 font-mono">POST</span> dikelola platform-level (Super Admin), dan <span className="text-emerald-300 font-mono">GET</span> dikonsumsi Aplikasi Client untuk dropdown organisasi workforce.
            </p>
            <p className="text-[10px] text-slate-400">
              Master Data Management terpusat di Super Admin.
            </p>
          </div>
        </div>
      </div>

      {/* LANGKAH 2: LIVE RAW REQUEST & RESPONSE TELEMETRY INSPECTOR */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div
          onClick={() => setShowRawInspector(!showRawInspector)}
          className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between cursor-pointer select-none hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-white tracking-wide">
              Live HTTP Exchange & Audit Raw Telemetry (Validasi Bukti Mentah)
            </span>
            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-cyan-300 border border-slate-700">
              {rawLogs.length} Exchange Terkini
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{showRawInspector ? 'Sembunyikan Telemetri' : 'Tampilkan Bukti Mentah'}</span>
            {showRawInspector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {showRawInspector && (
          <div className="p-4 space-y-4">
            {/* Quick Log Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="text-[11px] text-slate-400 shrink-0 font-medium">Pilih Log Transaksi:</span>
              {rawLogs.length === 0 ? (
                <span className="text-slate-500 italic text-[11px]">Belum ada exchange terekam.</span>
              ) : (
                rawLogs.map((log) => {
                  const isSelected = selectedRawLog?.id === log.id;
                  const isPost = log.method === 'POST';
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedRawLog(log)}
                      className={`px-2.5 py-1 rounded-md font-mono text-[11px] shrink-0 transition flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-cyan-950 border-cyan-500 text-cyan-200 shadow-sm'
                          : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span
                        className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                          isPost ? 'bg-cyan-800 text-cyan-100' : 'bg-emerald-800 text-emerald-100'
                        }`}
                      >
                        {log.method}
                      </span>
                      <span>{log.endpoint}</span>
                      <span
                        className={`text-[10px] ${
                          log.status >= 200 && log.status < 300 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        ({log.status})
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Log Inspector */}
            {selectedRawLog ? (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-3 font-mono text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-xs ${
                        selectedRawLog.method === 'POST' ? 'bg-cyan-600 text-white' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {selectedRawLog.method}
                    </span>
                    <span className="text-white font-semibold">{selectedRawLog.endpoint}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        selectedRawLog.status >= 200 && selectedRawLog.status < 300
                          ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                          : 'bg-rose-950 border border-rose-700 text-rose-300'
                      }`}
                    >
                      HTTP {selectedRawLog.status}
                    </span>
                    {selectedRawLog.durationMs !== undefined && (
                      <span className="text-slate-500 text-[11px]">({selectedRawLog.durationMs}ms)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{new Date(selectedRawLog.timestamp).toLocaleTimeString('id-ID')}</span>
                    <button
                      onClick={() =>
                        handleCopyJson(
                          JSON.stringify(
                            {
                              method: selectedRawLog.method,
                              endpoint: selectedRawLog.endpoint,
                              status: selectedRawLog.status,
                              timestamp: selectedRawLog.timestamp,
                              requestPayload: selectedRawLog.requestBody || null,
                              responsePayload: selectedRawLog.responseBody || null,
                            },
                            null,
                            2
                          ),
                          selectedRawLog.id
                        )
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] transition border border-slate-700"
                    >
                      {copiedLogId === selectedRawLog.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Disalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin JSON Mentah</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Request Payload */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-cyan-400 font-semibold flex items-center justify-between">
                      <span>Request Payload (Body):</span>
                      <span className="text-[10px] text-slate-500">
                        {selectedRawLog.requestBody ? 'application/json' : 'No Body (GET)'}
                      </span>
                    </div>
                    <pre className="bg-slate-900/90 border border-slate-800 p-2.5 rounded text-[11px] text-slate-300 overflow-x-auto max-h-48">
                      {selectedRawLog.requestBody
                        ? JSON.stringify(selectedRawLog.requestBody, null, 2)
                        : '// GET request: tidak ada request body payload'}
                    </pre>
                  </div>

                  {/* Response Payload */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-emerald-400 font-semibold flex items-center justify-between">
                      <span>Response Payload:</span>
                      <span className="text-[10px] text-slate-500">application/json</span>
                    </div>
                    <pre className="bg-slate-900/90 border border-slate-800 p-2.5 rounded text-[11px] text-emerald-300 overflow-x-auto max-h-48">
                      {selectedRawLog.responseBody
                        ? JSON.stringify(selectedRawLog.responseBody, null, 2)
                        : '// Kosong atau respons null'}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">
                Pilih salah satu log di atas untuk menginspeksi payload mentah.
              </div>
            )}
          </div>
        )}
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan category_code, category_name, atau icon_key..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400">Status:</span>
          <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded font-medium transition ${
                statusFilter === 'ALL' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({categories.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1 rounded font-medium transition ${
                statusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Aktif ({categories.filter((c) => c.is_active).length})
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1 rounded font-medium transition ${
                statusFilter === 'INACTIVE' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Nonaktif ({categories.filter((c) => !c.is_active).length})
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono ml-auto sm:ml-2">
            Menampilkan <span className="text-cyan-400 font-bold">{filteredCategories.length}</span> item
          </div>
        </div>
      </div>

      {/* DEPARTMENT CATEGORIES TABLE */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Icon & Kode (category_code)</th>
                <th className="px-4 py-3.5">Nama Departemen (category_name)</th>
                <th className="px-4 py-3.5">Deskripsi Operasional</th>
                <th className="px-4 py-3.5">Icon Key</th>
                <th className="px-4 py-3.5 text-center">Status (is_active)</th>
                <th className="px-4 py-3.5 text-right">Aksi Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                        <span>Memuat data department categories dari backend...</span>
                      </div>
                    ) : (
                      'Tidak ada kategori departemen yang sesuai dengan filter pencarian.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredCategories.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-cyan-400 shrink-0">
                          {renderDepartmentIcon(item.icon_key, 'w-4 h-4')}
                        </div>
                        <span className="font-mono font-bold text-cyan-300 tracking-wide">
                          {item.category_code}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {item.category_name}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-sm">
                      <p className="line-clamp-2">{item.description || '-'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                        {item.icon_key || 'tag'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(item)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                          item.is_active
                            ? 'bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 hover:bg-emerald-900'
                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                        title="Klik untuk mengubah status aktif/nonaktif"
                      >
                        {item.is_active ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Aktif</span>
                          </>
                        ) : (
                          <>
                            <X className="w-3 h-3 text-slate-500" />
                            <span>Nonaktif</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                          title="Edit Kategori Departemen"
                        >
                          <Pencil className="w-3.5 h-3.5 text-cyan-400" />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-400 transition"
                          title="Hapus Kategori Departemen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: TAMBAH KATEGORI DEPARTEMEN BARU (EXACT DepartmentCategoryRecord SCHEMA) */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Tambah Kategori Departemen Baru</h3>
                  <p className="text-[11px] text-slate-400">
                    Kirim data ke <code className="text-cyan-300 font-mono">POST /api/v1/public/department-categories</code>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Kode Kategori Departemen (<code className="text-cyan-300">category_code</code>) *
                </label>
                <input
                  type="text"
                  required
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="Contoh: DATA_ANALYTICS, CUSTOMER_SUCCESS"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono uppercase focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Identifier kode unik tingkat sistem (uppercase, tanpa spasi, gunakan underscore).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Kategori Departemen (<code className="text-cyan-300">category_name</code>) *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contoh: Data & Business Intelligence"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Nama tampilan resmi yang muncul di dropdown seleksi departemen aplikasi client.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Deskripsi Operasional (<code className="text-cyan-300">description</code>)
                </label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Penjelasan cakupan peran, tugas, dan lingkup tanggung jawab departemen..."
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Ikon Departemen (<code className="text-cyan-300">icon_key</code>)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ICON_OPTIONS.map((opt) => {
                    const isSelected = newIcon === opt.key;
                    const IconComp = opt.icon;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setNewIcon(opt.key)}
                        className={`p-2 rounded-lg text-left text-xs transition border flex items-center gap-2 ${
                          isSelected
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <IconComp className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate font-mono text-[11px]">{opt.key}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <p className="text-xs font-semibold text-white">
                    Status Aktifasi (<code className="text-cyan-300">is_active</code>)
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Jika aktif, kategori akan langsung terlihat di dropdown client.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewActive(!newActive)}
                  className={`p-1.5 rounded-lg border transition flex items-center gap-1.5 text-xs font-semibold ${
                    newActive
                      ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {newActive ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Aktif (true)</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 text-slate-500" />
                      <span>Nonaktif (false)</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newCode.trim() || !newName.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition disabled:opacity-50 flex items-center gap-2 shadow"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengirim ke POST...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Simpan Kategori Departemen</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT KATEGORI DEPARTEMEN */}
      {isEditOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Edit Kategori Departemen</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Kode: {editingItem.category_code}</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs flex items-center gap-2">
                <span className="text-slate-400">Kode Unik Sistem:</span>
                <span className="font-mono font-bold text-cyan-300">{editingItem.category_code}</span>
                <span className="text-[10px] text-slate-500 ml-auto">(Immutable Key)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Kategori Departemen (<code className="text-cyan-300">category_name</code>) *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Deskripsi Operasional (<code className="text-cyan-300">description</code>)
                </label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Ikon Departemen (<code className="text-cyan-300">icon_key</code>)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ICON_OPTIONS.map((opt) => {
                    const isSelected = editIcon === opt.key;
                    const IconComp = opt.icon;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setEditIcon(opt.key)}
                        className={`p-2 rounded-lg text-left text-xs transition border flex items-center gap-2 ${
                          isSelected
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <IconComp className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate font-mono text-[11px]">{opt.key}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <p className="text-xs font-semibold text-white">
                    Status Aktifasi (<code className="text-cyan-300">is_active</code>)
                  </p>
                  <p className="text-[10px] text-slate-400">Ketersediaan kategori untuk dropdown client.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditActive(!editActive)}
                  className={`p-1.5 rounded-lg border transition flex items-center gap-1.5 text-xs font-semibold ${
                    editActive
                      ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {editActive ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Aktif (true)</span>
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 text-slate-500" />
                      <span>Nonaktif (false)</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUpdating || !editName.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition disabled:opacity-50 flex items-center gap-2 shadow"
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan Perubahan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
