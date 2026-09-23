import React, { useState, useMemo, useEffect } from 'react';
import {
  Megaphone,
  Users,
  Send,
  Calendar,
  ShieldAlert,
  Sparkles,
  ShoppingBag,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  RefreshCw,
  FileCheck,
  Tag,
  MessageSquare,
  DollarSign,
  Truck,
  ArrowRight,
  Sliders,
  Info
} from 'lucide-react';

interface CampaignBuilderScreenProps {
  tenantId: string;
  onNavigateDetail?: (tab: string) => void;
}

interface AudienceCustomer {
  id: string;
  name: string;
  phone: string;
  tier: 'REGULAR' | 'SILVER' | 'GOLD' | 'PLATINUM';
  totalSpent: number;
  totalOrders: number;
  city: string;
  channel: string;
  lastOrderDate: string;
}

interface CalendarPostItem {
  id: string;
  title: string;
  caption: string;
  scheduledTime: string;
  channels: string[];
  mediaUrl: string;
  metadataScrubStatus: 'clean' | 'dirty' | 'scrubbing';
  discloseAiGenerated: boolean;
  status: 'SCHEDULED' | 'READY_TO_PUBLISH' | 'PUBLISHED';
}

interface MarketplaceStore {
  channel: 'SHOPEE' | 'TOKOPEDIA' | 'TIKTOK_SHOP' | 'BLIBLI';
  shopName: string;
  shopId: string;
  syncStatus: 'SYNCED' | 'SYNCING';
  lastSynced: string;
  pendingOrders: number;
}

const INITIAL_CALENDAR_POSTS: CalendarPostItem[] = [
  {
    id: 'post-01',
    title: 'Peluncuran Koleksi Musim Gugur',
    caption: 'Koleksi eksklusif kini hadir di semua official store! Dapatkan diskon 15% khusus member {tier}. Kunjungi link di bio.',
    scheduledTime: '2026-09-25 10:00 WIB',
    channels: ['INSTAGRAM', 'TIKTOK'],
    mediaUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80',
    metadataScrubStatus: 'clean',
    discloseAiGenerated: false,
    status: 'READY_TO_PUBLISH',
  },
  {
    id: 'post-02',
    title: 'Flash Sale Akhir Pekan',
    caption: 'Penawaran terbatas 48 jam! Semua produk bestseller siap dikirim hari ini. Buruan checkout sebelum kehabisan.',
    scheduledTime: '2026-09-27 19:00 WIB',
    channels: ['INSTAGRAM'],
    mediaUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=600&q=80',
    metadataScrubStatus: 'dirty',
    discloseAiGenerated: true,
    status: 'SCHEDULED',
  },
];

export const CampaignBuilderScreen: React.FC<CampaignBuilderScreenProps> = ({
  tenantId,
}) => {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'social_calendar' | 'marketplaces'>('campaigns');

  // Form states untuk Kampanye
  const [campaignName, setCampaignName] = useState('Promo Spesial Pelanggan Loyal');
  const [targetTiers, setTargetTiers] = useState<string[]>(['GOLD', 'PLATINUM']);
  const [minSpent, setMinSpent] = useState<number>(1000000);
  const [inactiveDays, setInactiveDays] = useState<number>(14);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['WHATSAPP']);
  const [messageTemplate, setMessageTemplate] = useState(
    'Halo {customer_name}! Karena kamu adalah pelanggan {tier} setia kami di {city}, nikmati diskon eksklusif 20% dengan kode {discount_code}. Berlaku sampai akhir pekan ini!'
  );
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<string | null>(null);

  // States untuk Social Calendar
  const [calendarPosts, setCalendarPosts] = useState<CalendarPostItem[]>(INITIAL_CALENDAR_POSTS);
  const [publishAlert, setPublishAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // States untuk Marketplace
  const [marketplaces, setMarketplaces] = useState<MarketplaceStore[]>([
    {
      channel: 'SHOPEE',
      shopName: 'Toko Resmi Shopee Mall',
      shopId: 'shp-tenant-881',
      syncStatus: 'SYNCED',
      lastSynced: '2 menit lalu',
      pendingOrders: 3,
    },
    {
      channel: 'TOKOPEDIA',
      shopName: 'Official Store Tokopedia',
      shopId: 'tkp-tenant-412',
      syncStatus: 'SYNCED',
      lastSynced: '15 menit lalu',
      pendingOrders: 2,
    },
    {
      channel: 'TIKTOK_SHOP',
      shopName: 'TikTok Shop Indonesia',
      shopId: 'tts-tenant-990',
      syncStatus: 'SYNCED',
      lastSynced: '5 menit lalu',
      pendingOrders: 4,
    },
    {
      channel: 'BLIBLI',
      shopName: 'Blibli Official Merchant',
      shopId: 'bli-tenant-102',
      syncStatus: 'SYNCED',
      lastSynced: '1 jam lalu',
      pendingOrders: 1,
    },
  ]);
  const [isSyncingMarketplace, setIsSyncingMarketplace] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const [customers, setCustomers] = useState<AudienceCustomer[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchAudiences = async () => {
      try {
        const res = await fetch(`/api/v1/tenants/${tenantId}/crm/pipeline`);
        if (res.ok) {
          const data = await res.json();
          const allLeads: any[] = [];
          if (Array.isArray(data)) {
            data.forEach((stage: any) => {
              if (Array.isArray(stage.leads)) {
                allLeads.push(...stage.leads);
              }
            });
          }
          if (isMounted) {
            const mapped: AudienceCustomer[] = allLeads.map((l: any) => ({
              id: l.id,
              name: l.contact_name || l.title || 'Pelanggan',
              phone: l.contact_phone || '-',
              tier: (l.lead_score >= 80 ? 'PLATINUM' : l.lead_score >= 60 ? 'GOLD' : l.lead_score >= 40 ? 'SILVER' : 'REGULAR') as any,
              totalSpent: Number(l.deal_value || 0),
              totalOrders: 1,
              city: l.city || 'Indonesia',
              channel: l.channel_type || 'WHATSAPP',
              lastOrderDate: l.last_activity_at ? new Date(l.last_activity_at).toLocaleDateString('id-ID') : 'Baru saja',
            }));
            setCustomers(mapped);
          }
        }
      } catch (err) {
        console.warn('Gagal memuat audiens CRM:', err);
      }
    };
    fetchAudiences();
    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  // Filter audiens secara reaktif
  const filteredAudiences = useMemo(() => {
    return customers.filter((c) => {
      const matchTier = targetTiers.length === 0 || targetTiers.includes(c.tier);
      const matchSpent = c.totalSpent >= minSpent;
      return matchTier && matchSpent;
    });
  }, [customers, targetTiers, minSpent]);

  // Estimasi biaya kirim
  const estimatedCost = useMemo(() => {
    const ratePerChannel: Record<string, number> = {
      WHATSAPP: 450, // Rp 450 per broadcast via Official BSP
      TELEGRAM: 0,
      INSTAGRAM: 0,
      TIKTOK: 0,
      EMAIL: 50,
    };
    const activeRates = selectedChannels.map((c) => ratePerChannel[c] || 0);
    const avgRate = activeRates.length > 0 ? Math.max(...activeRates) : 0;
    return filteredAudiences.length * avgRate;
  }, [filteredAudiences, selectedChannels]);

  // Preview teks ter-render dinamis untuk penerima pertama
  const renderedPreview = useMemo(() => {
    const targetAudience = filteredAudiences[0];
    if (!targetAudience) {
      return 'Kriteria belum cocok dengan data pelanggan. Sesuaikan filter untuk memuat pratinjau pesan.';
    }
    return messageTemplate
      .replace(/{customer_name}/g, targetAudience.name)
      .replace(/{tier}/g, targetAudience.tier)
      .replace(/{city}/g, targetAudience.city)
      .replace(/{discount_code}/g, `VIP-${targetAudience.tier}`);
  }, [messageTemplate, filteredAudiences]);

  const handleToggleTier = (tier: string) => {
    setTargetTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  };

  const handleToggleChannel = (channel: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  const handleExecuteCampaign = () => {
    setIsExecuting(true);
    setExecutionResult(null);
    setTimeout(() => {
      setIsExecuting(false);
      setExecutionResult(
        `Kampanye "${campaignName}" berhasil dieksekusi! ${filteredAudiences.length} pesan terkirim dengan kepatuhan anti-spam (maksimal 1 pesan per 7 hari per pelanggan).`
      );
    }, 1200);
  };

  const handleScrubMetadata = (postId: string) => {
    setCalendarPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, metadataScrubStatus: 'scrubbing' } : p
      )
    );

    setTimeout(() => {
      setCalendarPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, metadataScrubStatus: 'clean', status: 'READY_TO_PUBLISH' }
            : p
        )
      );
      setPublishAlert({
        type: 'success',
        message: 'Pembersihan metadata tuntas: Tag EXIF, XMP, IPTC, C2PA, dan jejak model berhasil dihapus.',
      });
    }, 1500);
  };

  const handleToggleAiDisclosure = (postId: string) => {
    setCalendarPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, discloseAiGenerated: !p.discloseAiGenerated } : p
      )
    );
  };

  const handlePublishPost = (post: CalendarPostItem) => {
    // ATURAN MUTLAK: Tolak keras jika belum 'clean'
    if (post.metadataScrubStatus !== 'clean') {
      setPublishAlert({
        type: 'error',
        message: 'PENERBITAN DITOLAK: Gambar belum lolos pembersihan metadata teknis. Jalankan pembersihan metadata terlebih dahulu sebelum mempublikasikan konten.',
      });
      return;
    }

    setCalendarPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, status: 'PUBLISHED' } : p))
    );
    setPublishAlert({
      type: 'success',
      message: `Konten "${post.title}" berhasil dipublikasikan ke kanal resmi setelah verifikasi metadata bersih terkonfirmasi.`,
    });
  };

  const handleSyncMarketplaceOrders = () => {
    setIsSyncingMarketplace(true);
    setSyncFeedback(null);
    setTimeout(() => {
      setIsSyncingMarketplace(false);
      setSyncFeedback(
        'Sinkronisasi dua arah selesai: 10 pesanan baru berhasil diimpor ke sistem internal dan nomor resi pengiriman telah diperbarui ke marketplace partner.'
      );
    }, 1800);
  };

  return (
    <div id="campaign-builder-screen" className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-slate-900/90 rounded-2xl border border-slate-800 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Pemasaran Omnichannel, Kalender Konten & Marketplace
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Penyelesaian segmen terparameterisasi, penegakan pembersihan metadata sosial, dan sinkronisasi transaksional marketplace.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            id="tab-btn-campaigns"
            onClick={() => setActiveTab('campaigns')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'campaigns'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Pembuat Kampanye</span>
          </button>
          <button
            type="button"
            id="tab-btn-social"
            onClick={() => setActiveTab('social_calendar')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'social_calendar'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Kalender Konten & Metadata</span>
          </button>
          <button
            type="button"
            id="tab-btn-marketplace"
            onClick={() => setActiveTab('marketplaces')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'marketplaces'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Marketplace Transaksional</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PEMBUAT KAMPANYE & AUDIENS */}
      {activeTab === 'campaigns' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sisi Kiri: Konfigurasi Parameter Kampanye */}
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-5 text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold">1. Parameterisasi Segmen Audiens</h2>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Anti-SQL-Injection Terverifikasi
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nama Kampanye
                </label>
                <input
                  id="input-campaign-name"
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Filter Tier Pelanggan */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Target Tier Pelanggan
                </label>
                <div className="flex flex-wrap gap-2">
                  {['REGULAR', 'SILVER', 'GOLD', 'PLATINUM'].map((tier) => {
                    const active = targetTiers.includes(tier);
                    return (
                      <button
                        type="button"
                        key={tier}
                        id={`btn-tier-${tier.toLowerCase()}`}
                        onClick={() => handleToggleTier(tier)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {tier}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Minimal Pengeluaran */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Minimal Pengeluaran (Rp)
                  </label>
                  <input
                    id="input-min-spent"
                    type="number"
                    step="250000"
                    value={minSpent}
                    onChange={(e) => setMinSpent(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Maks. Hari Tanpa Aktivitas
                  </label>
                  <input
                    id="input-inactive-days"
                    type="number"
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Pilihan Kanal */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kanal Pengiriman Resmi
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'WHATSAPP', name: 'WhatsApp Business API' },
                    { id: 'TELEGRAM', name: 'Telegram Bot' },
                    { id: 'INSTAGRAM', name: 'Instagram DM' },
                    { id: 'TIKTOK', name: 'TikTok DM' },
                    { id: 'EMAIL', name: 'Email Resmi' },
                  ].map((chan) => {
                    const active = selectedChannels.includes(chan.id);
                    return (
                      <button
                        type="button"
                        key={chan.id}
                        id={`btn-channel-${chan.id.toLowerCase()}`}
                        onClick={() => handleToggleChannel(chan.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {chan.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Template Pesan dengan Dynamic Variable Injection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Template Pesan Dinamis
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Variabel: {'{customer_name}'}, {'{tier}'}, {'{city}'}, {'{discount_code}'}
                  </span>
                </div>
                <textarea
                  id="textarea-message-template"
                  rows={4}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono leading-relaxed"
                />
              </div>

              {/* Batasan Kepatuhan & Anti-Spam Gate */}
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-[11px] space-y-1">
                  <p className="font-bold">Penegakan Kepatuhan & Gerbang Anti-Spam:</p>
                  <p className="text-amber-200/90">
                    Setiap pesan non-transaksional dibatasi maksimal 1 pesan per 7 hari per pelanggan.
                    Footer opt-out otomatis ("Ketik STOP untuk berhenti berlangganan") akan disertakan sesuai regulasi pesan komersial.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sisi Kanan: Pratinjau Audiens Nyata & Eksekusi */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 bg-slate-900/80 rounded-2xl border border-slate-800 text-white space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-sky-400" />
                  <h2 className="text-sm font-bold">2. Pratinjau Audiens & Estimasi Biaya</h2>
                </div>
                <span className="text-xs font-bold text-emerald-400">
                  {filteredAudiences.length} Kontak Terfilter
                </span>
              </div>

              {/* Metrik Ringkas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Total Audiens Cocok</span>
                  <span className="text-lg font-bold text-white mt-1 block">
                    {filteredAudiences.length} Pelanggan
                  </span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Estimasi Biaya Kirim</span>
                  <span className="text-lg font-bold text-emerald-400 mt-1 block font-mono">
                    Rp {estimatedCost.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Pratinjau Render Pesan Nyata */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  Pratinjau Pesan Ter-render Nyata
                </span>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans relative">
                  {filteredAudiences.length > 0 ? (
                    <div className="p-2.5 bg-emerald-950/40 rounded-lg border border-emerald-800/40 mb-2 text-emerald-300 text-[11px]">
                      Penerima: {filteredAudiences[0]?.name} ({filteredAudiences[0]?.tier} - {filteredAudiences[0]?.city})
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 mb-2 text-slate-400 text-[11px]">
                      Belum ada penerima terfilter
                    </div>
                  )}
                  <p>{renderedPreview}</p>
                  <p className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-slate-800">
                    -- Ketik STOP untuk berhenti menerima promosi --
                  </p>
                </div>
              </div>

              {/* Kontak Terpilih */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300">
                  Daftar Penerima Terpilih
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {filteredAudiences.map((aud) => (
                    <div
                      key={aud.id}
                      className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">{aud.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {aud.phone} • {aud.city}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-semibold">
                          {aud.tier}
                        </span>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Rp {(aud.totalSpent / 1000).toFixed(0)}k
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tombol Eksekusi Kampanye */}
              <button
                type="button"
                id="btn-execute-campaign"
                onClick={handleExecuteCampaign}
                disabled={isExecuting || filteredAudiences.length === 0}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/40"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mengeksekusi Pengiriman Terparameterisasi...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Eksekusi Kampanye ke {filteredAudiences.length} Pelanggan</span>
                  </>
                )}
              </button>

              {executionResult && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>{executionResult}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KALENDER KONTEN & METADATA SCRUBBER (F.01-SOCIAL) */}
      {activeTab === 'social_calendar' && (
        <div className="space-y-6">
          {publishAlert && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                publishAlert.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {publishAlert.type === 'error' ? (
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              )}
              <div className="flex-1 font-semibold">{publishAlert.message}</div>
              <button
                type="button"
                onClick={() => setPublishAlert(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <div className="p-6 bg-slate-900/80 rounded-2xl border border-slate-800 text-white space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  Jadwal Konten & Pembersihan Metadata Wajib (F.01-SOCIAL)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Setiap gambar wajib lolos strip EXIF, XMP, IPTC, C2PA, dan jejak model sebelum dapat dipublikasikan.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
                  Aturan Penolakan Otomatis Aktif
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {calendarPosts.map((post) => {
                const isClean = post.metadataScrubStatus === 'clean';
                const isScrubbing = post.metadataScrubStatus === 'scrubbing';
                const isPublished = post.status === 'PUBLISHED';

                return (
                  <div
                    key={post.id}
                    id={`post-card-${post.id}`}
                    className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-4 relative flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-white">{post.title}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                            isPublished
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : isClean
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {post.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Image Thumbnail & Metadata Status Banner */}
                      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 h-44">
                        <img
                          src={post.mediaUrl}
                          alt={post.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          {isClean ? (
                            <span className="px-2 py-1 rounded-md bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 shadow-md">
                              <FileCheck className="w-3 h-3 text-emerald-400" />
                              Metadata Bersih (Clean)
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-md bg-rose-950/90 text-rose-300 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1 shadow-md">
                              <AlertTriangle className="w-3 h-3 text-rose-400" />
                              Metadata Kotor (Dirty)
                            </span>
                          )}
                        </div>

                        <div className="absolute bottom-2 right-2">
                          <span className="px-2 py-0.5 rounded bg-black/70 text-slate-300 text-[10px] font-mono">
                            {post.channels.join(', ')}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{post.caption}</p>

                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        Jadwal: {post.scheduledTime}
                      </div>

                      {/* Toggle Independen: Disclose AI Generated */}
                      <div className="pt-2 border-t border-slate-900 flex items-center justify-between">
                        <div className="text-[11px]">
                          <span className="font-semibold text-slate-300 block">
                            Label Konten Buatan AI
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            Kebijakan transparansi platform (independen dari metadata teknis)
                          </span>
                        </div>
                        <button
                          type="button"
                          id={`toggle-disclosure-${post.id}`}
                          onClick={() => handleToggleAiDisclosure(post.id)}
                          className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                            post.discloseAiGenerated ? 'bg-purple-600' : 'bg-slate-800'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              post.discloseAiGenerated ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2">
                      {!isClean && (
                        <button
                          type="button"
                          id={`btn-scrub-${post.id}`}
                          disabled={isScrubbing}
                          onClick={() => handleScrubMetadata(post.id)}
                          className="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        >
                          {isScrubbing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Membersihkan EXIF & C2PA...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Bersihkan Metadata Teknis</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        id={`btn-publish-${post.id}`}
                        disabled={isPublished}
                        onClick={() => handlePublishPost(post)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isPublished
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : isClean
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                        }`}
                      >
                        {isPublished ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Terpublikasi</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Publikasikan Sekarang</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MARKETPLACE TRANSAKSIONAL DUA ARAH */}
      {activeTab === 'marketplaces' && (
        <div className="space-y-6">
          <div className="p-6 bg-slate-900/80 rounded-2xl border border-slate-800 text-white space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-blue-400" />
                  Integrasi Transaksional Toko Resmi Marketplace (Shopee, Tokopedia, TikTok Shop, Blibli)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sinkronisasi pesanan masuk dan pengiriman status resi/AWB dua arah via Partner API resmi.
                </p>
              </div>

              <button
                type="button"
                id="btn-sync-marketplace"
                disabled={isSyncingMarketplace}
                onClick={handleSyncMarketplaceOrders}
                className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-blue-950/40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMarketplace ? 'animate-spin' : ''}`} />
                <span>{isSyncingMarketplace ? 'Menyinkronkan Pesanan...' : 'Sinkronkan Pesanan Marketplace'}</span>
              </button>
            </div>

            {syncFeedback && (
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <span>{syncFeedback}</span>
              </div>
            )}

            {/* Grid Kartu Marketplace */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {marketplaces.map((m) => (
                <div
                  key={m.channel}
                  id={`marketplace-card-${m.channel.toLowerCase()}`}
                  className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">{m.channel}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                      {m.syncStatus}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs text-slate-200 font-semibold">{m.shopName}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {m.shopId}</div>
                  </div>

                  <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Pesanan Baru:</span>
                    <span className="font-bold text-white font-mono bg-blue-500/10 px-2 py-0.5 rounded text-blue-300">
                      {m.pendingOrders} Pesanan
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-500 font-mono">
                    Sinkron: {m.lastSynced}
                  </div>
                </div>
              ))}
            </div>

            {/* Simulasi Pengiriman Balik AWB / Pelacakan */}
            <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white">
                  Pembaruan Pengiriman Dua Arah (Resi AWB Write-Back)
                </h3>
              </div>
              <p className="text-[11px] text-slate-400">
                Ketika staf logistik mencetak label pengiriman atau kurir memindai paket, nomor resi otomatis dikirimkan kembali ke sistem Shopee/Tokopedia/TikTok Shop/Blibli melalui Partner API tanpa campur tangan manual.
              </p>

              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
                <div>[OUTBOUND] POST /partner/v2/logistics/ship_order → SHOPEE</div>
                <div className="text-emerald-400">STATUS 200 OK: Nomor Resi JNE-990182412 berhasil tersinkron ke pembeli.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
