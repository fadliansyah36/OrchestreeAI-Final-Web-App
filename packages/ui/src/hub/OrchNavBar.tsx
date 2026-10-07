'use client';

import React, { useState, useMemo } from 'react';
import { PWAInstallButton } from '../feedback/PWAInstallButton';
import { useLocaleContext } from '../i18n';
import {
  X,
  Search,
  Users,
  Briefcase,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Brain,
  Layers,
  Lock,
  ChevronRight,
  ExternalLink,
  Bot,
  CreditCard,
  Settings,
  Activity,
  CheckCircle2,
  AlertCircle,
  Database,
  Cpu,
  ShoppingBag,
  Megaphone,
  Headphones,
  Compass,
  FileCheck,
  Sliders,
  Terminal,
  Clock,
  Key,
  ShieldAlert,
  Server,
  Share2,
  Sun,
  Moon,
  BarChart3,
  MessageSquare,
  Languages
} from 'lucide-react';

export interface NavDomainItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  route: string;
  category: string;
  isLocked?: boolean;
  tierRequired?: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  badge?: string;
  isAvailable?: boolean;
}

export interface OrchNavBarProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'client' | 'admin';
  currentRoute: string;
  onNavigate: (route: string) => void;
  tenantTier?: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  capabilities?: Record<string, boolean>;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export function OrchNavBar({
  isOpen,
  onClose,
  mode,
  currentRoute,
  onNavigate,
  tenantTier = 'STARTER',
  capabilities = {},
  theme,
  onToggleTheme
}: OrchNavBarProps) {
  const { locale, toggleLocale } = useLocaleContext();
  const [searchQuery, setSearchQuery] = useState('');

  const clientAvailableRoutes = new Set([
    '/',
    '/overview',
    '/workforce',
    '/sales-marketing',
    '/omnichannel',
    '/intelligence',
    '/selection',
    '/generative',
    '/enterprise',
    '/integrations',
    '/billing',
    '/permissions',
    '/settings',
    '/inbox',
    '/proactive'
  ]);

  const normalizeRoute = (route: string) => route.startsWith('/') ? route : `/${route}`;

  const clientDomains: NavDomainItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      description: 'Ringkasan workspace dan status operasional yang tersedia.',
      icon: BarChart3,
      route: '/overview',
      category: 'Workspace & Beranda'
    },
    // 1. Kelompok Kerja & Tim (Standar Platform Resmi)
    {
      id: 'workforce',
      label: 'Tenaga Kerja',
      description: 'Struktur tim kolaboratif manusia dan pekerja kecerdasan',
      icon: Users,
      route: 'workforce',
      category: 'Kerja & Tim'
    },
    {
      id: 'kanban',
      label: 'Papan Kerja',
      description: 'Manajemen alur kerja dan distribusi tugas operasional',
      icon: Briefcase,
      route: 'kanban',
      category: 'Kerja & Tim'
    },
    {
      id: 'analytics',
      label: 'Analitik & Peringkat',
      description: 'Skor kinerja bulanan, leaderboard human vs AI, dan dimensi kerja',
      icon: BarChart3,
      route: 'analytics',
      category: 'Kerja & Tim'
    },
    {
      id: 'attendance',
      label: 'Presensi Biometrik WebAuthn',
      description: 'Verifikasi kehadiran staf berbasis kriptografi perangkat',
      icon: Clock,
      route: 'attendance',
      category: 'Kerja & Tim'
    },
    {
      id: 'permissions',
      label: 'Izin & Privasi Data AI',
      description: 'Kendali perizinan akses dokumen dan kebijakan ABAC perusahaan',
      icon: ShieldCheck,
      route: 'permissions',
      category: 'Kerja & Tim'
    },
    {
      id: 'tokenopt',
      label: 'Optimasi Konsumsi Token',
      description: 'Penyimpanan semantik dan efisiensi alokasi tingkat model',
      icon: Cpu,
      route: 'tokenopt',
      category: 'Kerja & Tim'
    },
    {
      id: 'proactive_collab',
      label: 'Kolaborasi Staf x AI Agent',
      description: 'Pendaftaran kemitraan kerja harian staf dengan AI Agent spesialis departemen',
      icon: Bot,
      route: 'proactive_collab',
      category: 'Kerja & Tim'
    },

    // 2. Kelompok Penjualan & Komunikasi (Standar Platform: Omnichannel dan Proactive DIPISAHKAN TOTAL)
    {
      id: 'omnichannel',
      label: 'Penjualan & Omnichannel',
      description: 'Pipeline CRM 8 tingkat status, AI handoff, inbox komunikasi pelanggan multi-kanal',
      icon: MessageSquare,
      route: 'omnichannel',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'proactive',
      label: 'Agen Proaktif',
      description: 'Bot staf internal resmi, laporan terjadwal, dan preferensi notifikasi tim',
      icon: Megaphone,
      route: 'proactive',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'crm_pipeline',
      label: 'Pipeline Prospek Penjualan',
      description: 'Manajemen prospek dan estimasi konversi transaksi',
      icon: TrendingUp,
      route: 'crm_pipeline',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'crm_personas',
      label: 'Konfigurasi Persona Pelanggan',
      description: 'Segmentasi dan preferensi interaksi pelanggan',
      icon: Bot,
      route: 'crm_personas',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'commerce_catalog',
      label: 'Katalog Produk & Layanan',
      description: 'Daftar produk, inventaris, dan harga resmi',
      icon: ShoppingBag,
      route: 'commerce_catalog',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'commerce_orders',
      label: 'Manajemen Pesanan',
      description: 'Pencatatan dan pelacakan transaksi penjualan',
      icon: FileCheck,
      route: 'commerce_orders',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'marketing_campaigns',
      label: 'Kampanye Promosi Pemasaran',
      description: 'Penyusunan materi promosi dan penjangkauan pelanggan',
      icon: Megaphone,
      route: 'marketing_campaigns',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'service_requests',
      label: 'Layanan & Permintaan Bantuan',
      description: 'Penanganan tiket kendala dan kepuasan pelanggan',
      icon: Headphones,
      route: 'service_requests',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'sales_coach',
      label: 'Pelatih Strategi Penjualan',
      description: 'Rekomendasi taktik negosiasi dan peningkatan konversi',
      icon: Sparkles,
      route: 'sales_coach',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'sales_guardrails',
      label: 'Batas Kebijakan Penjualan',
      description: 'Aturan kepatuhan diskon dan etika komunikasi',
      icon: Sliders,
      route: 'sales_guardrails',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'revenue_intelligence',
      label: 'Analisis & Intelijen Pendapatan',
      description: 'Atribusi pendapatan, proyeksi pipeline, dan analitik nilai',
      icon: TrendingUp,
      route: 'revenue_intelligence',
      category: 'Penjualan & Komunikasi'
    },
    {
      id: 'message_experiments',
      label: 'Eksperimen Komunikasi A/B',
      description: 'Pengujian varian pesan, tingkat respons, dan efektivitas komunikasi',
      icon: Sparkles,
      route: 'message_experiments',
      category: 'Penjualan & Komunikasi'
    },

    // 3. Kelompok Kecerdasan & Data (Standar Platform Resmi)
    {
      id: 'intelligence',
      label: 'Kecerdasan Eksternal',
      description: 'Pemantauan kompetitor, tren industri, dan wawasan prospek pasar',
      icon: Compass,
      route: 'intelligence',
      category: 'Kecerdasan & Data'
    },
    {
      id: 'selection',
      label: 'Seleksi Cerdas',
      description: 'Rekrutmen terpadu pekerja manusia dan pekerja kecerdasan',
      icon: CheckCircle2,
      route: 'selection',
      category: 'Kecerdasan & Data'
    },
    {
      id: 'generative',
      label: 'Studio Kreatif',
      description: 'Pembuatan aset visual, naskah promosi, dan materi konten terverifikasi',
      icon: Sparkles,
      route: 'generative',
      category: 'Kecerdasan & Data'
    },
    {
      id: 'enterprise',
      label: 'Tenaga Kerja Enterprise',
      description: 'Chief of Staff otonom, Context Fabric 8 dimensi, dan pelaporan korporat',
      icon: ShieldCheck,
      route: 'enterprise',
      category: 'Kecerdasan & Data',
      tierRequired: 'ENTERPRISE'
    },
    {
      id: 'agentcat',
      label: 'Katalog Template Blueprint',
      description: 'Penyebaran template spesialisasi pekerja kecerdasan',
      icon: Layers,
      route: 'agentcat',
      category: 'Kecerdasan & Data'
    },
    {
      id: 'integrations',
      label: 'Integrasi Akun Multi-Channel',
      description: 'Koneksi WhatsApp, Shopify, Tokopedia, Instagram, Gmail, dan alat eksternal',
      icon: Share2,
      route: 'integrations',
      category: 'Kecerdasan & Data'
    },
    {
      id: 'data_quality',
      label: 'Pusat Kualitas Data & Rekonsiliasi',
      description: 'Resolusi konflik sumber data, validasi ketersediaan, dan integritas metrik',
      icon: Database,
      route: 'data_quality',
      category: 'Kecerdasan & Data'
    },

    // 4. Kelompok Pengaturan (Standar Platform Resmi)
    {
      id: 'billing',
      label: 'Kredit & Tagihan',
      description: 'Status langganan, saldo kredit operasional, invoice, dan alokasi ledger',
      icon: CreditCard,
      route: 'billing',
      category: 'Pengaturan'
    },
    {
      id: 'onboarding',
      label: 'Pengaturan',
      description: 'Profil organisasi, konfigurasi anggota, dan penyesuaian sistem',
      icon: Settings,
      route: 'onboarding',
      category: 'Pengaturan'
    },
    {
      id: 'access_tier',
      label: 'Tingkat Akses & Tata Kelola Peran',
      description: 'Pengaturan tingkat akses peran (Owner/Executive, Lead, Staf) dan isolasi task board',
      icon: ShieldCheck,
      route: 'access_tier',
      category: 'Pengaturan'
    }
  ];

  const adminDomains: NavDomainItem[] = [
    // 1. Kelompok Operasional & Tenant (11 Hub Resmi Super Admin)
    {
      id: 'admin_super_hub',
      label: 'Ringkasan Platform',
      description: 'KPI tenant aktif, MRR, pertumbuhan platform, dan slot uji coba 36',
      icon: ShieldCheck,
      route: 'admin_super_hub',
      category: 'Operasional & Tenant'
    },
    {
      id: 'admin_analytics',
      label: 'Analisis Platform',
      description: 'Pusat visualisasi interaktif tren pendapatan, transaksi, adopsi tenant, dan audit biaya LLM',
      icon: TrendingUp,
      route: '/admin/analytics',
      category: 'Operasional & Tenant'
    },
    {
      id: 'admin_tenants',
      label: 'Manajemen Tenant',
      description: 'CRUD organisasi perusahaan, status langganan, dan alokasi kuota',
      icon: Users,
      route: 'admin_tenants',
      category: 'Operasional & Tenant'
    },
    {
      id: 'admin_prospects',
      label: 'Prospek & Uji Coba',
      description: '36 slot uji coba atomik, aktivasi tenant evaluasi, dan jadwal demo',
      icon: Briefcase,
      route: 'admin_prospects',
      category: 'Operasional & Tenant'
    },
    {
      id: 'admin_finance',
      label: 'Manajemen Komersial',
      description: 'Paket langganan, Credit Metering, Financial Command Center, dan Rekonsiliasi Pembayaran',
      icon: CreditCard,
      route: 'admin_finance',
      category: 'Operasional & Tenant'
    },

    // 2. Kelompok Kecerdasan & Tool AI (11 Hub Resmi Super Admin)
    {
      id: 'admin_model_routing',
      label: 'Model & Perutean AI',
      description: 'Provider LLM tunggal (NVIDIA NIM/OpenRouter/Gemini/GPT-Image-2) & failover PDP',
      icon: Cpu,
      route: 'admin_model_routing',
      category: 'Kecerdasan & Tool AI'
    },
    {
      id: 'admin_mcp',
      label: 'Tata Kelola Tool AI',
      description: 'Registry MCP Tools, audit izin perkakas AI, dan kill-switch otonom',
      icon: Layers,
      route: 'admin_mcp',
      category: 'Kecerdasan & Tool AI'
    },
    {
      id: 'admin_agent_catalog',
      label: 'Katalog Jabatan & Skill AI',
      description: '15 Jabatan Utama terstandarisasi, struktur organisasi, dan blueprint agen',
      icon: Brain,
      route: 'admin_agent_catalog',
      category: 'Kecerdasan & Tool AI'
    },
    {
      id: 'admin_integrations',
      label: 'Registrasi Aplikasi Pihak Ketiga',
      description: 'Konfigurasi OAuth App, webhook, dan status kapabilitas integrasi',
      icon: Share2,
      route: 'admin_integrations',
      category: 'Kecerdasan & Tool AI'
    },

    // 3. Kelompok Tata Kelola & Audit (11 Hub Resmi Super Admin)
    {
      id: 'admin_master_data',
      label: 'Data Induk',
      description: 'Master data 10 kategori departemen, klasifikasi industri, dan mata uang',
      icon: Database,
      route: 'admin_master_data',
      category: 'Tata Kelola & Audit'
    },
    {
      id: 'admin_mfa',
      label: 'Keamanan & Audit',
      description: 'Audit ledger transaksi PDP, verifikasi MFA Super Admin, dan log insiden',
      icon: Key,
      route: 'admin_mfa',
      category: 'Tata Kelola & Audit'
    },
    {
      id: 'admin_startup_gate',
      label: 'Monitoring Sistem',
      description: 'Kesehatan provider, gerbang kesiapan startup fail-closed, tracing & antrian tugas',
      icon: Terminal,
      route: 'startup_gate',
      category: 'Tata Kelola & Audit'
    }
  ];

  const sourceDomains = mode === 'client' ? clientDomains : adminDomains;

  // Evaluasi status kunci berdasarkan tier
  const processedDomains = useMemo(() => {
    return sourceDomains.map((d) => {
      let isLocked = false;
      if (d.tierRequired === 'ENTERPRISE' && tenantTier !== 'ENTERPRISE') {
        isLocked = true;
      }
      const normalizedRoute = normalizeRoute(d.route);
      const isAvailable = mode === 'client' ? clientAvailableRoutes.has(normalizedRoute) : true;
      return {
        ...d,
        route: normalizedRoute,
        isAvailable,
        isLocked: isLocked || d.isLocked
      };
    });
  }, [sourceDomains, tenantTier]);

  // Filter pencarian
  const filteredDomains = useMemo(() => {
    if (!searchQuery.trim()) return processedDomains;
    const q = searchQuery.toLowerCase();
    return processedDomains.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [processedDomains, searchQuery]);

  // Kelompokkan per kategori
  const groupedCategories = useMemo(() => {
    const map = new Map<string, NavDomainItem[]>();
    filteredDomains.forEach((item) => {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    });
    return Array.from(map.entries());
  }, [filteredDomains]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menu Navigasi Lengkap"
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex justify-start transition-opacity animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md md:max-w-lg bg-white dark:bg-[#0B1220] h-full shadow-2xl flex flex-col border-r border-slate-200 dark:border-slate-800 animate-in slide-in-from-left duration-200">
        {/* Header Drawer */}
        <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-sky-600 flex items-center justify-center text-white font-bold shadow-sm">
              O
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {locale === 'en' ? 'Full Navigation' : 'Navigasi Lengkap'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'client'
                  ? (locale === 'en' ? 'Organization Workspace' : 'Ruang Kerja Organisasi')
                  : (locale === 'en' ? 'Super Admin Control Plane' : 'Konsol Kendali Super Admin')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleLocale}
              aria-label="Ganti bahasa antarmuka"
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Ganti bahasa (ID / EN)"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{locale.toUpperCase()}</span>
            </button>
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label="Ganti tema tampilan"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Ganti tema tampilan"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Menu Navigasi"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={locale === 'en' ? 'Search domain or feature...' : 'Cari domain atau fitur...'} // allowlist: standard UI search input hint
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9.5 pr-4 py-2 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" // allowlist: standard UI input hint
            />
          </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groupedCategories.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">
                {locale === 'en' ? 'No domains match your search' : 'Tidak ada domain yang cocok dengan pencarian'}
              </p>
            </div>
          ) : (
            groupedCategories.map(([categoryName, items]) => (
              <div key={categoryName} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2">
                  {categoryName}
                </h3>
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = normalizeRoute(currentRoute) === normalizeRoute(item.route);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.isLocked || item.isAvailable === false) return;
                          onNavigate(normalizeRoute(item.route));
                          onClose();
                        }}
                        disabled={item.isLocked || item.isAvailable === false}
                        className={`w-full flex items-start gap-3.5 p-3 rounded-xl text-left transition-all cursor-pointer ${
                          item.isLocked
                            ? 'opacity-60 bg-slate-50/60 dark:bg-slate-900/40 cursor-not-allowed'
                            : isActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border border-emerald-500/30'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            item.isLocked
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                              : isActive
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold truncate leading-snug">
                              {item.label}
                            </span>
                            {(item.isLocked || item.isAvailable === false) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                                <Lock className="w-2.5 h-2.5" />
                                {item.isAvailable === false ? 'Belum tersedia' : item.tierRequired || 'Terkunci'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                            {item.description}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0B1220] flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-col">
            <span className="font-semibold text-slate-700 dark:text-slate-300">OrchestreeAI</span>
            <span>{locale === 'en' ? 'Autonomous AI Workforce OS' : 'Sistem Operasi Tenaga Kerja'}</span>
          </div>
          <PWAInstallButton />
        </div>
      </div>

      {/* Backdrop click to dismiss */}
      <div className="flex-1" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
