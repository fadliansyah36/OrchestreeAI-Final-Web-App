import React, { useState, useEffect, useMemo } from 'react';
import {
  Puzzle,
  Plus,
  RefreshCw,
  Upload,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  Power,
  Search,
  Pencil,
  FileCode,
  X,
  AlertTriangle,
  Info,
  Layers,
  Cpu,
  Check,
} from 'lucide-react';
import { api } from '../lib/api';
import { SkillPluginItem } from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const SkillPluginManagementScreen: React.FC = () => {
  const [plugins, setPlugins] = useState<SkillPluginItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRuntime, setSelectedRuntime] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Create / Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<'package' | 'manual'>('package');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form: Package Upload
  const [pkgName, setPkgName] = useState<string>('');
  const [pkgVersion, setPkgVersion] = useState<string>('1.0.0');
  const [pkgAuthor, setPkgAuthor] = useState<string>('Autonomous Labs Team');
  const [pkgManifestJson, setPkgManifestJson] = useState<string>(
    JSON.stringify(
      {
        name: 'custom-skill-plugin',
        version: '1.0.0',
        runtime: 'WASM_V8',
        permissions: ['network.egress.limited', 'fs.read.sandbox'],
        entrypoint: 'index.wasm',
      },
      null,
      2
    )
  );
  const [pkgSkillDefMd, setPkgSkillDefMd] = useState<string>(
    `# Skill Definition\n\n## Description\nDeskripsi kapabilitas fungsional skill plugin.\n\n## Usage Instructions\n1. Panggil saat analisis data dimulai.\n2. Kembalikan payload format JSON standar.`
  );
  const [pkgZipBase64, setPkgZipBase64] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  // Form: Manual Register
  const [manualName, setManualName] = useState<string>('');
  const [manualVersion, setManualVersion] = useState<string>('1.0.0');
  const [manualAuthor, setManualAuthor] = useState<string>('');
  const [manualRuntime, setManualRuntime] = useState<string>('WASM_V8');
  const [manualDescription, setManualDescription] = useState<string>('');

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingPlugin, setEditingPlugin] = useState<SkillPluginItem | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editVersion, setEditVersion] = useState<string>('');
  const [editAuthor, setEditAuthor] = useState<string>('');
  const [editRuntime, setEditRuntime] = useState<string>('WASM_V8');
  const [editDescription, setEditDescription] = useState<string>('');
  const [isEditSubmitting, setIsEditSubmitting] = useState<boolean>(false);

  // Detail Modal State
  const [viewingPlugin, setViewingPlugin] = useState<SkillPluginItem | null>(null);

  const fetchPlugins = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const data = await api.getSkillPlugins();
      setPlugins(data);
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/skill-plugins',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat daftar plugin keahlian.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memuat daftar plugin keahlian.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  const handleToggleStatus = async (plugin: SkillPluginItem) => {
    const nextStatus = plugin.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await api.updateSkillPluginStatus(plugin.id, nextStatus);
      setMessage({ type: 'success', text: `Status plugin "${plugin.name}" diubah menjadi ${nextStatus}.` });
      fetchPlugins();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/skill-plugins/${plugin.id}/status`,
        status: err?.status || 500,
        message: err?.message || 'Gagal mengubah status plugin.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const handleDeletePlugin = async (plugin: SkillPluginItem) => {
    if (!window.confirm(`Yakin ingin menghapus plugin keahlian "${plugin.name}"?`)) return;
    try {
      await api.deleteSkillPlugin(plugin.id);
      setMessage({ type: 'success', text: `Plugin "${plugin.name}" berhasil dihapus.` });
      fetchPlugins();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/skill-plugins/${plugin.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menghapus plugin.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setPkgZipBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (uploadMode === 'package') {
        if (!pkgName.trim()) {
          setMessage({ type: 'error', text: 'Nama plugin wajib diisi.' });
          return;
        }
        await api.uploadSkillPlugin({
          pluginName: pkgName.trim(),
          version: pkgVersion.trim() || '1.0.0',
          author: pkgAuthor.trim() || 'Custom Squad',
          manifestJson: pkgManifestJson,
          skillDefinitionMd: pkgSkillDefMd,
          zipBase64: pkgZipBase64 || undefined,
        });
        setMessage({ type: 'success', text: `Paket plugin "${pkgName}" berhasil diunggah dan diverifikasi.` });
      } else {
        if (!manualName.trim()) {
          setMessage({ type: 'error', text: 'Nama plugin wajib diisi.' });
          return;
        }
        await api.createSkillPlugin({
          name: manualName.trim(),
          version: manualVersion.trim() || '1.0.0',
          author: manualAuthor.trim() || 'Admin Registered',
          executionRuntime: manualRuntime,
          description: manualDescription.trim() || 'Ekstensi kapabilitas mandiri',
          status: 'ACTIVE',
        });
        setMessage({ type: 'success', text: `Plugin "${manualName}" berhasil didaftarkan secara manual.` });
      }
      setIsUploadModalOpen(false);
      resetUploadForm();
      fetchPlugins();
    } catch (err: any) {
      setBackendError({
        endpoint: uploadMode === 'package' ? '/admin/skill-plugins/upload' : '/admin/skill-plugins',
        status: err?.status || 500,
        message: err?.message || 'Gagal mendaftarkan plugin.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetUploadForm = () => {
    setPkgName('');
    setPkgVersion('1.0.0');
    setPkgAuthor('Autonomous Labs Team');
    setPkgZipBase64('');
    setFileName('');
    setManualName('');
    setManualVersion('1.0.0');
    setManualAuthor('');
    setManualDescription('');
  };

  const openEditModal = (plugin: SkillPluginItem) => {
    setEditingPlugin(plugin);
    setEditName(plugin.name);
    setEditVersion(plugin.version);
    setEditAuthor(plugin.author);
    setEditRuntime(plugin.executionRuntime);
    setEditDescription(plugin.description || '');
    setIsEditModalOpen(true);
  };

  const handleUpdatePlugin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlugin || !editName.trim()) return;
    setIsEditSubmitting(true);
    try {
      await api.updateSkillPlugin(editingPlugin.id, {
        name: editName.trim(),
        version: editVersion.trim(),
        author: editAuthor.trim(),
        executionRuntime: editRuntime,
        description: editDescription.trim(),
      });
      setMessage({ type: 'success', text: `Plugin "${editName}" berhasil diperbarui.` });
      setIsEditModalOpen(false);
      fetchPlugins();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/skill-plugins/${editingPlugin.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memperbarui plugin.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  // Filtered Plugins List
  const filteredPlugins = useMemo(() => {
    return plugins.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.executionRuntime.toLowerCase().includes(searchQuery.toLowerCase());
      const matchRuntime = selectedRuntime === 'ALL' || p.executionRuntime === selectedRuntime;
      const matchStatus = selectedStatus === 'ALL' || p.status === selectedStatus;
      return matchSearch && matchRuntime && matchStatus;
    });
  }, [plugins, searchQuery, selectedRuntime, selectedStatus]);

  // Statistics
  const totalPlugins = plugins.length;
  const activePlugins = plugins.filter((p) => p.status === 'ACTIVE').length;
  const wasmPlugins = plugins.filter((p) => p.executionRuntime.includes('WASM')).length;
  const pythonPlugins = plugins.filter((p) => p.executionRuntime.includes('PYTHON')).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Puzzle className="w-5 h-5 text-indigo-400" />
            <span>Autonomous Skill Plugin & Extension Registry</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Ekosistem plugin runtime WASM (V8) dan Python 3.11 isolated sandbox untuk kapabilitas fungsional karyawan AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPlugins}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/20 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload / Daftarkan Plugin</span>
          </button>
        </div>
      </div>

      {backendError && <HonestErrorBanner error={backendError} onRetry={fetchPlugins} />}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Plugins</span>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-xl font-bold text-white">{totalPlugins}</div>
          <div className="text-[11px] text-slate-500">Tercatat di sistem</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active & Running</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">{activePlugins}</div>
          <div className="text-[11px] text-emerald-500/70">Siap dieksekusi agen</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>WASM Sandboxes</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-indigo-400">{wasmPlugins}</div>
          <div className="text-[11px] text-indigo-400/70">Near-native safe execution</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Python Sandboxes</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400">{pythonPlugins}</div>
          <div className="text-[11px] text-amber-400/70">Secure containerized runtime</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-900/40 border border-slate-800/80 p-3 rounded-xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari plugin berdasarkan nama, runtime, atau deskripsi..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedRuntime}
            onChange={(e) => setSelectedRuntime(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Semua Runtime</option>
            <option value="WASM_V8">WASM_V8</option>
            <option value="PYTHON_311_SANDBOX">PYTHON_311_SANDBOX</option>
            <option value="ONNX_RUNTIME">ONNX_RUNTIME</option>
            <option value="NODE_20_WASM">NODE_20_WASM</option>
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
            <option value="DISABLED">DISABLED</option>
          </select>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 text-xs rounded-lg border flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Plugins Grid */}
      {filteredPlugins.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
          Tidak ada plugin yang cocok dengan kriteria pencarian.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlugins.map((plugin) => (
            <div
              key={plugin.id}
              className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4 hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white text-sm truncate">{plugin.name}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                      v{plugin.version}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {plugin.description || 'Extension capability package untuk otonomi proses AI.'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditModal(plugin)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition"
                    title="Edit Plugin"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeletePlugin(plugin)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                    title="Hapus Plugin"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-400 border-t border-slate-800/60 pt-3">
                <div className="flex justify-between items-center">
                  <span>Runtime Engine:</span>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-400 font-semibold">
                    {plugin.executionRuntime}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Author / Squad:</span>
                  <span className="text-slate-200 truncate max-w-[180px]">{plugin.author}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Status Eksekusi:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      plugin.status === 'ACTIVE'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : plugin.status === 'PENDING_APPROVAL'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {plugin.status}
                  </span>
                </div>
                {plugin.installedAt && (
                  <div className="flex justify-between items-center text-[11px] text-slate-500">
                    <span>Terpasang:</span>
                    <span>{plugin.installedAt}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                <button
                  onClick={() => setViewingPlugin(plugin)}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center justify-center gap-1.5"
                >
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Inspeksi Manifest</span>
                </button>
                <button
                  onClick={() => handleToggleStatus(plugin)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    plugin.status === 'ACTIVE'
                      ? 'bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300'
                      : 'bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800 text-emerald-300'
                  }`}
                  title={plugin.status === 'ACTIVE' ? 'Nonaktifkan Plugin' : 'Aktifkan Plugin'}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{plugin.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Upload & Pendaftaran Plugin */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-400" />
                <span>Upload & Daftarkan Plugin Keahlian</span>
              </h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setUploadMode('package')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                  uploadMode === 'package' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Upload Paket (.zip / manifest)
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('manual')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                  uploadMode === 'manual' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pendaftaran Manual
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3">
              {uploadMode === 'package' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Nama Plugin</label>
                      <input
                        type="text"
                        required
                        value={pkgName}
                        onChange={(e) => setPkgName(e.target.value)}
                        placeholder="Contoh: Sentiment Analyzer V3"
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Versi</label>
                      <input
                        type="text"
                        required
                        value={pkgVersion}
                        onChange={(e) => setPkgVersion(e.target.value)}
                        placeholder="1.0.0"
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Author / Squad</label>
                    <input
                      type="text"
                      required
                      value={pkgAuthor}
                      onChange={(e) => setPkgAuthor(e.target.value)}
                      placeholder="NLP Lab Nusantara"
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      File Paket Archive (.zip / .tar.gz opsional)
                    </label>
                    <div className="border border-dashed border-slate-700 hover:border-indigo-500 rounded-lg p-3 text-center bg-slate-950 transition cursor-pointer">
                      <input
                        type="file"
                        accept=".zip,.tar,.gz,.wasm"
                        onChange={handleFileChange}
                        className="hidden"
                        id="plugin-file-input"
                      />
                      <label htmlFor="plugin-file-input" className="cursor-pointer block text-xs text-slate-400">
                        {fileName ? (
                          <span className="text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                            <Check className="w-3.5 h-3.5" />
                            {fileName}
                          </span>
                        ) : (
                          <span>Pilih berkas arsip biner plugin (WASM / py script)</span>
                        )}
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Manifest JSON (`manifest.json`)</label>
                    <textarea
                      required
                      rows={4}
                      value={pkgManifestJson}
                      onChange={(e) => setPkgManifestJson(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-indigo-300 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Instruksi Eksekusi (`SKILL.md`)</label>
                    <textarea
                      required
                      rows={3}
                      value={pkgSkillDefMd}
                      onChange={(e) => setPkgSkillDefMd(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Nama Plugin</label>
                      <input
                        type="text"
                        required
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder="Contoh: Custom Doc Classifier"
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Versi</label>
                      <input
                        type="text"
                        required
                        value={manualVersion}
                        onChange={(e) => setManualVersion(e.target.value)}
                        placeholder="1.0.0"
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Runtime</label>
                      <select
                        value={manualRuntime}
                        onChange={(e) => setManualRuntime(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="WASM_V8">WASM_V8 (Recommended)</option>
                        <option value="PYTHON_311_SANDBOX">PYTHON_311_SANDBOX</option>
                        <option value="ONNX_RUNTIME">ONNX_RUNTIME</option>
                        <option value="NODE_20_WASM">NODE_20_WASM</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Author</label>
                      <input
                        type="text"
                        required
                        value={manualAuthor}
                        onChange={(e) => setManualAuthor(e.target.value)}
                        placeholder="Squad Name / Vendor"
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Deskripsi Fungsional</label>
                    <textarea
                      rows={3}
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      placeholder="Jelaskan peran skill plugin ini dalam alur tugas karyawan AI..."
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Memproses...' : 'Daftarkan Plugin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Plugin */}
      {isEditModalOpen && editingPlugin && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-400" />
                <span>Edit Plugin: {editingPlugin.name}</span>
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdatePlugin} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nama Plugin</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Versi</label>
                  <input
                    type="text"
                    required
                    value={editVersion}
                    onChange={(e) => setEditVersion(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Runtime</label>
                  <select
                    value={editRuntime}
                    onChange={(e) => setEditRuntime(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="WASM_V8">WASM_V8</option>
                    <option value="PYTHON_311_SANDBOX">PYTHON_311_SANDBOX</option>
                    <option value="ONNX_RUNTIME">ONNX_RUNTIME</option>
                    <option value="NODE_20_WASM">NODE_20_WASM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Author</label>
                  <input
                    type="text"
                    required
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Deskripsi Fungsional</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50"
                >
                  {isEditSubmitting ? 'Memperbarui...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail & Manifest Inspector */}
      {viewingPlugin && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-400" />
                <span>Manifest Plugin: {viewingPlugin.name}</span>
              </h3>
              <button onClick={() => setViewingPlugin(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-indigo-300 space-y-1">
                <div>plugin_id: "{viewingPlugin.id}"</div>
                <div>name: "{viewingPlugin.name}"</div>
                <div>version: "{viewingPlugin.version}"</div>
                <div>runtime: "{viewingPlugin.executionRuntime}"</div>
                <div>author: "{viewingPlugin.author}"</div>
                <div>status: "{viewingPlugin.status}"</div>
                <div>installed_at: "{viewingPlugin.installedAt || '2026-09-01'}"</div>
              </div>

              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong>Sandbox Isolation Active:</strong> Eksekusi plugin terenkapsulasi secara aman di memory container tanpa akses ke lingkungan host.
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setViewingPlugin(null)}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
