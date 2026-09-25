'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Layers,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit3,
  Eye,
  Check,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Sliders,
  Flame,
  Copy,
  FolderLock,
  Tag,
  Camera,
  Share2,
  Smile,
  UserCheck,
  BarChart2,
  Monitor,
  Calendar,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

export interface AdminPromptCategory {
  id: string;
  category_code: string;
  display_name: string;
  description: string;
  icon_key: string;
  display_order: number;
  template_count?: number;
  created_at?: string;
}

export interface AdminPromptTemplate {
  id: string;
  category_id: string;
  category_code: string;
  category_name?: string;
  category_icon?: string;
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
  created_at: string;
  updated_at?: string;
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
};

export function PromptTemplateCuratorScreen() {
  const [activeTab, setActiveTab] = useState<'templates' | 'categories'>('templates');
  const [categories, setCategories] = useState<AdminPromptCategory[]>([]);
  const [templates, setTemplates] = useState<AdminPromptTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<AdminPromptCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    category_code: '',
    display_name: '',
    description: '',
    icon_key: 'layers',
    display_order: 0,
  });

  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<AdminPromptTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    category_code: 'social_media_post',
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
    recommended_platform_raw: 'instagram_feed, presentation',
    is_global: true,
  });

  const [inspectingTemplate, setInspectingTemplate] = useState<AdminPromptTemplate | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const adminTenantId = '10e75d63-15f8-42e8-a6ce-24fece12cd04';

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch categories
      const catRes = await fetch(`/api/v1/tenants/${adminTenantId}/generative/prompt-categories`);
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.data || []);
      }

      // 2. Fetch templates
      let tplUrl = `/api/v1/tenants/${adminTenantId}/generative/prompt-templates?scope=global`;
      if (selectedCategory !== 'all') {
        tplUrl += `&category_code=${encodeURIComponent(selectedCategory)}`;
      }
      if (searchQuery.trim()) {
        tplUrl += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const tplRes = await fetch(tplUrl);
      if (tplRes.ok) {
        const tplData = await tplRes.json();
        setTemplates(tplData.data || []);
      }
    } catch (err: any) {
      setErrorMsg('Gagal memuat data kurasi template prompt.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCategory, searchQuery]);

  const handleOpenCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm({
      category_code: '',
      display_name: '',
      description: '',
      icon_key: 'layers',
      display_order: categories.length + 1,
    });
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat: AdminPromptCategory) => {
    setEditingCategory(cat);
    setCategoryForm({
      category_code: cat.category_code,
      display_name: cat.display_name,
      description: cat.description,
      icon_key: cat.icon_key,
      display_order: cat.display_order,
    });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.category_code.trim() || !categoryForm.display_name.trim()) return;

    setActionLoading(true);
    try {
      if (editingCategory) {
        const res = await fetch(`/api/v1/tenants/${adminTenantId}/generative/prompt-categories/${editingCategory.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: categoryForm.display_name.trim(),
            description: categoryForm.description.trim(),
            icon_key: categoryForm.icon_key,
            display_order: parseInt(String(categoryForm.display_order), 10) || 0,
          }),
        });
        if (!res.ok) throw new Error('Gagal memperbarui kategori.');
        setSuccessMsg(`Kategori "${categoryForm.display_name}" berhasil diperbarui.`);
      } else {
        const res = await fetch(`/api/v1/tenants/${adminTenantId}/generative/prompt-categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_code: categoryForm.category_code.trim().toLowerCase(),
            display_name: categoryForm.display_name.trim(),
            description: categoryForm.description.trim(),
            icon_key: categoryForm.icon_key,
            display_order: parseInt(String(categoryForm.display_order), 10) || 0,
          }),
        });
        if (!res.ok) throw new Error('Gagal menambahkan kategori.');
        setSuccessMsg(`Kategori "${categoryForm.display_name}" berhasil didaftarkan.`);
      }
      setShowCategoryModal(false);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  };

  const handleDeleteCategory = async (catId: string, name: string) => {
    if (!confirm(`Hapus kategori "${name}"? Seluruh template terkait akan terpengaruh.`)) return;
    try {
      const res = await fetch(`/api/v1/tenants/${adminTenantId}/generative/prompt-categories/${catId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Gagal menghapus kategori.');
      setSuccessMsg(`Kategori "${name}" berhasil dihapus.`);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  };

  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      category_code: categories[0]?.category_code || 'social_media_post',
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
      recommended_platform_raw: 'instagram_feed, presentation',
      is_global: true,
    });
    setShowTemplateModal(true);
  };

  const handleOpenEditTemplate = (tpl: AdminPromptTemplate) => {
    setEditingTemplate(tpl);
    setTemplateForm({
      category_code: tpl.category_code,
      template_name: tpl.template_name,
      concept_summary: tpl.concept_summary,
      subject_field: tpl.subject_field,
      scene_context_field: tpl.scene_context_field || '',
      lighting_field: tpl.lighting_field || '',
      material_texture_field: tpl.material_texture_field || '',
      composition_layout_field: tpl.composition_layout_field || '',
      color_palette_field: tpl.color_palette_field || '',
      style_reference_field: tpl.style_reference_field || '',
      constraints_field: tpl.constraints_field || '',
      avoid_terms_raw: (tpl.avoid_terms || []).join(', '),
      prefer_terms_raw: (tpl.prefer_terms || []).join(', '),
      recommended_aspect_ratio: tpl.recommended_aspect_ratio || '1:1',
      recommended_platform_raw: (tpl.recommended_platform || []).join(', '),
      is_global: tpl.is_global,
    });
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.template_name.trim() || !templateForm.subject_field.trim()) return;

    setActionLoading(true);
    try {
      const avoidList = templateForm.avoid_terms_raw.split(',').map((s) => s.trim()).filter(Boolean);
      const preferList = templateForm.prefer_terms_raw.split(',').map((s) => s.trim()).filter(Boolean);
      const platformList = templateForm.recommended_platform_raw.split(',').map((s) => s.trim()).filter(Boolean);

      if (editingTemplate) {
        const res = await fetch(`/api/v1/tenants/${adminTenantId}/generative/prompt-templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_name: templateForm.template_name.trim(),
            concept_summary: templateForm.concept_summary.trim() || templateForm.template_name.trim(),
            subject_field: templateForm.subject_field.trim(),
            scene_context_field: templateForm.scene_context_field.trim() || undefined,
            lighting_field: templateForm.lighting_field.trim() || undefined,
            material_texture_field: templateForm.material_texture_field.trim() || undefined,
            composition_layout_field: templateForm.composition_layout_field.trim() || undefined,
            color_palette_field: templateForm.color_palette_field.trim() || undefined,
            style_reference_field: templateForm.style_reference_field.trim() || undefined,
            constraints_field: templateForm.constraints_field.trim() || undefined,
            avoid_terms: avoidList,
            prefer_terms: preferList,
            recommended_aspect_ratio: templateForm.recommended_aspect_ratio,
            recommended_platform: platformList,
          }),
        });
        if (!res.ok) throw new Error('Gagal memperbarui template.');
        setSuccessMsg(`Template "${templateForm.template_name}" berhasil diperbarui.`);
      } else {
        const res = await fetch(`/api/v1/tenants/${adminTenantId}/generative/prompt-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_code: templateForm.category_code,
            template_name: templateForm.template_name.trim(),
            concept_summary: templateForm.concept_summary.trim() || templateForm.template_name.trim(),
            subject_field: templateForm.subject_field.trim(),
            scene_context_field: templateForm.scene_context_field.trim() || undefined,
            lighting_field: templateForm.lighting_field.trim() || undefined,
            material_texture_field: templateForm.material_texture_field.trim() || undefined,
            composition_layout_field: templateForm.composition_layout_field.trim() || undefined,
            color_palette_field: templateForm.color_palette_field.trim() || undefined,
            style_reference_field: templateForm.style_reference_field.trim() || undefined,
            constraints_field: templateForm.constraints_field.trim() || undefined,
            avoid_terms: avoidList,
            prefer_terms: preferList,
            recommended_aspect_ratio: templateForm.recommended_aspect_ratio,
            recommended_platform: platformList,
            is_global: true,
          }),
        });
        if (!res.ok) throw new Error('Gagal menambahkan template.');
        setSuccessMsg(`Template "${templateForm.template_name}" berhasil didaftarkan ke repositori global.`);
      }
      setShowTemplateModal(false);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  };

  const handleDeleteTemplate = async (tplId: string, name: string) => {
    if (!confirm(`Hapus template global "${name}"? Tindakan ini permanen.`)) return;
    try {
      const res = await fetch(`/api/v1/tenants/${adminTenantId}/generative/prompt-templates/${tplId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Gagal menghapus template.');
      setSuccessMsg(`Template "${name}" berhasil dihapus.`);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Kurasi Pustaka Template Prompt & Kategori Global
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pengelolaan repositori resmi template prompt atomik terstruktur dan kategori visual untuk seluruh tenant platform.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan</span>
          </button>
          {activeTab === 'templates' ? (
            <button
              type="button"
              onClick={handleOpenCreateTemplate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Template Global</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCreateCategory}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kategori Master</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
            activeTab === 'templates'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Template Prompt Global ({templates.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
            activeTab === 'categories'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Kategori Master Data ({categories.length})</span>
        </button>
      </div>

      {/* TAB 1: TEMPLATE PROMPT GLOBAL */}
      {activeTab === 'templates' && (
        <div className="space-y-5">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-400 font-semibold whitespace-nowrap">Kategori:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Semua Kategori ({templates.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.category_code}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari template atau subjek..." // allowlist: standard UI input hint
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Grid / List Template */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Memuat data template global...</div>
          ) : templates.length === 0 ? (
            <EmptyState
              id="admin-no-templates"
              icon={Sparkles}
              title="Belum Ada Template Global"
              description="Belum ada template prompt terdaftar pada kategori ini. Anda dapat menambahkan template atomik baru."
              actionLabel="Tambah Template Global"
              onAction={handleOpenCreateTemplate}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {templates.map((tpl) => {
                const IconComponent = CATEGORY_ICON_MAP[tpl.category_icon || 'layers'] || Layers;
                return (
                  <div
                    key={tpl.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Thumbnail */}
                      <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800">
                        {tpl.example_image_url ? (
                          <img
                            src={tpl.example_image_url}
                            alt={tpl.template_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-600">
                            <IconComponent className="w-8 h-8" />
                          </div>
                        )}
                        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur border border-slate-800 text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <IconComponent className="w-3 h-3" />
                          <span>{tpl.category_name || tpl.category_code}</span>
                        </span>
                        <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur border border-slate-800 text-[10px] font-mono text-slate-300">
                          {tpl.recommended_aspect_ratio}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-sm text-white line-clamp-1">{tpl.template_name}</h3>
                          <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 text-[10px] font-mono shrink-0">
                            {tpl.usage_count}x pakai
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {tpl.concept_summary}
                        </p>

                        <div className="pt-2 text-[11px] text-slate-500 space-y-1 border-t border-slate-800/60">
                          <div className="truncate">
                            <strong className="text-slate-400">Subjek:</strong> {tpl.subject_field}
                          </div>
                          {tpl.style_reference_field && (
                            <div className="truncate">
                              <strong className="text-slate-400">Gaya:</strong> {tpl.style_reference_field}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-4 pt-0 flex items-center justify-between border-t border-slate-800/60 mt-3 pt-3">
                      <button
                        type="button"
                        onClick={() => setInspectingTemplate(tpl)}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail Atomik</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditTemplate(tpl)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                          title="Edit Template"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(tpl.id, tpl.template_name)}
                          className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-400 border border-red-800/40 transition"
                          title="Hapus Template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: KATEGORI MASTER DATA */}
      {activeTab === 'categories' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((cat) => {
              const IconComp = CATEGORY_ICON_MAP[cat.icon_key] || Layers;
              return (
                <div
                  key={cat.id}
                  className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <IconComp className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md">
                        Urutan #{cat.display_order}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-white">{cat.display_name}</h4>
                    <span className="text-[11px] font-mono text-emerald-400 block mb-2">{cat.category_code}</span>
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{cat.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">
                      {cat.template_count || 0} template aktif
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditCategory(cat)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="Edit Kategori"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id, cat.display_name)}
                        className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-400 border border-red-800/40"
                        title="Hapus Kategori"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: Form Kategori */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white">
                {editingCategory ? 'Edit Kategori Template' : 'Tambah Kategori Master Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Kode Kategori (Unique)</label>
                <input
                  type="text"
                  disabled={Boolean(editingCategory)}
                  value={categoryForm.category_code}
                  onChange={(e) => setCategoryForm({ ...categoryForm, category_code: e.target.value })}
                  placeholder="misal: social_media_post" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 disabled:opacity-50"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nama Tampilan</label>
                <input
                  type="text"
                  value={categoryForm.display_name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, display_name: e.target.value })}
                  placeholder="misal: Post Media Sosial (Promosi Produk)" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Deskripsi Kategori</label>
                <textarea
                  rows={3}
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  placeholder="Jelaskan tujuan format visual untuk kategori ini..." // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Icon Key</label>
                  <select
                    value={categoryForm.icon_key}
                    onChange={(e) => setCategoryForm({ ...categoryForm, icon_key: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="share-2">share-2 (Media Sosial)</option>
                    <option value="camera">camera (Foto Produk)</option>
                    <option value="tag">tag (Promo & Diskon)</option>
                    <option value="smile">smile (Maskot)</option>
                    <option value="user-check">user-check (Avatar Staf)</option>
                    <option value="bar-chart-2">bar-chart-2 (Infografis)</option>
                    <option value="monitor">monitor (Mockup Pitch)</option>
                    <option value="calendar">calendar (Event Poster)</option>
                    <option value="layers">layers (Umum)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Urutan Tampilan</label>
                  <input
                    type="number"
                    value={categoryForm.display_order}
                    onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white shadow-md"
                >
                  {actionLoading ? 'Menyimpan...' : 'Simpan Kategori'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Form Template Atomik */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white">
                {editingTemplate ? 'Edit Template Prompt Global' : 'Tambah Template Prompt Global Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Kategori Master</label>
                  <select
                    value={templateForm.category_code}
                    onChange={(e) => setTemplateForm({ ...templateForm, category_code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.category_code}>
                        {c.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Rekomendasi Rasio Aspek</label>
                  <select
                    value={templateForm.recommended_aspect_ratio}
                    onChange={(e) => setTemplateForm({ ...templateForm, recommended_aspect_ratio: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="1:1">1:1 (Persegi)</option>
                    <option value="16:9">16:9 (Lanskap Hero)</option>
                    <option value="9:16">9:16 (Vertikal Story)</option>
                    <option value="4:5">4:5 (Potret Media Sosial)</option>
                    <option value="3:4">3:4 (Poster Vertikal)</option>
                    <option value="4:3">4:3 (Presentasi)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nama Template</label>
                <input
                  type="text"
                  value={templateForm.template_name}
                  onChange={(e) => setTemplateForm({ ...templateForm, template_name: e.target.value })}
                  placeholder="misal: Promosi Produk Studio Minimalis Tropis" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Ringkasan Konsep (Bahasa Indonesia)</label>
                <textarea
                  rows={2}
                  value={templateForm.concept_summary}
                  onChange={(e) => setTemplateForm({ ...templateForm, concept_summary: e.target.value })}
                  placeholder="Ringkasan konsep visual untuk pengguna..." // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Skema Atomik Terstruktur */}
              <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Struktur Skema Atomik (F.01 Visual Composer)
                </span>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">1. Subjek Utama (Wajib)</label>
                  <input
                    type="text"
                    value={templateForm.subject_field}
                    onChange={(e) => setTemplateForm({ ...templateForm, subject_field: e.target.value })}
                    placeholder="misal: Produk botol kaca kemasan minuman herbal artisan lokal pada podium batu travertine" // allowlist: standard UI input hint
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">2. Latar & Konteks</label>
                    <input
                      type="text"
                      value={templateForm.scene_context_field}
                      onChange={(e) => setTemplateForm({ ...templateForm, scene_context_field: e.target.value })}
                      placeholder="Latar dinding krem hangat dengan siluet daun palem" // allowlist: standard UI input hint
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">3. Pencahayaan</label>
                    <input
                      type="text"
                      value={templateForm.lighting_field}
                      onChange={(e) => setTemplateForm({ ...templateForm, lighting_field: e.target.value })}
                      placeholder="Pencahayaan studio lembut dari samping kiri" // allowlist: standard UI input hint
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">4. Material & Tekstur</label>
                    <input
                      type="text"
                      value={templateForm.material_texture_field}
                      onChange={(e) => setTemplateForm({ ...templateForm, material_texture_field: e.target.value })}
                      placeholder="Kaca botol bening, label kertas daur ulang matte" // allowlist: standard UI input hint
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">5. Komposisi & Tata Letak</label>
                    <input
                      type="text"
                      value={templateForm.composition_layout_field}
                      onChange={(e) => setTemplateForm({ ...templateForm, composition_layout_field: e.target.value })}
                      placeholder="Komposisi rule-of-thirds, ruang kosong lega untuk teks" // allowlist: standard UI input hint
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">6. Palet Warna</label>
                    <input
                      type="text"
                      value={templateForm.color_palette_field}
                      onChange={(e) => setTemplateForm({ ...templateForm, color_palette_field: e.target.value })}
                      placeholder="Earthy warm neutrals, beige krem, terakota" // allowlist: standard UI input hint
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">7. Gaya Visual</label>
                    <input
                      type="text"
                      value={templateForm.style_reference_field}
                      onChange={(e) => setTemplateForm({ ...templateForm, style_reference_field: e.target.value })}
                      placeholder="Fotografi komersial modern kontemporer minimalis" // allowlist: standard UI input hint
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">8. Batasan Wajib (Constraints)</label>
                  <input
                    type="text"
                    value={templateForm.constraints_field}
                    onChange={(e) => setTemplateForm({ ...templateForm, constraints_field: e.target.value })}
                    placeholder="Tanpa watermark, tanpa logo eksternal, garis presisi" // allowlist: standard UI input hint
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                  />
                </div>
              </div>

              {/* Edukasi Prompt: Avoid vs Prefer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-rose-400 font-semibold mb-1">Kata yang Sebaiknya Dihindari</label>
                  <input
                    type="text"
                    value={templateForm.avoid_terms_raw}
                    onChange={(e) => setTemplateForm({ ...templateForm, avoid_terms_raw: e.target.value })}
                    placeholder="blurry, watermark, garish neon..." // allowlist: standard UI input hint
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-emerald-400 font-semibold mb-1">Kata yang Dianjurkan (Konkret)</label>
                  <input
                    type="text"
                    value={templateForm.prefer_terms_raw}
                    onChange={(e) => setTemplateForm({ ...templateForm, prefer_terms_raw: e.target.value })}
                    placeholder="soft window light, rule-of-thirds..." // allowlist: standard UI input hint
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Platform Rekomendasi (Pisahkan Koma)</label>
                <input
                  type="text"
                  value={templateForm.recommended_platform_raw}
                  onChange={(e) => setTemplateForm({ ...templateForm, recommended_platform_raw: e.target.value })}
                  placeholder="instagram_feed, whatsapp_catalog, marketplace_listing" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white shadow-md"
                >
                  {actionLoading ? 'Menyimpan...' : 'Simpan Template Global'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Detail Atomik Template */}
      {inspectingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">{inspectingTemplate.template_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingTemplate(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[70vh] overflow-y-auto pr-1">
              {inspectingTemplate.example_image_url && (
                <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                  <img
                    src={inspectingTemplate.example_image_url}
                    alt={inspectingTemplate.template_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <p className="text-slate-300 leading-relaxed">{inspectingTemplate.concept_summary}</p>

              <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2">
                <span className="font-bold text-emerald-400 text-[11px] uppercase tracking-wider block">
                  Elemen Atomik Terstruktur
                </span>
                <p><strong>Subjek:</strong> {inspectingTemplate.subject_field}</p>
                {inspectingTemplate.scene_context_field && <p><strong>Latar:</strong> {inspectingTemplate.scene_context_field}</p>}
                {inspectingTemplate.lighting_field && <p><strong>Pencahayaan:</strong> {inspectingTemplate.lighting_field}</p>}
                {inspectingTemplate.material_texture_field && <p><strong>Material:</strong> {inspectingTemplate.material_texture_field}</p>}
                {inspectingTemplate.composition_layout_field && <p><strong>Komposisi:</strong> {inspectingTemplate.composition_layout_field}</p>}
                {inspectingTemplate.color_palette_field && <p><strong>Palet Warna:</strong> {inspectingTemplate.color_palette_field}</p>}
                {inspectingTemplate.style_reference_field && <p><strong>Gaya:</strong> {inspectingTemplate.style_reference_field}</p>}
                {inspectingTemplate.constraints_field && <p><strong>Batasan:</strong> {inspectingTemplate.constraints_field}</p>}
              </div>

              {/* Edukasi avoid vs prefer */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1">
                  <span className="text-rose-400 font-bold block text-[11px]">Kata Dihindari:</span>
                  <div className="flex flex-wrap gap-1">
                    {(inspectingTemplate.avoid_terms || []).map((t, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px]">
                        ✕ {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                  <span className="text-emerald-400 font-bold block text-[11px]">Kata Dianjurkan:</span>
                  <div className="flex flex-wrap gap-1">
                    {(inspectingTemplate.prefer_terms || []).map((t, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px]">
                        ✓ {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInspectingTemplate(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
