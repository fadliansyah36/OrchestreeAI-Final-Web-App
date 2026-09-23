import React, { useState, useMemo } from 'react';
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
  Moon
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
  const [searchQuery, setSearchQuery] = useState('');

  const clientDomains: NavDomainItem[] = [
    // Kelompok Kerja & Tim
    {
      id: 'dashboard',
      label: 'Beranda Ringkasan',
      description: 'Ringkasan kerja harian, skor, dan aksi cepat',
      icon: TrendingUp,
      route: 'dashboard',
      category: 'Kerja & Tim'
    },
    {
      id: 'workforce',
      label: 'Manajemen Tenaga Kerja',
      description: 'Struktur tim kolaboratif manusia dan pekerja kecerdasan',
      icon: Users,
      route: 'workforce',
      category: 'Kerja & Tim'
    },
    {
      id: 'kanban',
      label: 'Papan Tugas Terkoordinasi',
      description: 'Manajemen alur kerja dan distribusi tugas operasional',
      icon: Briefcase,
      route: 'kanban',
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
      description: 'Kendali perizinan akses dokumen dan privasi perusahaan',
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

    // Kelompok Penjualan & Pelanggan
    {
      id: 'proactive',
      label: 'Saluran Proaktif & Omnichannel',
      description: 'Integrasi percakapan otomatis lintas kanal komunikasi',
      icon: Megaphone,
      route: 'proactive',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'crm_pipeline',
      label: 'Pipeline Prospek Penjualan',
      description: 'Manajemen prospek dan estimasi konversi transaksi',
      icon: TrendingUp,
      route: 'crm_pipeline',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'crm_personas',
      label: 'Konfigurasi Persona Pelanggan',
      description: 'Segmentasi dan preferensi interaksi pelanggan',
      icon: Bot,
      route: 'crm_personas',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'commerce_catalog',
      label: 'Katalog Produk & Layanan',
      description: 'Daftar produk, inventaris, dan harga resmi',
      icon: ShoppingBag,
      route: 'commerce_catalog',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'commerce_orders',
      label: 'Manajemen Pesanan',
      description: 'Pencatatan dan pelacakan transaksi penjualan',
      icon: FileCheck,
      route: 'commerce_orders',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'marketing_campaigns',
      label: 'Kampanye Promosi Pemasaran',
      description: 'Penyusunan materi promosi dan penjangkauan pelanggan',
      icon: Megaphone,
      route: 'marketing_campaigns',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'service_requests',
      label: 'Layanan & Permintaan Bantuan',
      description: 'Penanganan tiket kendala dan kepuasan pelanggan',
      icon: Headphones,
      route: 'service_requests',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'sales_coach',
      label: 'Pelatih Strategi Penjualan',
      description: 'Rekomendasi taktik negosiasi dan peningkatan konversi',
      icon: Sparkles,
      route: 'sales_coach',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'sales_guardrails',
      label: 'Batas Kebijakan Penjualan',
      description: 'Aturan kepatuhan diskon dan etika komunikasi',
      icon: Sliders,
      route: 'sales_guardrails',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'revenue_intelligence',
      label: 'Analisis & Intelijen Pendapatan',
      description: 'Atribusi pendapatan, proyeksi pipeline, dan analitik nilai',
      icon: TrendingUp,
      route: 'revenue_intelligence',
      category: 'Penjualan & Pelanggan'
    },
    {
      id: 'message_experiments',
      label: 'Eksperimen Komunikasi A/B',
      description: 'Pengujian varian pesan, tingkat respons, dan efektivitas komunikasi',
      icon: Sparkles,
      route: 'message_experiments',
      category: 'Penjualan & Pelanggan'
    },

    // Kelompok Kecerdasan & Kreatif
    {
      id: 'intelligence',
      label: 'Pusat Kecerdasan Pasar',
      description: 'Pemantauan kompetitor, tren industri, dan wawasan prospek',
      icon: Compass,
      route: 'intelligence',
      category: 'Kecerdasan & Kreatif'
    },
    {
      id: 'selection',
      label: 'Seleksi Universal Tenaga Kerja',
      description: 'Rekrutmen terpadu pekerja manusia dan pekerja kecerdasan',
      icon: Users,
      route: 'selection',
      category: 'Kecerdasan & Kreatif'
    },
    {
      id: 'generative',
      label: 'Studio Kreatif Generatif',
      description: 'Pembuatan aset visual, naskah promosi, dan materi konten',
      icon: Sparkles,
      route: 'generative',
      category: 'Kecerdasan & Kreatif'
    },
    {
      id: 'agentcat',
      label: 'Katalog Template Blueprint',
      description: 'Penyebaran template spesialisasi pekerja kecerdasan',
      icon: Layers,
      route: 'agentcat',
      category: 'Kecerdasan & Kreatif'
    },

    // Kelompok Integrasi & Enterprise
    {
      id: 'integrations',
      label: 'Integrasi Akun Multi-Channel',
      description: 'Koneksi WhatsApp, Shopify, Tokopedia, Instagram, Gmail, dan alat eksternal',
      icon: Share2,
      route: 'integrations',
      category: 'Integrasi & Enterprise'
    },
    {
      id: 'data_quality',
      label: 'Pusat Kualitas Data & Rekonsiliasi',
      description: 'Resolusi konflik sumber data, validasi ketersediaan, dan integritas metrik',
      icon: Database,
      route: 'data_quality',
      category: 'Integrasi & Enterprise'
    },
    {
      id: 'enterprise',
      label: 'Tenaga Kerja Skala Enterprise',
      description: 'Chief of Staff otonom, Context Fabric 8 dimensi, dan pelaporan korporat',
      icon: ShieldCheck,
      route: 'enterprise',
      category: 'Integrasi & Enterprise',
      tierRequired: 'ENTERPRISE'
    },

    // Kelompok Komersial & Pengaturan
    {
      id: 'billing',
      label: 'Tagihan & Alokasi Kredit',
      description: 'Status langganan, saldo kredit operasional, dan invoice',
      icon: CreditCard,
      route: 'billing',
      category: 'Komersial & Pengaturan'
    },
    {
      id: 'onboarding',
      label: 'Pembaruan Profil Organisasi',
      description: 'Pengaturan identitas perusahaan dan penyesuaian paket',
      icon: Settings,
      route: 'onboarding',
      category: 'Komersial & Pengaturan'
    }
  ];

  const adminDomains: NavDomainItem[] = [
    // Kelompok Platform & Ringkasan
    {
      id: 'admin_super_hub',
      label: 'Ringkasan Kendali Platform',
      description: 'Metrik kesehatan sistem, statistik tenant, dan alur operasional',
      icon: ShieldCheck,
      route: 'admin_super_hub',
      category: 'Platform & Ringkasan'
    },
    {
      id: 'admin_startup_gate',
      label: 'Laporan Gerbang Kesiapan',
      description: 'Pemeriksaan integritas dependensi dan koneksi sebelum operasional',
      icon: Terminal,
      route: 'startup_gate',
      category: 'Platform & Ringkasan'
    },

    // Kelompok Tenant & Komersial
    {
      id: 'admin_tenants',
      label: 'Manajemen Organisasi Tenant',
      description: 'Daftar perusahaan terdaftar, status berlangganan, dan kuota',
      icon: Users,
      route: 'admin_tenants',
      category: 'Tenant & Komersial'
    },
    {
      id: 'admin_prospects',
      label: 'Pendaftaran Prospek & Uji Coba',
      description: 'Penerimaan prospek baru dan aktivasi akun evaluasi',
      icon: Compass,
      route: 'admin_prospects',
      category: 'Tenant & Komersial'
    },
    {
      id: 'admin_finance',
      label: 'Pusat Komando Keuangan',
      description: 'Rekonsiliasi transaksi, saldo kredit platform, dan pendapatan',
      icon: CreditCard,
      route: 'admin_finance',
      category: 'Tenant & Komersial'
    },

    // Kelompok Kecerdasan & Ekstensi
    {
      id: 'admin_model_routing',
      label: 'Tata Kelola Perutean Model',
      description: 'Konfigurasi prioritas penyedia dan toleransi latensi model',
      icon: Cpu,
      route: 'admin_model_routing',
      category: 'Kecerdasan & Ekstensi'
    },
    {
      id: 'admin_agent_catalog',
      label: 'Katalog Template Blueprint',
      description: 'Audit keamanan kebijakan dan rilis bertahap blueprint agen',
      icon: Layers,
      route: 'admin_agent_catalog',
      category: 'Kecerdasan & Ekstensi'
    },
    {
      id: 'admin_tokenopt',
      label: 'Monitoring Efisiensi Token',
      description: 'Analitik penghematan biaya dan telemetri penyimpanan semantik',
      icon: TrendingUp,
      route: 'admin_tokenopt',
      category: 'Kecerdasan & Ekstensi'
    },
    {
      id: 'admin_integrations',
      label: 'Direktori Aplikasi & Integrasi Eksternal',
      description: 'Tata kelola otorisasi aplikasi pihak ketiga dan integrasi multi-kanal',
      icon: Share2,
      route: 'admin_integrations',
      category: 'Kecerdasan & Ekstensi'
    },

    // Kelompok Keamanan & Sistem
    {
      id: 'admin_mfa',
      label: 'Konsol Keamanan & MFA',
      description: 'Autentikasi multi-faktor dan proteksi akun Super Admin',
      icon: Key,
      route: 'admin_mfa',
      category: 'Keamanan & Sistem'
    },
    {
      id: 'admin_data_quality',
      label: 'Pusat Kualitas Data & Audit',
      description: 'Validasi skema, konsistensi metrik, dan log aktivitas sistem',
      icon: Database,
      route: 'admin_data_quality',
      category: 'Keamanan & Sistem'
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
      return {
        ...d,
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
                Navigasi Lengkap
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'client' ? 'Ruang Kerja Organisasi' : 'Konsol Kendali Super Admin'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
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
              placeholder="Cari domain atau fitur..." // allowlist: standard UI search input hint
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
              <p className="text-sm font-medium">Tidak ada domain yang cocok dengan pencarian</p>
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
                    const isActive = currentRoute === item.route;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.isLocked) return;
                          onNavigate(item.route);
                          onClose();
                        }}
                        disabled={item.isLocked}
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
                            {item.isLocked && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                                <Lock className="w-2.5 h-2.5" />
                                {item.tierRequired || 'Terkunci'}
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
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0B1220] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>OrchestreeAI v2.2</span>
          <span>Sistem Operasi Tenaga Kerja</span>
        </div>
      </div>

      {/* Backdrop click to dismiss */}
      <div className="flex-1" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
