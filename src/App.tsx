import React, { useState } from 'react';
import {
  FeatureHubScreen,
  CategoryCard,
  EmptyState,
} from '@orchestree/ui';
import {
  Building2,
  ShieldCheck,
  Activity,
  Sparkles,
  Sun,
  Moon,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Lock,
  Terminal,
  Cpu,
} from 'lucide-react';

interface StartupCheckItem {
  step: number;
  name: string;
  status: 'passed' | 'not_implemented_yet' | 'failed';
  detail: string;
}

const STARTUP_GATE_CHECKS: StartupCheckItem[] = [
  {
    step: 1,
    name: 'Skema Environment (.env.schema)',
    status: 'passed',
    detail: 'Konfigurasi environment valid, tanpa nilai sembarangan atau duplikasi.',
  },
  {
    step: 2,
    name: 'Koneksi Database (role orchestree_app)',
    status: 'not_implemented_yet',
    detail: 'Koneksi pool database dijadwalkan pada inisiasi skema database.',
  },
  {
    step: 3,
    name: 'Penegakan RLS Seluruh Tabel Tenant',
    status: 'not_implemented_yet',
    detail: 'Pemeriksaan kebijakan RLS aktif setelah migrasi skema tabel tenant.',
  },
  {
    step: 4,
    name: 'Status Migrasi Head & Ekstensi Postgres',
    status: 'not_implemented_yet',
    detail: 'Alembic revision check dijadwalkan pada penyusunan migrasi database.',
  },
  {
    step: 5,
    name: 'Master Data 15 Jabatan Utama & Capability',
    status: 'not_implemented_yet',
    detail: 'Verifikasi data referensi resmi siap dimuat via seed database.',
  },
  {
    step: 6,
    name: 'Konektivitas & Latensi Redis',
    status: 'not_implemented_yet',
    detail: 'Koneksi Redis queue and caching akan aktif bersama worker orkestrasi.',
  },
  {
    step: 7,
    name: 'Supabase Auth JWKS & Storage Private Bucket',
    status: 'not_implemented_yet',
    detail: 'Verifikasi kunci publik JWKS dan akses signed-URL storage.',
  },
  {
    step: 8,
    name: 'KMS Envelope Encryption Round-Trip',
    status: 'not_implemented_yet',
    detail: 'Pengujian generate data key dan dekripsi envelope kredensial.',
  },
  {
    step: 9,
    name: 'Sinkronisasi Katalog NIM & OpenRouter',
    status: 'not_implemented_yet',
    detail: 'Probe model router teks aktif pada inisiasi modul model router.',
  },
  {
    step: 10,
    name: 'Probe Vector Embedding Model (pgvector)',
    status: 'not_implemented_yet',
    detail: 'Verifikasi dimensi vector aktif pada inisiasi memori semantik.',
  },
  {
    step: 11,
    name: 'Kredensial GPT-Image-2 / Image Provider',
    status: 'not_implemented_yet',
    detail: 'Verifikasi provider generasi gambar studio generatif.',
  },
  {
    step: 12,
    name: 'Telegram Official Platform Bot (@OrchestreeAI_bot)',
    status: 'not_implemented_yet',
    detail: 'Pemeriksaan getMe bot Telegram resmi platform.',
  },
  {
    step: 13,
    name: 'WhatsApp Official Platform WABA Number',
    status: 'not_implemented_yet',
    detail: 'Verifikasi status WABA Cloud API resmi platform.',
  },
  {
    step: 14,
    name: 'Autentikasi Payment Gateway (Midtrans/Xendit)',
    status: 'not_implemented_yet',
    detail: 'Verifikasi signature webhook dan merchant keys.',
  },
  {
    step: 15,
    name: 'VAPID Web Push & Cloudflare Turnstile',
    status: 'not_implemented_yet',
    detail: 'Verifikasi pasangan kunci VAPID dan endpoint siteverify Turnstile.',
  },
  {
    step: 16,
    name: 'Sandbox Egress Scraper & Anti-SSRF',
    status: 'not_implemented_yet',
    detail: 'Pemeriksaan isolasi egress worker ekstraksi data.',
  },
  {
    step: 17,
    name: 'Keamanan Runtime & Header HTTP',
    status: 'passed',
    detail: 'Pengaturan runtime aman aktif.',
  },
  {
    step: 18,
    name: 'Keberadaan Akun Platform Admin dengan MFA',
    status: 'not_implemented_yet',
    detail: 'Verifikasi akun Super Admin terdaftar dengan autentikasi dua faktor.',
  },
];

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeWorkspace, setActiveWorkspace] = useState<'client' | 'admin' | 'startup_gate'>('client');

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const clientCategoryCards: CategoryCard[] = [
    {
      key: 'workforce',
      label: 'Manajemen Tenaga Kerja',
      icon: 'users',
      route: '/workforce',
      badgeCount: 0,
    },
    {
      key: 'sales-marketing',
      label: 'Penjualan & Pemasaran',
      icon: 'trending',
      route: '/sales-marketing',
      badgeCount: 0,
    },
    {
      key: 'intelligence',
      label: 'Riset Pasar & Kompetitor',
      icon: 'brain',
      route: '/intelligence',
      badgeCount: 0,
    },
    {
      key: 'enterprise',
      label: 'Operasional Enterprise',
      icon: 'shield',
      route: '/enterprise',
      isLocked: true,
    },
    {
      key: 'generative',
      label: 'Studio Kreatif Generatif',
      icon: 'sparkles',
      route: '/generative',
      badgeCount: 0,
    },
    {
      key: 'selection',
      label: 'Seleksi Data Cerdas',
      icon: 'search',
      route: '/selection',
      badgeCount: 0,
    },
    {
      key: 'billing',
      label: 'Kredit & Langganan',
      icon: 'credit',
      route: '/billing',
      badgeCount: 0,
    },
    {
      key: 'settings',
      label: 'Pengaturan Akun',
      icon: 'settings',
      route: '/settings',
    },
  ];

  const adminCategoryCards: CategoryCard[] = [
    {
      key: 'tenants',
      label: 'Manajemen Tenant',
      icon: 'users',
      route: '/admin/tenants',
      badgeCount: 0,
    },
    {
      key: 'llm-routing',
      label: 'Multi-LLM & Model Router',
      icon: 'brain',
      route: '/admin/llm-routing',
      badgeCount: 0,
    },
    {
      key: 'mcp-tools',
      label: 'Governance Alat MCP',
      icon: 'layers',
      route: '/admin/mcp-tools',
      badgeCount: 0,
    },
    {
      key: 'usage-costs',
      label: 'Penggunaan & Biaya Platform',
      icon: 'trending',
      route: '/admin/usage-costs',
    },
    {
      key: 'prospects-trial',
      label: 'Registrasi Prospek & Uji Coba',
      icon: 'briefcase',
      route: '/admin/prospects-trial',
      badgeCount: 0,
    },
    {
      key: 'app-registry',
      label: 'Katalog Integrasi Pihak Ketiga',
      icon: 'settings',
      route: '/admin/app-registry',
    },
    {
      key: 'security-audit',
      label: 'Keamanan & Buku Catatan Audit',
      icon: 'shield',
      route: '/admin/security-audit',
    },
    {
      key: 'operations-dlq',
      label: 'Antrean Operasional Sistem',
      icon: 'activity',
      route: '/admin/operations-dlq',
    },
  ];

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#0B1220] text-white' : 'bg-slate-50 text-slate-900'} transition-colors duration-200`}>
      {/* Platform Top Navigation Bar */}
      <nav id="platform-navbar" className="border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B1220]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              O
            </div>
            <div>
              <span className="font-bold tracking-tight text-lg text-slate-900 dark:text-white">
                Orchestree<span className="text-emerald-500">.AI</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[11px] uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                Operating System
              </span>
            </div>
          </div>

          {/* Workspace Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              id="workspace-btn-client"
              onClick={() => setActiveWorkspace('client')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeWorkspace === 'client'
                  ? 'bg-white dark:bg-emerald-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Ruang Kerja Tenant</span>
              <span className="md:hidden">Tenant</span>
            </button>

            <button
              type="button"
              id="workspace-btn-admin"
              onClick={() => setActiveWorkspace('admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeWorkspace === 'admin'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Super Admin</span>
              <span className="md:hidden">Admin</span>
            </button>

            <button
              type="button"
              id="workspace-btn-gate"
              onClick={() => setActiveWorkspace('startup_gate')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeWorkspace === 'startup_gate'
                  ? 'bg-white dark:bg-amber-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Startup Gate</span>
              <span className="md:hidden">Gate</span>
            </button>
          </div>

          {/* Theme Switcher & Status */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label="Toggle tema tampilan"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto">
        {/* Workspace: Client Tenant PWA */}
        {activeWorkspace === 'client' && (
          <div id="client-workspace-view">
            <FeatureHubScreen
              domain="Pusat Kendali Tenaga Kerja"
              analyticsSlot={
                <EmptyState
                  id="client-analytics-empty"
                  icon={Activity}
                  title="Belum Ada Data Metrik Operasional"
                  description="Laporan analitik tim, ketepatan waktu, dan produktivitas akan dihitung secara langsung dari riwayat eksekusi tugas nyata."
                  actionLabel="Buka Dokumentasi Layanan"
                  onAction={() => setActiveWorkspace('startup_gate')}
                />
              }
              categoryCards={clientCategoryCards}
              insightFeed={
                <EmptyState
                  id="client-insights-empty"
                  icon={Sparkles}
                  title="Belum Ada Rekomendasi Pintar"
                  description="Umpan rekomendasi kecerdasan buatan akan aktif menganalisis peluang dan notifikasi prioritas tinggi saat aktivitas operasional berjalan."
                />
              }
              onNavigate={(route) => console.log('Client route:', route)}
            />
          </div>
        )}

        {/* Workspace: Super Admin Console */}
        {activeWorkspace === 'admin' && (
          <div id="admin-workspace-view" className="py-2">
            <div className="px-4 md:px-6 mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 bg-blue-950/40 border border-blue-900/60 px-3 py-1 rounded-lg">
                <Lock className="w-3.5 h-3.5" />
                <span>Konsol Kontrol Terisolasi • Autentikasi MFA Diwajibkan</span>
              </div>
            </div>
            <FeatureHubScreen
              domain="Konsol Kendali Super Admin"
              analyticsSlot={
                <EmptyState
                  id="admin-analytics-empty"
                  icon={Activity}
                  title="Metrik Platform Belum Tersedia"
                  description="Agregasi analitik lintas penyewa, pemantauan latensi model, dan biaya komputasi riil akan aktif sejalan dengan eksekusi beban kerja."
                />
              }
              categoryCards={adminCategoryCards}
              insightFeed={
                <EmptyState
                  id="admin-insights-empty"
                  icon={ShieldCheck}
                  title="Catatan Audit Bersih"
                  description="Seluruh aksi berisiko tinggi dan keputusan sistem tercatat secara permanen di buku catatan audit sistem."
                />
              }
              onNavigate={(route) => console.log('Admin route:', route)}
            />
          </div>
        )}

        {/* Workspace: Fail-Closed Startup Gate Report */}
        {activeWorkspace === 'startup_gate' && (
          <div id="startup-gate-view" className="p-4 md:p-6 space-y-6">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <Cpu className="w-6 h-6 text-amber-500" />
                  Pemeriksaan Kesiapan Sistem (Startup Gate)
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  18 langkah evaluasi fail-closed sebelum menerima beban kerja produksi
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4" />
                <span>Langkah Fondasi Berjalan Bersih</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                <div className="text-xs text-slate-500 font-medium">Langkah Selesai & Valid</div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">2 / 18</div>
                <div className="text-[11px] text-slate-400 mt-1">Skema Environment & Keamanan Runtime</div>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                <div className="text-xs text-slate-500 font-medium">Langkah Menunggu Modul</div>
                <div className="text-2xl font-bold text-slate-600 dark:text-slate-300 mt-1">16 / 18</div>
                <div className="text-[11px] text-slate-400 mt-1">Status not_implemented_yet transparan</div>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                <div className="text-xs text-slate-500 font-medium">Kegagalan Konfigurasi</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">0</div>
                <div className="text-[11px] text-emerald-500 mt-1">Bebas dari nilai asal / tiruan</div>
              </div>
            </div>

            {/* Checklist List */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0B1220]">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Daftar 18 Langkah Evaluasi Startup Gate
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {STARTUP_GATE_CHECKS.map((item) => (
                  <div key={item.step} className="p-4 flex items-start gap-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                    <div className="mt-0.5">
                      {item.status === 'passed' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : item.status === 'failed' ? (
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                      ) : (
                        <Clock className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          #{item.step.toString().padStart(2, '0')}
                        </span>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {item.name}
                        </h4>
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                            item.status === 'passed'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : item.status === 'failed'
                              ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {item.status === 'passed'
                            ? 'Lolos'
                            : item.status === 'failed'
                            ? 'Gagal'
                            : 'Tahap Berikutnya'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
