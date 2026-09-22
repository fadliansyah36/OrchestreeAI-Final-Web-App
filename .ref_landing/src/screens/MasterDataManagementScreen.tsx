import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  Search,
  Tag,
  X,
  Pencil,
  LayoutTemplate,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Info,
  Code2,
  Upload,
  Building2,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  MasterDataItem,
  MasterDataCategoryInfo,
  AdminStudioTemplateItem,
  PlatformAssetLogoResponse,
} from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';
import { DepartmentCategoriesTab } from '../components/masterdata/DepartmentCategoriesTab';

const STANDARD_CATEGORIES = [
  { key: 'INDUSTRY', label: 'INDUSTRY • Industri Bisnis' },
  { key: 'GUARDRAIL', label: 'GUARDRAIL • Pagar Pembatas AI' },
  { key: 'PROMPT_TEMPLATE', label: 'PROMPT_TEMPLATE • Template Prompt' },
  { key: 'DIVISION', label: 'DIVISION • Kamus Divisi' },
  { key: 'KPI_METRIC', label: 'KPI_METRIC • Metrik Kinerja' },
  { key: 'WORKFLOW_TRIGGER', label: 'WORKFLOW_TRIGGER • Pemicu Alur Kerja' },
  { key: 'COMPLIANCE_RULE', label: 'COMPLIANCE_RULE • Regulasi & Kepatuhan' },
  { key: 'AGENT_PERSONA', label: 'AGENT_PERSONA • Persona Gaya AI' },
  { key: 'CURRENCY_LOCALE', label: 'CURRENCY_LOCALE • Mata Uang & Wilayah' },
  { key: 'SYSTEM_PARAM', label: 'SYSTEM_PARAM • Parameter Global' },
];

export const MasterDataManagementScreen: React.FC = () => {
  const [screenTab, setScreenTab] = useState<'master_data' | 'department_categories' | 'studio_templates' | 'platform_assets'>('master_data');

  // Tab 1: Master Data State
  const [categories, setCategories] = useState<MasterDataCategoryInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);

  // Tab 2: Studio Templates State (Domain 16)
  const [templates, setTemplates] = useState<AdminStudioTemplateItem[]>([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<HonestErrorInfo | null>(null);
  const [templateFilter, setTemplateFilter] = useState<string>('ALL');

  // Tab 3: Platform Assets State (Domain 16)
  const [logoAsset, setLogoAsset] = useState<PlatformAssetLogoResponse | null>(null);
  const [isAssetLoading, setIsAssetLoading] = useState<boolean>(false);
  const [assetError, setAssetError] = useState<HonestErrorInfo | null>(null);
  const [newLogoUrl, setNewLogoUrl] = useState<string>('/logoorchestreeweb.png');
  const [isSavingLogo, setIsSavingLogo] = useState<boolean>(false);
  const [logoSuccessMessage, setLogoSuccessMessage] = useState<string | null>(null);

  // Modal State - Create
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [newCategory, setNewCategory] = useState<string>('INDUSTRY');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [newKey, setNewKey] = useState<string>('');
  const [newValue, setNewValue] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');

  // Modal State - Edit
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [isEditSubmitting, setIsEditSubmitting] = useState<boolean>(false);

  const fetchData = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const [cats, dataItems] = await Promise.all([
        api.getMasterDataCategories(),
        api.getMasterData(selectedCategory === 'ALL' ? undefined : selectedCategory),
      ]);
      setCategories(cats);
      setItems(dataItems);
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/master-data${selectedCategory !== 'ALL' ? `?category=${selectedCategory}` : ''}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat master data.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memuat master data.' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStudioTemplates = async () => {
    setIsTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const data = await api.getStudioTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setTemplatesError({
        endpoint: '/admin/studio/templates',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat studio templates dari backend.',
        rawDetails: err?.rawDetails || err,
      });
      setTemplates([]);
    } finally {
      setIsTemplatesLoading(false);
    }
  };

  const fetchPlatformLogo = async () => {
    setIsAssetLoading(true);
    setAssetError(null);
    try {
      const data = await api.getPlatformAssetLogo();
      setLogoAsset(data);
      if (data?.logoUrl) {
        setNewLogoUrl(data.logoUrl);
      }
    } catch (err: any) {
      setAssetError({
        endpoint: '/admin/platform-assets/icon-logo',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat logo platform dari backend.',
        rawDetails: err?.rawDetails || err,
      });
      // Fallback display
      setLogoAsset({ logoUrl: '/logoorchestreeweb.png' });
    } finally {
      setIsAssetLoading(false);
    }
  };

  const handleUpdateLogo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogoUrl.trim()) return;
    setIsSavingLogo(true);
    setAssetError(null);
    setLogoSuccessMessage(null);
    try {
      const res = await api.updatePlatformAssetLogo({
        logoUrl: newLogoUrl.trim(),
      });
      setLogoAsset(res);
      setLogoSuccessMessage('Logo platform global berhasil diperbarui.');
    } catch (err: any) {
      setAssetError({
        endpoint: '/admin/platform-assets/icon-logo',
        status: err?.status || 500,
        message: err?.message || 'Gagal menyimpan perubahan logo platform.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsSavingLogo(false);
    }
  };

  useEffect(() => {
    if (screenTab === 'master_data') {
      fetchData();
    } else if (screenTab === 'studio_templates') {
      fetchStudioTemplates();
    } else if (screenTab === 'platform_assets') {
      fetchPlatformLogo();
    }
  }, [screenTab]);

  useEffect(() => {
    fetchData();
  }, [selectedCategory]);

  const handleCreateMasterData = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = (newCategory === 'CUSTOM' ? customCategory : newCategory).trim().toUpperCase();
    if (!finalCategory || !newKey.trim() || !newValue.trim()) return;
    setIsSubmitting(true);
    try {
      await api.createMasterData({
        category: finalCategory,
        key: newKey.trim(),
        value: newValue.trim(),
        description: newDescription.trim() || undefined,
      });
      setMessage({ type: 'success', text: `Master data "${newKey}" berhasil disimpan.` });
      setIsModalOpen(false);
      setNewKey('');
      setNewValue('');
      setNewDescription('');
      setCustomCategory('');
      fetchData();
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/master-data',
        status: err?.status || 500,
        message: err?.message || 'Gagal membuat master data.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (item: MasterDataItem) => {
    setEditingItem(item);
    setEditValue(item.value);
    setEditDescription(item.description || '');
    setIsEditModalOpen(true);
  };

  const handleUpdateMasterData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editValue.trim()) return;
    setIsEditSubmitting(true);
    try {
      await api.updateMasterData(editingItem.id, {
        value: editValue.trim(),
        description: editDescription.trim() || undefined,
      });
      setMessage({ type: 'success', text: `Master data "${editingItem.key}" berhasil diperbarui.` });
      setIsEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/master-data/${editingItem.category}/${editingItem.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memperbarui master data.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDeleteItem = async (item: MasterDataItem) => {
    if (!window.confirm(`Yakin ingin menghapus item "${item.key}"?`)) return;
    try {
      await api.deleteMasterData(item.id, item.category);
      setMessage({ type: 'success', text: `Item "${item.key}" berhasil dihapus.` });
      fetchData();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/master-data/${item.category}/${item.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menghapus master data.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (it) =>
        it.key.toLowerCase().includes(q) ||
        it.value.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        (it.description && it.description.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            <span>Platform Master Data & Domain Presets</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Katalog industri standar, template prompt guardrails, kamus divisi, dan parameter referensi AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start sm:self-auto"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Master Data</span>
          </button>
        </div>
      </div>

      {/* Domain 16 & Domain 91 Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 flex-wrap">
        <button
          onClick={() => setScreenTab('master_data')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            screenTab === 'master_data'
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Master Data & Presets (Domain 91)</span>
        </button>
        <button
          onClick={() => setScreenTab('department_categories')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            screenTab === 'department_categories'
              ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Department Categories (Domain 3 • Public API)</span>
        </button>
        <button
          onClick={() => setScreenTab('studio_templates')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            screenTab === 'studio_templates'
              ? 'bg-purple-600/20 text-purple-400 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <LayoutTemplate className="w-4 h-4" />
          <span>Studio Templates (Domain 16)</span>
        </button>
        <button
          onClick={() => setScreenTab('platform_assets')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            screenTab === 'platform_assets'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Platform Branding & Assets (Domain 16)</span>
        </button>
      </div>

      {/* TAB 1: MASTER DATA */}
      {screenTab === 'master_data' && (
        <div className="space-y-6">
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

          {/* Search & Category Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari berdasarkan key, value, atau deskripsi..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Menampilkan <span className="text-emerald-400 font-bold">{filteredItems.length}</span> dari {items.length} item
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedCategory === 'ALL'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Semua Kategori
            </button>
            {categories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  selectedCategory === cat.category
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <span>{cat.category}</span>
                <span className="text-[10px] opacity-75 font-mono">({cat.count})</span>
              </button>
            ))}
          </div>

          {/* Items Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Key / Kode</th>
                    <th className="px-4 py-3">Nilai / Value</th>
                    <th className="px-4 py-3">Deskripsi</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {isLoading ? 'Memuat master data...' : 'Tidak ada master data yang cocok.'}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-indigo-300 border border-slate-700">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-emerald-400 font-semibold">{item.key}</td>
                        <td className="px-4 py-3 font-medium text-white max-w-xs truncate">{item.value}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{item.description || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(item)}
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                              title="Edit Master Data"
                            >
                              <Pencil className="w-3.5 h-3.5 text-indigo-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item)}
                              className="p-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-400 transition"
                              title="Hapus Master Data"
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
        </div>
      )}

      {/* TAB: DEPARTMENT CATEGORIES (DOMAIN 3 • PUBLIC API) */}
      {screenTab === 'department_categories' && <DepartmentCategoriesTab />}

      {/* TAB 2: STUDIO TEMPLATES (DOMAIN 16) */}
      {screenTab === 'studio_templates' && (
        <div className="space-y-6">
          {/* Visual Warning Banner for Backend Stub */}
          <div className="bg-amber-950/40 border border-amber-800/80 p-4 rounded-xl text-amber-300 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Catatan Arsitektur: Data Stub Backend (GET /admin/studio/templates)</span>
            </div>
            <p className="leading-relaxed text-slate-300">
              Data template workflow di bawah ini dikembalikan oleh backend sebagai array statis terkonfirmasi:{' '}
              <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">listOf(AdminStudioTemplateItem(...))</code>. 
              Data ini <strong>BUKAN</strong> data dinamis dari database produksi dan tidak mencerminkan mutasi runtime.
            </p>
            <div className="bg-slate-950/70 p-3 rounded-lg border border-amber-900/60 font-mono text-[11px] text-slate-300 space-y-1">
              <p className="text-amber-400 font-semibold">📌 Rekomendasi untuk Tim Backend OrchestreeAI:</p>
              <p>1. Implementasikan tabel database dinamis <code className="text-emerald-400">studio_templates</code> dengan skema versioning & audit trail.</p>
              <p>2. Sediakan endpoint CRUD lengkap: <code className="text-purple-400">POST/PUT/DELETE /admin/studio/templates/{'{id}'}</code>.</p>
              <p>3. Dukung integrasi canvas workflow dan template scoping per industri atau tenant.</p>
            </div>
          </div>

          {templatesError && (
            <HonestErrorBanner
              error={templatesError}
              onRetry={fetchStudioTemplates}
              isRetrying={isTemplatesLoading}
            />
          )}

          {/* Templates Header & Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium">Filter Kategori:</span>
              <select
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">Semua Kategori</option>
                <option value="MARKETING">Marketing & Social Media</option>
                <option value="SALES">Sales & Outreach</option>
                <option value="CUSTOMER_SUPPORT">Customer Support</option>
                <option value="OPERATIONS">Operations & Automation</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span>Endpoint:</span>
              <code className="text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40">
                GET /admin/studio/templates
              </code>
            </div>
          </div>

          {/* Templates List */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-purple-400" />
                  <span>Daftar Template Studio AI</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Template workflow terstandarisasi untuk pembuatan otomatisasi agen di Creative Studio.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {templates.length} Templates (Backend Stub)
              </span>
            </div>

            {isTemplatesLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                <span className="text-xs">Memuat template studio dari backend...</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <LayoutTemplate className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-semibold text-slate-300">Belum ada template studio yang tersedia.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Data diambil dari endpoint <code className="text-purple-400">GET /admin/studio/templates</code>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                {templates
                  .filter(
                    (t) => templateFilter === 'ALL' || t.category?.toUpperCase() === templateFilter
                  )
                  .map((template) => (
                    <div
                      key={template.id}
                      className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl space-y-3 hover:border-purple-500/50 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-white text-sm">{template.name}</h4>
                          <span className="text-[11px] text-purple-400 font-mono">
                            v{template.version || '1.0.0'}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/60 shrink-0">
                          STUB BACKEND
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-3">
                        {template.description || 'Tidak ada deskripsi template.'}
                      </p>
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {template.category || 'WORKFLOW'}
                        </span>
                        <span className="text-slate-500 font-mono">ID: {template.id}</span>
                      </div>
                      {template.suggestedTools && template.suggestedTools.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {template.suggestedTools.map((tool, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-purple-950/40 text-[10px] text-purple-300 border border-purple-900/40"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PLATFORM ASSETS & BRANDING (DOMAIN 16) */}
      {screenTab === 'platform_assets' && (
        <div className="space-y-6">
          {/* Explanation Banner */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Branding Global Platform OrchestreeAI (Domain 16)</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Konfigurasi logo dan aset visual global Super Admin platform. Aset ini digunakan pada navbar aplikasi terpusat,
              halaman autentikasi global, dan notifikasi sistem platform. Pengaturan ini berskala platform global dan <strong>BUKAN</strong> branding per-tenant (white-labeling).
            </p>
            <div className="flex items-center gap-2 pt-2 text-xs text-slate-400 font-mono">
              <span>Endpoints:</span>
              <code className="text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                GET /admin/platform-assets/icon-logo
              </code>
              <code className="text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                POST /admin/platform-assets/icon-logo
              </code>
            </div>
          </div>

          {assetError && (
            <HonestErrorBanner
              error={assetError}
              onRetry={fetchPlatformLogo}
              isRetrying={isAssetLoading}
            />
          )}

          {logoSuccessMessage && (
            <div className="p-3 text-xs rounded-lg border bg-emerald-950/60 border-emerald-800 text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{logoSuccessMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Preview Card */}
            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-emerald-400" />
                  <span>Preview Tampilan Logo Global</span>
                </h4>
                <span className="text-[11px] font-mono text-slate-400">Live Render</span>
              </div>

              {/* Dark Canvas Preview */}
              <div className="space-y-1.5">
                <span className="text-xs text-slate-400 font-medium">Dark Mode Context:</span>
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 flex items-center justify-center min-h-[140px]">
                  <img
                    src={newLogoUrl || '/logoorchestreeweb.png'}
                    alt="Platform Logo Preview Dark"
                    className="max-h-20 max-w-full object-contain rounded"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/logoorchestreeweb.png';
                    }}
                  />
                </div>
              </div>

              {/* Light Canvas Preview */}
              <div className="space-y-1.5">
                <span className="text-xs text-slate-400 font-medium">Light Mode Context:</span>
                <div className="bg-slate-100 p-6 rounded-xl border border-slate-300 flex items-center justify-center min-h-[140px]">
                  <img
                    src={newLogoUrl || '/logoorchestreeweb.png'}
                    alt="Platform Logo Preview Light"
                    className="max-h-20 max-w-full object-contain rounded"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/logoorchestreeweb.png';
                    }}
                  />
                </div>
              </div>

              {/* Dimension Variants */}
              <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="w-8 h-8 rounded bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                    <img
                      src={newLogoUrl || '/logoorchestreeweb.png'}
                      alt="Favicon"
                      className="w-5 h-5 object-contain"
                    />
                  </div>
                  <div>
                    <p className="font-bold text-white">Favicon (32x32)</p>
                    <p className="text-[10px] text-slate-500">Browser tab icon</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                    <img
                      src={newLogoUrl || '/logoorchestreeweb.png'}
                      alt="App Icon"
                      className="w-8 h-8 object-contain"
                    />
                  </div>
                  <div>
                    <p className="font-bold text-white">App Icon (64x64)</p>
                    <p className="text-[10px] text-slate-500">Sidebar branding</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Update Form Card */}
            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>Update Logo Platform Global</span>
                </h4>
                <span className="text-[11px] font-mono text-slate-400">POST Endpoint</span>
              </div>

              <form onSubmit={handleUpdateLogo} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    URL Logo Platform Global
                  </label>
                  <input
                    type="text"
                    value={newLogoUrl}
                    onChange={(e) => setNewLogoUrl(e.target.value)}
                    placeholder="https://... atau /logoorchestreeweb.png"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Dukung tautan absolut (HTTPS) atau path relatif statis di platform (misal: <code className="text-indigo-300">/logoorchestreeweb.png</code>).
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium">Preset Cepat:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewLogoUrl('/logoorchestreeweb.png')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition border border-slate-700 font-mono"
                    >
                      Canonical (/logoorchestreeweb.png)
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 text-xs text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Aset Terkini:</span>
                    <span className="text-white font-mono truncate max-w-xs">{logoAsset?.logoUrl || '/logoorchestreeweb.png'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Terakhir Diperbarui:</span>
                    <span className="text-slate-300 font-mono">
                      {logoAsset?.updatedAt ? new Date(logoAsset.updatedAt).toLocaleString('id-ID') : 'Default Deployment'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Operator:</span>
                    <span className="text-emerald-400 font-mono">{logoAsset?.updatedBy || 'Super Admin Core'}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingLogo || !newLogoUrl.trim()}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                >
                  {isSavingLogo ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan ke POST /admin/platform-assets/icon-logo...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Simpan Perubahan Logo Platform</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Master Data */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                <span>Tambah Master Data Baru</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateMasterData} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kategori Standar (Domain 16 Presets)
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  {STANDARD_CATEGORIES.map((sc) => (
                    <option key={sc.key} value={sc.key}>
                      {sc.label}
                    </option>
                  ))}
                  <option value="CUSTOM">+ Kategori Kustom Lainnya...</option>
                </select>
              </div>

              {newCategory === 'CUSTOM' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nama Kategori Kustom</label>
                  <input
                    type="text"
                    required
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Contoh: WORKFLOW_POLICY"
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono uppercase"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Key / Kode Unik</label>
                <input
                  type="text"
                  required
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Contoh: HEALTHCARE, AGENT_SAFETY_V2"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nilai / Value</label>
                <textarea
                  required
                  rows={3}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Isi konten nilai, teks regulasi, atau konfigurasi JSON"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Deskripsi (Opsional)</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Keterangan singkat peruntukan item"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Master Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Master Data */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-400" />
                <span>Edit Master Data: {editingItem.key}</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateMasterData} className="space-y-3">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs">
                <span className="text-slate-400">Kategori:</span>{' '}
                <span className="font-bold text-indigo-300 font-mono">{editingItem.category}</span>
                <span className="text-slate-600 mx-2">•</span>
                <span className="text-slate-400">Key:</span>{' '}
                <span className="font-bold text-emerald-400 font-mono">{editingItem.key}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nilai / Value</label>
                <textarea
                  required
                  rows={4}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Deskripsi (Opsional)</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
    </div>
  );
};
