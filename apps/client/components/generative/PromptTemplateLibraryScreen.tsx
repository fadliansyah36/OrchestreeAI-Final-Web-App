'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Search,
  Copy,
  Check,
  Flame,
  Star,
  ExternalLink,
  Plus,
  Bookmark,
  Share2,
  Camera,
  Tag,
  Smile,
  UserCheck,
  BarChart2,
  Monitor,
  Calendar,
  Layers,
  Info,
  ShieldCheck,
  ArrowRight,
  Filter,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
  RefreshCw,
  FolderLock,
  BookOpen,
  Package,
  Palette,
  Home,
  Building,
  Cpu,
  Shapes,
  Droplet,
  Box,
  Grid,
  Zap,
  PenTool,
  Film,
  Shirt,
  Brush,
  Feather,
  Sun,
  Image as ImageIcon,
  Clock,
  Dices
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

export interface PromptStyleFamily {
  id: string;
  style_code: string;
  display_name: string;
  description: string;
  icon_key: string;
  display_order: number;
  template_count?: number;
}

export interface AtomicPromptTemplate {
  id: string;
  category_id: string;
  category_code: string;
  category_name?: string;
  category_icon?: string;
  style_family_id?: string;
  style_code?: string;
  style_name?: string;
  style_description?: string;
  style_icon?: string;
  seeding_batch_id?: string;
  template_name: string;
  concept_summary: string;
  subject_field: string;
  scene_context_field?: string;
  lighting_field?: string;
  material_texture_field?: string;
  composition_layout_field?: string;
  color_palette_field?: string;
  style_reference_field?: string;
  constraints_field?: string;
  avoid_terms?: string[];
  prefer_terms?: string[];
  recommended_aspect_ratio: string;
  recommended_platform?: string[];
  example_generated_file_artifact_id?: string;
  example_image_url?: string;
  example_file_name?: string;
  is_global: boolean;
  tenant_id?: string | null;
  usage_count: number;
  is_recommended?: boolean;
  created_at: string;
}

export interface PromptCategory {
  id: string;
  category_code: string;
  display_name: string;
  description: string;
  icon_key: string;
  display_order: number;
  template_count?: number;
}

interface PromptTemplateLibraryScreenProps {
  tenantId: string;
  onUseTemplate: (template: AtomicPromptTemplate) => void;
  onSaveNewTemplateRequested?: () => void;
}

const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  'share-2': Share2,
  'camera': Camera,
  'tag': Tag,
  'smile': Smile,
  'user-check': UserCheck,
  'bar-chart-2': BarChart2,
  'monitor': Monitor,
  'calendar': Calendar,
  'layers': Layers,
  'book-open': BookOpen,
  'package': Package,
  'palette': Palette,
  'home': Home,
  'building': Building,
  'cpu': Cpu,
  'sparkles': Sparkles,
};

const STYLE_ICON_MAP: Record<string, React.ElementType> = {
  'camera': Camera,
  'shapes': Shapes,
  'droplet': Droplet,
  'box': Box,
  'grid': Grid,
  'zap': Zap,
  'pen-tool': PenTool,
  'smile': Smile,
  'film': Film,
  'shirt': Shirt,
  'brush': Brush,
  'building': Building,
  'feather': Feather,
  'sun': Sun,
  'image': ImageIcon,
  'clock': Clock,
};

export function PromptTemplateLibraryScreen({
  tenantId,
  onUseTemplate,
  onSaveNewTemplateRequested,
}: PromptTemplateLibraryScreenProps) {
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [styles, setStyles] = useState<PromptStyleFamily[]>([]);
  const [templates, setTemplates] = useState<AtomicPromptTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Two-Axis Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStyle, setSelectedStyle] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'private'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [surpriseLoading, setSurpriseLoading] = useState<boolean>(false);
  const [surpriseNotice, setSurpriseNotice] = useState<string | null>(null);

  // Detail Modal / Educational Modal
  const [inspectingTemplate, setInspectingTemplate] = useState<AtomicPromptTemplate | null>(null);

  // Create Private Template Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState({
    category_code: 'social_media_post',
    style_code: 'studio_realism',
    template_name: '',
    concept_summary: '',
    subject_field: '',
    scene_context_field: '',
    lighting_field: '',
    material_texture_field: '',
    composition_layout_field: '',
    color_palette_field: '',
    style_reference_field: '',
    constraints_field: '',
    avoid_terms_raw: '',
    prefer_terms_raw: '',
    recommended_aspect_ratio: '1:1',
    recommended_platform_raw: 'instagram_feed, whatsapp_catalog',
  });
  const [creatingTemplate, setCreatingTemplate] = useState<boolean>(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/generative/prompt-categories`, {
        headers: {
          'X-Tenant-Id': tenantId,
        },
      });
      if (!res.ok) throw new Error('Gagal memuat kategori template prompt.');
      const data = await res.json();
      setCategories(data.data || []);
    } catch (err: any) {
      console.error('Error fetching prompt categories:', err);
    }
  };

  const fetchStyles = async () => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/generative/prompt-styles`, {
        headers: {
          'X-Tenant-Id': tenantId,
        },
      });
      if (!res.ok) throw new Error('Gagal memuat keluarga gaya visual.');
      const data = await res.json();
      setStyles(data.data || []);
    } catch (err: any) {
      console.error('Error fetching prompt styles:', err);
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/v1/tenants/${tenantId}/generative/prompt-templates?scope=${scopeFilter}`;
      if (selectedCategory !== 'all') {
        url += `&category_code=${encodeURIComponent(selectedCategory)}`;
      }
      if (selectedStyle !== 'all') {
        url += `&style_code=${encodeURIComponent(selectedStyle)}`;
      }
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }

      const res = await fetch(url, {
        headers: {
          'X-Tenant-Id': tenantId,
        },
      });

      if (!res.ok) throw new Error('Gagal memuat pustaka template prompt.');
      const data = await res.json();
      setTemplates(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan memuat data template.');
    } finally {
      setLoading(false);
    }
  };

  const handleSurpriseMe = async () => {
    setSurpriseLoading(true);
    setSurpriseNotice(null);
    try {
      let url = `/api/v1/tenants/${tenantId}/generative/prompt-templates/surprise-me?`;
      if (selectedCategory !== 'all') {
        url += `category_code=${encodeURIComponent(selectedCategory)}&`;
      }
      if (selectedStyle !== 'all') {
        url += `style_code=${encodeURIComponent(selectedStyle)}`;
      }

      const res = await fetch(url, {
        headers: {
          'X-Tenant-Id': tenantId,
        },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Tidak ada template yang cocok untuk dikejutkan.');
      }
      const resData = await res.json();
      const surpriseTemplate: AtomicPromptTemplate = resData.data;
      if (surpriseTemplate) {
        setSurpriseNotice(`Kejutkan Saya: "${surpriseTemplate.template_name}" (${surpriseTemplate.style_name || surpriseTemplate.style_code || 'Gaya Terpadu'}) terpilih secara acak!`);
        setInspectingTemplate(surpriseTemplate);
      }
    } catch (err: any) {
      setSurpriseNotice(err.message || 'Gagal menjalankan fitur Kejutkan Saya.');
    } finally {
      setSurpriseLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchStyles();
  }, [tenantId]);

  useEffect(() => {
    fetchTemplates();
  }, [tenantId, selectedCategory, selectedStyle, scopeFilter, searchQuery]);

  const handleCopyPrompt = (template: AtomicPromptTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    const parts = [
      `Subjek: ${template.subject_field}`,
      template.scene_context_field ? `Latar: ${template.scene_context_field}` : null,
      template.lighting_field ? `Pencahayaan: ${template.lighting_field}` : null,
      template.material_texture_field ? `Material: ${template.material_texture_field}` : null,
      template.composition_layout_field ? `Komposisi: ${template.composition_layout_field}` : null,
      template.color_palette_field ? `Palet Warna: ${template.color_palette_field}` : null,
      template.style_reference_field ? `Gaya: ${template.style_reference_field}` : null,
      template.constraints_field ? `Batasan: ${template.constraints_field}` : null,
      template.prefer_terms && template.prefer_terms.length > 0
        ? `Deskriptor Dianjurkan: ${template.prefer_terms.join(', ')}`
        : null,
    ].filter(Boolean);

    const fullPromptText = parts.join(', ');
    navigator.clipboard.writeText(fullPromptText);
    setCopiedId(template.id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2500);
  };

  const handleCreatePrivateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.template_name.trim() || !createForm.subject_field.trim()) {
      setFormError('Nama template dan deskripsi subjek wajib diisi.');
      return;
    }

    setCreatingTemplate(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const avoidList = createForm.avoid_terms_raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const preferList = createForm.prefer_terms_raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const platformList = createForm.recommended_platform_raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/v1/tenants/${tenantId}/generative/prompt-templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          category_code: createForm.category_code,
          template_name: createForm.template_name.trim(),
          concept_summary: createForm.concept_summary.trim() || createForm.template_name.trim(),
          subject_field: createForm.subject_field.trim(),
          scene_context_field: createForm.scene_context_field.trim() || undefined,
          lighting_field: createForm.lighting_field.trim() || undefined,
          material_texture_field: createForm.material_texture_field.trim() || undefined,
          composition_layout_field: createForm.composition_layout_field.trim() || undefined,
          color_palette_field: createForm.color_palette_field.trim() || undefined,
          style_reference_field: createForm.style_reference_field.trim() || undefined,
          constraints_field: createForm.constraints_field.trim() || undefined,
          avoid_terms: avoidList,
          prefer_terms: preferList,
          recommended_aspect_ratio: createForm.recommended_aspect_ratio,
          recommended_platform: platformList,
          is_global: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Gagal menyimpan template privat.');

      setFormSuccess('Template privat berhasil disimpan ke pustaka organisasi Anda!');
      setTimeout(() => {
        setShowCreateModal(false);
        setFormSuccess(null);
        fetchTemplates();
        fetchCategories();
      }, 1500);
    } catch (err: any) {
      setFormError(err.message || 'Terjadi kesalahan saat menyimpan.');
    } finally {
      setCreatingTemplate(false);
    }
  };

  // Pisahkan template rekomendasi dan template reguler
  const recommendedTemplates = useMemo(() => {
    return templates.filter((t) => t.is_recommended && scopeFilter !== 'private');
  }, [templates, scopeFilter]);

  const otherTemplates = useMemo(() => {
    if (recommendedTemplates.length === 0) return templates;
    return templates.filter((t) => !t.is_recommended || scopeFilter === 'private');
  }, [templates, recommendedTemplates, scopeFilter]);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header & Quick Action */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0B1528] to-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pustaka Template Prompt Atomik Siap Pakai</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Eksplorasi Skema Visual Komersial Siap Pakai
            </h1>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Pilihan template prompt terstruktur yang dirancang khusus untuk kebutuhan pemasaran, retail, dan komunikasi visual organisasi Anda. Ditenagai oleh skema atomik 8-pilar dan Model Router terpadu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSurpriseMe}
              disabled={surpriseLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-purple-950/40 cursor-pointer min-h-[44px] disabled:opacity-50"
              title="Kejutkan Saya: Memilih acak template dari kombinasi yang belum pernah dipakai organisasi Anda"
            >
              <Dices className={`w-4 h-4 ${surpriseLoading ? 'animate-spin' : ''}`} />
              <span>{surpriseLoading ? 'Mengacak...' : 'Kejutkan Saya'}</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-950/40 cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>Simpan Template Baru</span>
            </button>
            <button
              onClick={() => {
                fetchCategories();
                fetchStyles();
                fetchTemplates();
              }}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Perbarui Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Notifikasi Kejutkan Saya */}
      {surpriseNotice && (
        <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-800/60 text-purple-200 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="font-medium">{surpriseNotice}</span>
          </div>
          <button
            onClick={() => setSurpriseNotice(null)}
            className="text-purple-400 hover:text-white p-1 rounded-lg hover:bg-purple-900/50 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Taksonomi Dua Sumbu & Pencarian */}
      <div className="space-y-4">
        {/* Search & Scope Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari tema template, subjek visual, atau konsep..." // allowlist: standard UI input hint
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition min-h-[44px]" // allowlist: standard tailwind placeholder styling
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer min-h-[36px] ${
                scopeFilter === 'all'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Pustaka
            </button>
            <button
              onClick={() => setScopeFilter('global')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer min-h-[36px] ${
                scopeFilter === 'global'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kurasi Platform
            </button>
            <button
              onClick={() => setScopeFilter('private')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer min-h-[36px] flex items-center gap-1.5 ${
                scopeFilter === 'private'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FolderLock className="w-3.5 h-3.5" />
              <span>Template Saya</span>
            </button>
          </div>
        </div>

        {/* SUMBU 1: Kategori Kebutuhan Bisnis (14 Kategori) */}
        <div className="space-y-1.5 bg-slate-900/40 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sumbu 1: Kategori Kebutuhan Bisnis ({categories.length})</span>
            </span>
            {selectedCategory !== 'all' && (
              <button
                onClick={() => setSelectedCategory('all')}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
              >
                Reset Kategori
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border min-h-[36px] flex items-center gap-1.5 ${
                selectedCategory === 'all'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Semua Kategori</span>
            </button>

            {categories.map((cat) => {
              const IconComp = CATEGORY_ICON_MAP[cat.icon_key] || Sparkles;
              const isSelected = selectedCategory === cat.category_code;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.category_code)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border min-h-[36px] flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{cat.display_name}</span>
                  {typeof cat.template_count === 'number' && cat.template_count > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
                      {cat.template_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* SUMBU 2: Keluarga Gaya Visual (16 Gaya Visual) */}
        <div className="space-y-1.5 bg-slate-900/40 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-purple-400" />
              <span>Sumbu 2: Keluarga Gaya Visual ({styles.length})</span>
            </span>
            {selectedStyle !== 'all' && (
              <button
                onClick={() => setSelectedStyle('all')}
                className="text-[11px] text-purple-400 hover:text-purple-300 underline cursor-pointer"
              >
                Reset Gaya
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
            <button
              onClick={() => setSelectedStyle('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border min-h-[36px] flex items-center gap-1.5 ${
                selectedStyle === 'all'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Semua Gaya Visual</span>
            </button>

            {styles.map((st) => {
              const IconComp = STYLE_ICON_MAP[st.icon_key] || Palette;
              const isSelected = selectedStyle === st.style_code;
              return (
                <button
                  key={st.id}
                  onClick={() => setSelectedStyle(st.style_code)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border min-h-[36px] flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{st.display_name}</span>
                  {typeof st.template_count === 'number' && st.template_count > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
                      {st.template_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Konten Utama */}
      {loading ? (
        <div className="p-12 text-center space-y-4">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-xs">Memuat pustaka template prompt...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-950/30 border border-rose-800/50 rounded-2xl text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={fetchTemplates}
            className="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold"
          >
            Coba Lagi
          </button>
        </div>
      ) : templates.length === 0 ? (
        <div className="pt-6">
          <EmptyState
            id="empty-prompt-templates"
            icon={Sparkles}
            title={
              scopeFilter === 'private'
                ? 'Belum Ada Template Privat Organisasi'
                : 'Tidak Ditemukan Template Prompt'
            }
            description={
              scopeFilter === 'private'
                ? 'Organisasi Anda belum menyimpan template racikan sendiri. Anda dapat merangkai dan menyimpan skema prompt privat yang dapat dipakai berulang kali oleh tim.'
                : 'Tidak ada template yang cocok dengan kriteria pencarian atau kategori yang dipilih.'
            }
            actionLabel={scopeFilter === 'private' ? 'Buat Template Privat Pertama' : 'Reset Pencarian'}
            onAction={() => {
              if (scopeFilter === 'private') {
                setShowCreateModal(true);
              } else {
                setSelectedCategory('all');
                setSearchQuery('');
                setScopeFilter('all');
              }
            }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {/* SEKSI 1: Rekomendasi Pintar (Berbasis Riwayat Penggunaan Nyata) */}
          {recommendedTemplates.length > 0 && (
            <div className="space-y-3.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                    <span>Direkomendasikan Untuk Organisasi Anda</span>
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                      Analitik Riwayat Nyata
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Disusun berdasarkan preferensi kategori yang paling sering digunakan pada pekerjaan visual organisasi Anda.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {recommendedTemplates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    isCopied={copiedId === tpl.id}
                    onCopy={(e) => handleCopyPrompt(tpl, e)}
                    onUse={() => onUseTemplate(tpl)}
                    onInspect={() => setInspectingTemplate(tpl)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* SEKSI 2: Seluruh Pustaka Template */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white tracking-tight">
                  {selectedCategory === 'all'
                    ? 'Katalog Lengkap Template Prompt'
                    : `Katalog Kategori: ${categories.find((c) => c.category_code === selectedCategory)?.display_name || selectedCategory}`}
                </h2>
                <span className="text-xs text-slate-400 font-mono">({otherTemplates.length})</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {otherTemplates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  isCopied={copiedId === tpl.id}
                  onCopy={(e) => handleCopyPrompt(tpl, e)}
                  onUse={() => onUseTemplate(tpl)}
                  onInspect={() => setInspectingTemplate(tpl)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Detail Skema Atomik & Edukasi Prompt Engineering */}
      {inspectingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase font-mono">
                    {inspectingTemplate.category_code}
                  </span>
                  {inspectingTemplate.style_name && (
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px] font-bold font-mono flex items-center gap-1">
                      <Palette className="w-3 h-3 text-purple-400" />
                      <span>{inspectingTemplate.style_name}</span>
                    </span>
                  )}
                  <span className="text-slate-400 text-xs font-mono">
                    Rasio: {inspectingTemplate.recommended_aspect_ratio}
                  </span>
                  {inspectingTemplate.is_recommended && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                      Rekomendasi
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white">{inspectingTemplate.template_name}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{inspectingTemplate.concept_summary}</p>
                {inspectingTemplate.style_description && (
                  <p className="text-[11px] text-purple-300/80 italic">Karakteristik Gaya: {inspectingTemplate.style_description}</p>
                )}
              </div>
              <button
                onClick={() => setInspectingTemplate(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Gambar Contoh Nyata & Ringkasan Platform */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {inspectingTemplate.example_image_url && (
                <div className="md:col-span-5 rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col items-center justify-center relative group">
                  <img
                    src={inspectingTemplate.example_image_url}
                    alt={inspectingTemplate.template_name}
                    className="w-full object-cover max-h-[260px]"
                  />
                  <div className="p-2.5 bg-slate-950/90 w-full text-center border-t border-slate-800 text-[10px] text-slate-400 font-mono">
                    Contoh visual nyata dari Model Router
                  </div>
                </div>
              )}

              <div className={inspectingTemplate.example_image_url ? 'md:col-span-7 space-y-4' : 'md:col-span-12 space-y-4'}>
                {/* Platform Rekomendasi */}
                {inspectingTemplate.recommended_platform && inspectingTemplate.recommended_platform.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 block">Kanal Distribusi Direkomendasikan:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {inspectingTemplate.recommended_platform.map((p, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono">
                          {p.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subjek Utama */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400 block">Subjek Utama:</span>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-200 leading-relaxed font-mono">
                    {inspectingTemplate.subject_field}
                  </div>
                </div>
              </div>
            </div>

            {/* Skema Atomik 8-Pilar */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider text-slate-400">
                Struktur Komposisi Atomik
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {inspectingTemplate.scene_context_field && (
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase">Latar / Konteks</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{inspectingTemplate.scene_context_field}</p>
                  </div>
                )}
                {inspectingTemplate.lighting_field && (
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase">Pencahayaan Studio</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{inspectingTemplate.lighting_field}</p>
                  </div>
                )}
                {inspectingTemplate.material_texture_field && (
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase">Material & Tekstur</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{inspectingTemplate.material_texture_field}</p>
                  </div>
                )}
                {inspectingTemplate.composition_layout_field && (
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase">Komposisi & Tata Letak</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{inspectingTemplate.composition_layout_field}</p>
                  </div>
                )}
                {inspectingTemplate.color_palette_field && (
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase">Palet Warna</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{inspectingTemplate.color_palette_field}</p>
                  </div>
                )}
                {inspectingTemplate.style_reference_field && (
                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase">Arah Gaya Visual</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{inspectingTemplate.style_reference_field}</p>
                  </div>
                )}
              </div>
            </div>

            {/* PANEL EDUKASI: Kata yang Dianjurkan vs Kata yang Dihindari */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <HelpCircle className="w-4 h-4 text-sky-400" />
                <span>Panduan Edukasi Penulisan Prompt Kualitas Komersial</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Prefer Terms */}
                <div className="space-y-1.5 p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/40">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Kata yang Dianjurkan (Prefer Terms)</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-2">
                    Gunakan deskriptor konkret pencahayaan, material, dan sudut kamera untuk mengarahkan model AI secara presisi:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {inspectingTemplate.prefer_terms && inspectingTemplate.prefer_terms.length > 0 ? (
                      inspectingTemplate.prefer_terms.map((term, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 text-[11px] font-mono">
                          +{term}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 text-[11px] italic">Tidak ada kata khusus</span>
                    )}
                  </div>
                </div>

                {/* Avoid Terms */}
                <div className="space-y-1.5 p-3 rounded-xl bg-rose-950/30 border border-rose-900/40">
                  <div className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Kata yang Sebaiknya Dihindari (Avoid Terms)</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-2">
                    Hindari kata ambigu atau istilah kualitas generik yang memicu distorsi gambar:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {inspectingTemplate.avoid_terms && inspectingTemplate.avoid_terms.length > 0 ? (
                      inspectingTemplate.avoid_terms.map((term, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-rose-900/50 text-rose-300 text-[11px] font-mono">
                          -{term}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 text-[11px] italic">Tidak ada batasan negatif</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={(e) => handleCopyPrompt(inspectingTemplate, e)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-2 transition cursor-pointer min-h-[44px]"
              >
                {copiedId === inspectingTemplate.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedId === inspectingTemplate.id ? 'Prompt Disalin!' : 'Salin Seluruh Prompt'}</span>
              </button>

              <button
                onClick={() => {
                  const t = inspectingTemplate;
                  setInspectingTemplate(null);
                  onUseTemplate(t);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950/50 min-h-[44px]"
              >
                <Sparkles className="w-4 h-4" />
                <span>Gunakan Template Ini ke Editor</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Form Simpan Racikan Prompt Sebagai Template Privat */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Simpan Template Privat Organisasi</h3>
                  <p className="text-xs text-slate-400">
                    Template ini disimpan eksklusif untuk ruang kerja organisasi Anda.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formSuccess && (
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            {formError && (
              <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePrivateTemplate} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Kategori Bisnis *</label>
                  <select
                    value={createForm.category_code}
                    onChange={(e) => setCreateForm({ ...createForm, category_code: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[44px]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.category_code}>
                        {c.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Gaya Visual *</label>
                  <select
                    value={createForm.style_code}
                    onChange={(e) => setCreateForm({ ...createForm, style_code: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[44px]"
                  >
                    {styles.map((s) => (
                      <option key={s.id} value={s.style_code}>
                        {s.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Rasio Aspek</label>
                  <select
                    value={createForm.recommended_aspect_ratio}
                    onChange={(e) => setCreateForm({ ...createForm, recommended_aspect_ratio: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[44px]"
                  >
                    <option value="1:1">1:1 (Persegi - Feed Instagram/Katalog)</option>
                    <option value="16:9">16:9 (Lanskap - Banner/Pitch Deck)</option>
                    <option value="9:16">9:16 (Vertikal - Story/TikTok)</option>
                    <option value="4:5">4:5 (Potret - Feed Instagram/Laporan)</option>
                    <option value="3:4">3:4 (Poster Vertikal)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Nama Template *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Katalog Produk Kemasan Kaca Minimalis" // allowlist: standard UI input hint
                  value={createForm.template_name}
                  onChange={(e) => setCreateForm({ ...createForm, template_name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Ringkasan Konsep</label>
                <input
                  type="text"
                  placeholder="Deskripsi singkat tujuan visual template..." // allowlist: standard UI input hint
                  value={createForm.concept_summary}
                  onChange={(e) => setCreateForm({ ...createForm, concept_summary: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Deskripsi Subjek Utama *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Misal: Botol kaca kemasan minyak esensial lokal dengan label minimalis..." // allowlist: standard UI input hint
                  value={createForm.subject_field}
                  onChange={(e) => setCreateForm({ ...createForm, subject_field: e.target.value })}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Latar / Konteks</label>
                  <input
                    type="text"
                    placeholder="Misal: Meja kayu ek dengan bayangan dedaunan lembut" // allowlist: standard UI input hint
                    value={createForm.scene_context_field}
                    onChange={(e) => setCreateForm({ ...createForm, scene_context_field: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-[11px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Pencahayaan</label>
                  <input
                    type="text"
                    placeholder="Misal: Cahaya alami samping jendela pagi hari" // allowlist: standard UI input hint
                    value={createForm.lighting_field}
                    onChange={(e) => setCreateForm({ ...createForm, lighting_field: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-[11px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Material & Tekstur</label>
                  <input
                    type="text"
                    placeholder="Misal: Kaca amber bening dengan label matte berserat" // allowlist: standard UI input hint
                    value={createForm.material_texture_field}
                    onChange={(e) => setCreateForm({ ...createForm, material_texture_field: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-[11px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Komposisi & Tata Letak</label>
                  <input
                    type="text"
                    placeholder="Misal: Rule-of-thirds, ruang kosong di atas untuk teks" // allowlist: standard UI input hint
                    value={createForm.composition_layout_field}
                    onChange={(e) => setCreateForm({ ...createForm, composition_layout_field: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-[11px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Kata Dianjurkan (Pisahkan koma)</label>
                  <input
                    type="text"
                    placeholder="clean lighting, negative space, sharp focus" // allowlist: standard UI input hint
                    value={createForm.prefer_terms_raw}
                    onChange={(e) => setCreateForm({ ...createForm, prefer_terms_raw: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-[11px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Kata Dihindari (Pisahkan koma)</label>
                  <input
                    type="text"
                    placeholder="blurry, watermark, messy, noisy" // allowlist: standard UI input hint
                    value={createForm.avoid_terms_raw}
                    onChange={(e) => setCreateForm({ ...createForm, avoid_terms_raw: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 text-[11px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs transition cursor-pointer min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingTemplate}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  {creatingTemplate ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Bookmark className="w-4 h-4" />
                  )}
                  <span>Simpan ke Pustaka Privat</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: AtomicPromptTemplate;
  isCopied: boolean;
  onCopy: (e: React.MouseEvent) => void;
  onUse: () => void;
  onInspect: () => void;
}

function TemplateCard({ template, isCopied, onCopy, onUse, onInspect }: TemplateCardProps) {
  return (
    <div
      onClick={onInspect}
      className={`group bg-slate-900/80 hover:bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 shadow-lg cursor-pointer ${
        template.is_recommended
          ? 'border-amber-500/40 hover:border-amber-500/70 shadow-amber-950/20'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="space-y-3.5">
        {/* Gambar Contoh Nyata */}
        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80 relative">
          {template.example_image_url ? (
            <img
              src={template.example_image_url}
              alt={template.template_name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-1.5 text-slate-600">
              <Sparkles className="w-6 h-6 text-slate-700" />
              <span className="text-[10px] font-mono">Pratinjau Hasil Nyata</span>
            </div>
          )}

          {/* Badges Over Image */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-[10px] font-mono font-semibold text-emerald-400 border border-emerald-500/30">
                {template.category_code}
              </span>
              {template.style_name && (
                <span className="px-2 py-0.5 rounded-md bg-purple-950/85 backdrop-blur-md text-[10px] font-mono font-semibold text-purple-300 border border-purple-500/30 flex items-center gap-1">
                  <Palette className="w-2.5 h-2.5 text-purple-400" />
                  <span>{template.style_name}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {template.is_recommended && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                  <Flame className="w-3 h-3 fill-slate-950" />
                  <span>Sering Dipakai</span>
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-[10px] font-mono text-slate-300 border border-slate-800">
                {template.recommended_aspect_ratio}
              </span>
            </div>
          </div>
        </div>

        {/* Informasi Template */}
        <div className="space-y-1.5">
          <h3 className="font-bold text-white text-sm tracking-tight group-hover:text-emerald-300 transition-colors line-clamp-1">
            {template.template_name}
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">
            {template.concept_summary}
          </p>
        </div>

        {/* Platform Rekomendasi Tags */}
        {template.recommended_platform && template.recommended_platform.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.recommended_platform.slice(0, 2).map((p, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md bg-slate-950/60 border border-slate-800 text-slate-400 text-[10px] font-mono"
              >
                {p.replace(/_/g, ' ')}
              </span>
            ))}
            {template.recommended_platform.length > 2 && (
              <span className="text-[10px] text-slate-500 font-mono self-center">
                +{template.recommended_platform.length - 2}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-3.5 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <button
          onClick={onCopy}
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[36px]"
          title="Salin Prompt ke Clipboard"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{isCopied ? 'Tersalin' : 'Salin'}</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onUse();
          }}
          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-emerald-950/30 min-h-[36px]"
        >
          <span>Gunakan Template</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
