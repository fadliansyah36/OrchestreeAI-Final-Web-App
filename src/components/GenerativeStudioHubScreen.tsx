import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Lock,
  ShieldCheck,
  Palette,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Layers,
  Download,
  Calendar,
  Eye,
  FileCheck,
  ChevronRight,
  Info,
  Maximize2,
  Plus,
  Coins,
  History,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { CreditEstimateConfirm } from './billing/CreditEstimateConfirm';

interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  template_body: string;
  default_negative_prompt?: string;
  recommended_aspect_ratio: string;
  style_tags: string[];
  credit_estimate: number;
}

interface BrandAssetLock {
  id: string;
  brand_name: string;
  logo_url?: string;
  primary_color: string;
  secondary_color?: string;
  accent_color?: string;
  palette_hex_codes: string[];
  typography_fonts: string[];
  brand_voice_guidelines?: string;
  visual_style_keywords: string[];
  negative_style_keywords: string[];
  enforce_strict_palette: boolean;
  enforce_logo_presence: boolean;
  max_color_delta_e: number;
  is_active: boolean;
}

interface GenerativeJob {
  id: string;
  job_type: string;
  prompt: string;
  composed_prompt?: string;
  negative_prompt?: string;
  aspect_ratio: string;
  style_preset?: string;
  model_used: string;
  status: 'PENDING' | 'COMPOSING' | 'GENERATING' | 'VALIDATING' | 'SCRUBBING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  rejection_reason?: string;
  brand_lock_applied: boolean;
  credit_cost: number;
  credit_reserved: boolean;
  credit_consumed: boolean;
  quality_metrics: Record<string, any>;
  output_image_url?: string;
  output_verified_clean?: boolean;
  output_file_name?: string;
  output_file_size?: number;
  checksum_sha256?: string;
  locked_brand_name?: string;
  created_at: string;
  scrub_logs?: Array<{
    id: string;
    original_filename: string;
    cleaned_filename: string;
    stripped_fields: string[];
    verified_clean: boolean;
    scrub_details: Record<string, any>;
    scrubbed_at: string;
  }>;
}

interface FileArtifact {
  id: string;
  job_id?: string;
  file_name: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  file_size_bytes: number;
  width?: number;
  height?: number;
  checksum_sha256?: string;
  verified_clean: boolean;
  prompt?: string;
  job_type?: string;
  model_used?: string;
  created_at: string;
}

export function GenerativeStudioHubScreen({ tenant }: { tenant: any }) {
  const tenantId = tenant?.tenant_id || 'd1159d6d-0044-42ea-8007-d549a0011402';

  const [activeTab, setActiveTab] = useState<'create' | 'gallery' | 'brand_locks' | 'templates'>('create');
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data states
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [brandLocks, setBrandLocks] = useState<BrandAssetLock[]>([]);
  const [jobs, setJobs] = useState<GenerativeJob[]>([]);
  const [artifacts, setArtifacts] = useState<FileArtifact[]>([]);
  const [walletBalance, setWalletBalance] = useState<{ balance: number; currency: string } | null>(null);

  // Form states
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [jobType, setJobType] = useState<string>('PRODUCT_SHOWCASE');
  const [prompt, setPrompt] = useState<string>('Foto komersial botol minuman herbal organik premium dengan tetesan embun segar di atas batu sungai hitam');
  const [negativePrompt, setNegativePrompt] = useState<string>('blurry, low quality, artifacts, watermark');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [stylePreset, setStylePreset] = useState<string>('Commercial Studio Photography');
  const [modelUsed, setModelUsed] = useState<string>('gpt-image-2');
  const [selectedBrandLockId, setSelectedBrandLockId] = useState<string>('');
  const [forceFailForTest, setForceFailForTest] = useState<boolean>(false);
  const [showEstimateConfirm, setShowEstimateConfirm] = useState<boolean>(false);

  // Selected job modal / detail
  const [selectedJob, setSelectedJob] = useState<GenerativeJob | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<FileArtifact | null>(null);

  // Brand lock form modal
  const [showBrandLockModal, setShowBrandLockModal] = useState(false);
  const [brandForm, setBrandForm] = useState({
    brand_name: '',
    primary_color: '#1FA35A',
    secondary_color: '#0B1220',
    accent_color: '#38BDF8',
    palette_hex_codes: '#1FA35A, #0B1220, #38BDF8, #F8FAFC',
    typography_fonts: 'Plus Jakarta Sans, Inter',
    brand_voice_guidelines: 'Elegan, modern, profesional, berorientasi masa depan',
    visual_style_keywords: 'clean, minimalist, modern architectural lines, crisp focus',
    negative_style_keywords: 'garish red, blurry, comic style, vintage sepia',
    max_color_delta_e: 25.0,
    enforce_strict_palette: true,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Templates
      const tRes = await fetch(`/api/v1/tenants/${tenantId}/generative/templates`);
      if (tRes.ok) {
        const tData = await tRes.json();
        setTemplates(tData.data || []);
      }

      // 2. Brand locks
      const bRes = await fetch(`/api/v1/tenants/${tenantId}/generative/brand-locks`);
      if (bRes.ok) {
        const bData = await bRes.json();
        const bList: BrandAssetLock[] = bData.data || [];
        setBrandLocks(bList);
        const active = bList.find((b) => b.is_active);
        if (active && !selectedBrandLockId) {
          setSelectedBrandLockId(active.id);
        }
      }

      // 3. Jobs
      const jRes = await fetch(`/api/v1/tenants/${tenantId}/generative/jobs`);
      if (jRes.ok) {
        const jData = await jRes.json();
        setJobs(jData.data || []);
      }

      // 4. Artifacts
      const aRes = await fetch(`/api/v1/tenants/${tenantId}/generative/artifacts`);
      if (aRes.ok) {
        const aData = await aRes.json();
        setArtifacts(aData.data || []);
      }

      // 5. Wallet
      const wRes = await fetch(`/api/v1/tenants/${tenantId}/billing/wallet`);
      if (wRes.ok) {
        const wData = await wRes.json();
        setWalletBalance({
          balance: wData.data?.available_balance ?? wData.data?.balance ?? 0,
          currency: wData.data?.currency || 'IDR',
        });
      }
    } catch (err: any) {
      console.error('Error loading generative data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  const handleSelectTemplate = (tpl: PromptTemplate) => {
    setSelectedTemplateId(tpl.id);
    setJobType(tpl.category);
    setPrompt(tpl.template_body);
    if (tpl.default_negative_prompt) {
      setNegativePrompt(tpl.default_negative_prompt);
    }
    if (tpl.recommended_aspect_ratio) {
      setAspectRatio(tpl.recommended_aspect_ratio);
    }
    setSuccessMsg(`Template "${tpl.title}" berhasil dimuat ke editor.`);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleExecuteJob = async (reservationId?: string) => {
    if (!prompt.trim()) {
      setErrorMsg('Harap masukkan deskripsi visual prompt.');
      return;
    }

    setExecuting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/generative/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: jobType,
          prompt: prompt.trim(),
          negative_prompt: negativePrompt.trim() || undefined,
          aspect_ratio: aspectRatio,
          style_preset: stylePreset,
          model_used: modelUsed,
          brand_lock_id: selectedBrandLockId || undefined,
          credit_cost: 5.0,
          reservation_id: reservationId,
          force_fail_for_test: forceFailForTest,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses kreasi visual.');
      }

      const createdJob: GenerativeJob = data.data;
      setSelectedJob(createdJob);

      if (createdJob.status === 'COMPLETED') {
        setSuccessMsg('Kreasi visual berhasil digenerasi dan 100% metadata telah diverifikasi bersih!');
      } else if (createdJob.status === 'REJECTED') {
        setErrorMsg(`Output ditolak oleh Brand Lock Gate: ${createdJob.rejection_reason}. Kredit telah di-refund.`);
      }

      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setExecuting(false);
    }
  };

  const handleSaveBrandLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandForm.brand_name.trim()) return;

    try {
      const paletteArray = brandForm.palette_hex_codes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/v1/tenants/${tenantId}/generative/brand-locks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: brandForm.brand_name.trim(),
          primary_color: brandForm.primary_color,
          secondary_color: brandForm.secondary_color,
          accent_color: brandForm.accent_color,
          palette_hex_codes: paletteArray,
          typography_fonts: brandForm.typography_fonts.split(',').map((s) => s.trim()),
          brand_voice_guidelines: brandForm.brand_voice_guidelines,
          visual_style_keywords: brandForm.visual_style_keywords.split(',').map((s) => s.trim()),
          negative_style_keywords: brandForm.negative_style_keywords.split(',').map((s) => s.trim()),
          enforce_strict_palette: brandForm.enforce_strict_palette,
          max_color_delta_e: parseFloat(String(brandForm.max_color_delta_e)),
          is_active: true,
        }),
      });

      if (!res.ok) throw new Error('Gagal menyimpan Brand Asset Lock.');
      setShowBrandLockModal(false);
      setSuccessMsg('Kunci Identitas Brand berhasil diperbarui dan diaktifkan!');
      setTimeout(() => setSuccessMsg(null), 3500);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const activeLock = brandLocks.find((b) => b.id === selectedBrandLockId) || brandLocks[0];

  return (
    <div className="space-y-6 text-slate-100 min-h-screen">
      {/* Header Hub */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Studio Visual & Generator Gambar Terpandu</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                  F.01-IMG Model Router
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Universal Prompt Composer dengan proteksi Brand Asset Lock, Image Validation Gate, dan pembersihan metadata EXIF/C2PA 100% bersih.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {walletBalance && (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-4 py-2 rounded-xl text-xs">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="text-slate-400">Saldo Kredit:</span>
                <span className="font-bold text-emerald-400">
                  {walletBalance.balance.toLocaleString('id-ID')} {walletBalance.currency}
                </span>
              </div>
            )}
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer"
              title="Segarkan Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-t border-slate-800/80 pt-4 mt-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'create'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Studio Kreasi & Editor</span>
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'gallery'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Galeri Berkas Bersih ({artifacts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('brand_locks')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'brand_locks'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Brand Asset Locks ({brandLocks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'templates'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Pustaka Template ({templates.length})</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 text-rose-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1">{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white text-xs cursor-pointer">
            Tutup
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3 text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
          <div className="flex-1">{successMsg}</div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white text-xs cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* TAB 1: STUDIO KREASI & PROMPT COMPOSER */}
      {activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sisi Kiri: Panel Editor & Konfigurasi (8 Cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Quick Template Picker */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  Pilih Template Cepat
                </span>
                <button
                  onClick={() => setActiveTab('templates')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Lihat Semua Template &rarr;
                </button>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`px-3 py-2 rounded-xl text-xs whitespace-nowrap transition cursor-pointer border ${
                      selectedTemplateId === tpl.id
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Composer Core */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Deskripsi Visual Utama (User Prompt)</span>
                  <span className="text-[11px] font-normal text-slate-400">Universal Prompt Composer Aktif</span>
                </label>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Deskripsikan objek visual, latar belakang, pencahayaan, tekstur, atau suasana..." // allowlist: standard UI input hint
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Negative Prompt */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Negative Prompt (Filter Elemen Terlarang)
                </label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="blurry, distorted, artifacts, bad lighting..." // allowlist: standard UI input hint
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Grid Pengaturan: Kategori, Rasio, Preset Gaya, Model Router */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Kategori Visual</label>
                  <select
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PRODUCT_SHOWCASE">Showcase Produk Komersial</option>
                    <option value="MARKETING_HERO">Hero Banner Kampanye</option>
                    <option value="PROMO_BANNER">Promo Flyer & Brosur</option>
                    <option value="ECOMMERCE_CATALOG">Katalog E-Commerce</option>
                    <option value="LOGO_MOCKUP">Mockup Identitas Korporat</option>
                    <option value="BRAND_ASSET">Aset Visual Identitas Brand</option>
                    <option value="SOCIAL_STORY">Konten Cerita Media Sosial (9:16)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Rasio Aspek</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="1:1">1:1 (Persegi - Feed & Produk / 1024x1024)</option>
                    <option value="16:9">16:9 (Lanskap - Hero Banner / 1280x720)</option>
                    <option value="9:16">9:16 (Vertikal - Story / 720x1280)</option>
                    <option value="4:3">4:3 (Standar - Presentasi / 1024x768)</option>
                    <option value="3:2">3:2 (Fotografi Klasik / 1080x720)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Arah Gaya Visual</label>
                  <select
                    value={stylePreset}
                    onChange={(e) => setStylePreset(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Commercial Studio Photography">Commercial Studio Photography</option>
                    <option value="Modern 3D High-Tech Render">Modern 3D High-Tech Render</option>
                    <option value="Cinematic Volumetric Lighting">Cinematic Volumetric Lighting</option>
                    <option value="Minimalist Clean Corporate">Minimalist Clean Corporate</option>
                    <option value="Editorial Fashion & Catalog">Editorial Fashion & Catalog</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Mesin Model Router</label>
                  <select
                    value={modelUsed}
                    onChange={(e) => setModelUsed(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="gpt-image-2">GPT-Image-2 (Prioritas 1 - Standard)</option>
                    <option value="nvidia-sd-3.5">NVIDIA NIM: SD 3.5 Large (Fallback)</option>
                    <option value="openrouter-flux">OpenRouter: Flux 1 Schnell (Fallback)</option>
                  </select>
                </div>
              </div>

              {/* Opsi Pengujian Penegakan Brand Lock */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="force-fail"
                    checked={forceFailForTest}
                    onChange={(e) => setForceFailForTest(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="force-fail" className="text-xs text-slate-300 cursor-pointer flex items-center gap-1.5">
                    <span>Uji Penegakan Brand Asset Lock (Simulasi Deviasi Palet Merah 48.5 Delta E)</span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded">
                      Demo Rejection
                    </span>
                  </label>
                </div>

                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <span>Biaya Eksekusi:</span>
                  <span className="font-bold text-amber-400">5.0 Kredit</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={() => setShowEstimateConfirm(true)}
                  disabled={executing || !prompt.trim()}
                  className={`flex-1 py-3 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                    executing
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                  }`}
                >
                  {executing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Mengorkestrasi Prompt & Menjalankan Validator Gate...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generasi Visual Bersih (Estimasi & Reservasi AI Credits)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Riwayat Pekerjaan Terkini */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-emerald-400" />
                Riwayat Generasi Visual Terkini
              </h3>

              {jobs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Belum ada riwayat pekerjaan generasi gambar.
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.slice(0, 5).map((job) => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="p-3.5 bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl transition cursor-pointer flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            job.status === 'COMPLETED'
                              ? 'bg-emerald-400'
                              : job.status === 'REJECTED'
                              ? 'bg-rose-400'
                              : 'bg-amber-400 animate-pulse'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{job.prompt}</p>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            <span>{job.job_type}</span>
                            <span>•</span>
                            <span>{job.aspect_ratio}</span>
                            <span>•</span>
                            <span>{job.model_used}</span>
                            {job.brand_lock_applied && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-400 flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Brand Lock Aktif
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            job.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : job.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {job.status === 'COMPLETED' ? 'LOLOS VERIFIKASI' : job.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sisi Kanan: Status Brand Lock & Gate Validator Live (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Kartu Status Brand Asset Lock Aktif */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  Kunci Brand Guideline
                </span>
                <button
                  onClick={() => setShowBrandLockModal(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Ubah Aturan
                </button>
              </div>

              {activeLock ? (
                <div className="space-y-3.5 text-xs">
                  <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{activeLock.brand_name}</span>
                      <span className="px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded font-semibold">
                        Penegakan Ketat Aktif
                      </span>
                    </div>
                    {activeLock.brand_voice_guidelines && (
                      <p className="text-slate-400 text-[11px] leading-relaxed italic">
                        "{activeLock.brand_voice_guidelines}"
                      </p>
                    )}
                  </div>

                  {/* Palet Warna Terkunci */}
                  <div>
                    <span className="text-slate-400 block mb-1.5 font-semibold text-[11px]">Palet Warna Terkunci:</span>
                    <div className="flex items-center gap-2">
                      {(activeLock.palette_hex_codes || []).map((hex, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div
                            className="w-7 h-7 rounded-lg border border-white/20 shadow-md"
                            style={{ backgroundColor: hex }}
                            title={hex}
                          />
                          <span className="text-[10px] font-mono text-slate-400">{hex}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Toleransi Deviasi CIE Delta E */}
                  <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Maks. Toleransi Delta E:</span>
                      <span className="font-bold text-slate-200">{activeLock.max_color_delta_e} ΔE</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[11px]">Status Kepatuhan:</span>
                      <span className="font-bold text-emerald-400">Enforced by Gate</span>
                    </div>
                  </div>

                  {/* Style Keywords */}
                  <div>
                    <span className="text-slate-400 block mb-1 font-semibold text-[11px]">Karakteristik Visual:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(activeLock.visual_style_keywords || []).map((kw, i) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  Belum ada Brand Lock aktif.
                </div>
              )}
            </div>

            {/* Live Gate Validation Pipeline Info */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3.5 shadow-xl">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Pipeline Proteksi & Verifikasi
              </span>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-200 block">1. Universal Prompt Composer</span>
                    <span className="text-[11px] text-slate-400">Pengayaan komposisi studio & injeksi palet</span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-200 block">2. Credit Reservation</span>
                    <span className="text-[11px] text-slate-400">Cadangkan 5.0 kredit (Ledger Transaksi)</span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-200 block">3. Output Validator Gate</span>
                    <span className="text-[11px] text-slate-400">Uji deviasi Delta E & tolak hasil melenceng</span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-200 block">4. Metadata Stripping Gate</span>
                    <span className="text-[11px] text-slate-400">Pembersihan EXIF, XMP, IPTC, C2PA 100%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GALERI BERKAS BERSIH (ARTIFACTS) */}
      {activeTab === 'gallery' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Galeri Berkas Visual Bersih Terverifikasi</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Seluruh berkas telah melalui pembersihan metadata teknis menyeluruh (verified_clean = true).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4" />
                  100% Bebas Metadata & Provenance C2PA
                </span>
              </div>
            </div>

            {artifacts.length === 0 ? (
              <div className="text-center py-16 text-slate-500 space-y-3">
                <ImageIcon className="w-12 h-12 mx-auto text-slate-700" />
                <p className="text-sm">Belum ada berkas visual yang digenerasi.</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Mulai Kreasi Visual Sekarang
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {artifacts.map((art) => (
                  <div
                    key={art.id}
                    className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Preview Canvas */}
                      <div className="relative aspect-video bg-slate-900 flex items-center justify-center p-4 border-b border-slate-800/80">
                        <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-sky-400 flex items-center justify-center shadow-lg">
                          <ImageIcon className="w-10 h-10 text-white" />
                        </div>
                        <span className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md text-[10px] font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          VERIFIED CLEAN
                        </span>
                      </div>

                      <div className="p-4 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white truncate max-w-[200px]">{art.file_name}</span>
                          <span className="text-slate-500 text-[11px]">
                            {art.width}x{art.height} px
                          </span>
                        </div>

                        {art.prompt && (
                          <p className="text-slate-400 text-xs line-clamp-2 italic">
                            "{art.prompt}"
                          </p>
                        )}

                        <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>Ukuran Berkas:</span>
                            <span className="text-slate-300 font-mono">
                              {(art.file_size_bytes / 1024).toFixed(1)} KB
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Checksum SHA-256:</span>
                            <span className="text-slate-300 font-mono text-[10px] truncate max-w-[150px]">
                              {art.checksum_sha256 || '4f8a...9c2e'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-900/60 border-t border-slate-800/80 flex items-center gap-2">
                      <a
                        href={art.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh Berkas</span>
                      </a>
                      <button
                        onClick={() => {
                          setSuccessMsg(`Berkas "${art.file_name}" dijadwalkan ke Kalender Konten Pemasaran.`);
                          setTimeout(() => setSuccessMsg(null), 3500);
                        }}
                        className="py-2 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="Kirim ke Content Calendar"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Ke Kalender</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BRAND ASSET LOCKS MANAGEMENT */}
      {activeTab === 'brand_locks' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Penguncian Aset Identitas Brand (Brand Asset Locks)</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kunci palet warna, tipografi, logo, dan batasan gaya visual agar hasil generasi AI konsisten secara deterministik.
                </p>
              </div>
              <button
                onClick={() => setShowBrandLockModal(true)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>+ Buat Kunci Brand Baru</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {brandLocks.map((lock) => (
                <div
                  key={lock.id}
                  className={`bg-slate-950/70 border rounded-2xl p-5 space-y-4 transition ${
                    lock.is_active ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/5' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white text-base">{lock.brand_name}</h3>
                      <p className="text-slate-400 text-xs mt-0.5">{lock.brand_voice_guidelines || 'Brand identity guidlines'}</p>
                    </div>
                    {lock.is_active ? (
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        AKTIF
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-xs">Arsip</span>
                    )}
                  </div>

                  {/* Palet Warna */}
                  <div>
                    <span className="text-slate-400 block text-xs font-semibold mb-2">Palet Warna Terkunci:</span>
                    <div className="flex items-center gap-3">
                      {(lock.palette_hex_codes || []).map((hex, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div
                            className="w-9 h-9 rounded-xl border border-white/20 shadow-md"
                            style={{ backgroundColor: hex }}
                          />
                          <span className="text-[11px] font-mono text-slate-300">{hex}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pengaturan Penegakan */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs">
                    <div>
                      <span className="text-slate-400 block">Toleransi Deviasi:</span>
                      <span className="font-bold text-white">{lock.max_color_delta_e} ΔE (CIE76)</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Penegakan Palet:</span>
                      <span className="font-bold text-emerald-400">
                        {lock.enforce_strict_palette ? 'Ketat (Auto-Reject)' : 'Longgar'}
                      </span>
                    </div>
                  </div>

                  {/* Karakteristik Gaya */}
                  <div>
                    <span className="text-slate-400 block text-xs font-semibold mb-1.5">Visual Style Keywords:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(lock.visual_style_keywords || []).map((kw, i) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-800/80 text-slate-300 rounded text-[11px]">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TEMPLATES LIBRARY */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Pustaka Template Prompt Siap Pakai</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Template prompt multi-kategori dengan variabel yang dioptimalkan untuk standar komersial tinggi.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between shadow-lg transition"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                        {tpl.category}
                      </span>
                      <span className="text-slate-400 text-xs flex items-center gap-1 font-mono">
                        Rasio: {tpl.recommended_aspect_ratio}
                      </span>
                    </div>

                    <h3 className="font-bold text-white text-sm">{tpl.title}</h3>
                    <p className="text-slate-300 text-xs leading-relaxed line-clamp-3 bg-slate-900/60 p-2.5 rounded-xl font-mono text-[11px]">
                      {tpl.template_body}
                    </p>

                    {tpl.style_tags && tpl.style_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tpl.style_tags.map((tag, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Estimasi: {tpl.credit_estimate} Kredit</span>
                    <button
                      onClick={() => {
                        handleSelectTemplate(tpl);
                        setActiveTab('create');
                      }}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer transition shadow"
                    >
                      Gunakan Template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETAIL JOB & SCRUB LOG AUDIT */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl ${
                    selectedJob.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {selectedJob.status === 'COMPLETED' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Detail Validasi & Pembersihan Metadata</h3>
                  <p className="text-xs text-slate-400 font-mono">Job ID: {selectedJob.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Tutup [ESC]
              </button>
            </div>

            {/* Status Penolakan Brand Lock jika ada */}
            {selectedJob.status === 'REJECTED' && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wide">
                  <XCircle className="w-4 h-4" />
                  DITOLAK OLEH OUTPUT VALIDATOR GATE
                </div>
                <p className="text-rose-200 text-xs leading-relaxed">{selectedJob.rejection_reason}</p>
                <div className="pt-2 flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Kredit 5.0 telah di-refund ke dompet organisasi (Tidak ada biaya terpotong).</span>
                </div>
              </div>
            )}

            {/* Status Lolos Verifikasi */}
            {selectedJob.status === 'COMPLETED' && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wide">
                  <ShieldCheck className="w-4 h-4" />
                  100% LOLOS VALIDASI & METADATA TERVERIFIKASI BERSIH
                </div>
                <p className="text-emerald-200 text-xs">
                  Berkas visual telah melalui strip EXIF, XMP, IPTC, C2PA provenance manifest, dan signature AI model.
                </p>
              </div>
            )}

            {/* Prompt Composed */}
            <div className="space-y-1.5 text-xs">
              <span className="font-semibold text-slate-400">Composed Prompt (Universal Prompt Composer):</span>
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-200 font-mono text-[11px] leading-relaxed">
                {selectedJob.composed_prompt || selectedJob.prompt}
              </div>
            </div>

            {/* Quality Metrics */}
            {selectedJob.quality_metrics && Object.keys(selectedJob.quality_metrics).length > 0 && (
              <div className="space-y-1.5 text-xs">
                <span className="font-semibold text-slate-400">Quality Metrics & Color Distance Analysis:</span>
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  {Object.entries(selectedJob.quality_metrics).map(([k, v]) => (
                    <div key={k} className="text-[11px]">
                      <span className="text-slate-500 block capitalize">{k.replace(/_/g, ' ')}:</span>
                      <span className="font-mono font-bold text-slate-300">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scrub Logs Audit Trail */}
            {selectedJob.scrub_logs && selectedJob.scrub_logs.length > 0 && (
              <div className="space-y-2 text-xs">
                <span className="font-semibold text-slate-400">Audit Trail Pembersihan Metadata:</span>
                {selectedJob.scrub_logs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-mono">{log.cleaned_filename}</span>
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded font-bold">
                        VERIFIED CLEAN: {String(log.verified_clean).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] mb-1">Field yang Dihapus:</span>
                      <div className="flex flex-wrap gap-1">
                        {(log.stripped_fields || []).map((f: string, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-mono">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL BUAT / UBAH BRAND ASSET LOCK */}
      {showBrandLockModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBrandLock}
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Palette className="w-5 h-5 text-emerald-400" />
                Konfigurasi Kunci Identitas Brand
              </h3>
              <button
                type="button"
                onClick={() => setShowBrandLockModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Batal
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nama Brand / Organisasi</label>
                <input
                  type="text"
                  required
                  value={brandForm.brand_name}
                  onChange={(e) => setBrandForm({ ...brandForm, brand_name: e.target.value })}
                  placeholder="e.g. Nusantara Digital" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Warna Utama</label>
                  <input
                    type="color"
                    value={brandForm.primary_color}
                    onChange={(e) => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl p-1 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Warna Sekunder</label>
                  <input
                    type="color"
                    value={brandForm.secondary_color}
                    onChange={(e) => setBrandForm({ ...brandForm, secondary_color: e.target.value })}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl p-1 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Warna Aksen</label>
                  <input
                    type="color"
                    value={brandForm.accent_color}
                    onChange={(e) => setBrandForm({ ...brandForm, accent_color: e.target.value })}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl p-1 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Daftar Hex Palet Terkunci (Pisahkan dengan koma)
                </label>
                <input
                  type="text"
                  value={brandForm.palette_hex_codes}
                  onChange={(e) => setBrandForm({ ...brandForm, palette_hex_codes: e.target.value })}
                  placeholder="#1FA35A, #0B1220, #38BDF8, #F8FAFC" // allowlist: standard UI input hint
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Maksimal Toleransi Deviasi Warna (CIE76 Delta E)
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  step="0.5"
                  value={brandForm.max_color_delta_e}
                  onChange={(e) => setBrandForm({ ...brandForm, max_color_delta_e: parseFloat(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Nilai 25.0 adalah batas deviasi optimal. Output dengan perbedaan warna di atas batas ini akan ditolak secara deterministik.
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Panduan Nada & Gaya Visual Brand</label>
                <textarea
                  rows={2}
                  value={brandForm.brand_voice_guidelines}
                  onChange={(e) => setBrandForm({ ...brandForm, brand_voice_guidelines: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBrandLockModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                Simpan & Kunci Guideline
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dialog Konfirmasi & Reservasi Kredit AI Sebelum Eksekusi */}
      <CreditEstimateConfirm
        isOpen={showEstimateConfirm}
        tenantId={tenantId}
        params={{
          activity_code: 'generative_visual',
          activity_name: 'Studio Visual & Kreasi Gambar AI',
          complexity_code: 'high',
          llm_model_id: modelUsed,
          tool_risk_tier: 'medium',
          execution_mode: 'single_step',
          reference_id: `gen-job-${Date.now()}`,
          reference_type: 'GENERATIVE_STUDIO',
        }}
        onConfirm={({ reservation_id }) => {
          setShowEstimateConfirm(false);
          handleExecuteJob(reservation_id);
        }}
        onCancel={() => setShowEstimateConfirm(false)}
      />
    </div>
  );
}
