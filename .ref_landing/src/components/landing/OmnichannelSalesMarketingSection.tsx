import React, { useState } from 'react';
import {
  MessageSquare,
  ShoppingBag,
  Target,
  Users2,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Zap,
  Bot,
  Send,
  UserCheck,
  Search,
  Filter,
  CreditCard,
  Truck,
  RotateCcw,
  BarChart3,
  Globe2,
  Smartphone,
  PhoneCall,
  Check,
  ChevronRight,
  Sliders,
  DollarSign,
  Layers,
  Inbox,
  Clock,
  AlertCircle
} from 'lucide-react';

export const OmnichannelSalesMarketingSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'identity' | 'commerce' | 'personas' | 'campaign'>('inbox');
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'instagram' | 'tiktok' | 'marketplace' | 'webchat'>('whatsapp');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('sdr');

  const channelMetrics = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Cloud API',
      icon: '💬',
      badge: 'Multi-Number Verified',
      activeLeads: '2,840 Chat',
      conversionRate: '28.4%',
      avgResponseTime: '2.4 dtk',
      sampleLead: {
        customer: 'Hendra Wijaya (PT Sinar Berkah)',
        channelTag: 'WhatsApp Enterprise',
        intent: 'Inquiry Mesin Pabrik 500kVA',
        leadScore: 92,
        status: 'HOT LEAD • Diteruskan ke AE',
        transcript: [
          { sender: 'customer', text: 'Halo selamat siang, apakah ada katalog genset industri 500kVA silent type beserta pricelist?' },
          { sender: 'ai', text: 'Selamat siang Pak Hendra. Tersedia 2 varian genset industri 500kVA Silent Type (Perkins & Cummins Engine) dengan garansi resmi 2 tahun. Berikut brosur spesifikasi PDF dan estimasi harga dasarnya.' },
          { sender: 'customer', text: 'Bagus sekali. Apakah bisa include instalasi ATS dan pengiriman ke Karawang?' },
          { sender: 'ai', text: 'Tentu bisa. Paket mencakup instalasi panel ATS otomatis, uji beban, dan pengiriman ke Karawang. Saya buatkan draf penawaran resmi untuk di-review oleh Senior Account Executive kami, Pak Doni.' }
        ]
      }
    },
    {
      id: 'instagram',
      name: 'Instagram Direct & Comments',
      icon: '📸',
      badge: 'Auto DM & Comment Router',
      activeLeads: '1,420 Prospek',
      conversionRate: '19.2%',
      avgResponseTime: '3.1 dtk',
      sampleLead: {
        customer: '@maya.boutique.id',
        channelTag: 'Instagram DM',
        intent: 'Pemesanan Grosir Kemasan Eco-Friendly',
        leadScore: 84,
        status: 'QUALIFIED • Checkout Link Sent',
        transcript: [
          { sender: 'customer', text: 'Sis mau tanya box packaging corrugated size 25x20x10 custom cetak logo minimal order berapa ya?' },
          { sender: 'ai', text: 'Halo Kak Maya! Untuk custom cetak logo full color minimal order 200 pcs dengan estimasi produksi 4 hari kerja. Brand kit warna kami jamin akurat.' },
          { sender: 'customer', text: 'Bisa minta link simulasi harga untuk 500 pcs?' },
          { sender: 'ai', text: 'Siap Kak! Ini link keranjang checkout instan untuk 500 pcs dengan potongan diskon volume 12%. Link otomatis aktif selama 24 jam.' }
        ]
      }
    },
    {
      id: 'tiktok',
      name: 'TikTok Shop & Live DM',
      icon: '🎵',
      badge: 'Real-time Live Sync',
      activeLeads: '3,110 Pembeli',
      conversionRate: '24.6%',
      avgResponseTime: '1.8 dtk',
      sampleLead: {
        customer: 'Rian Skincare Lover',
        channelTag: 'TikTok Shop Direct',
        intent: 'Konsultasi Serum & Voucher Diskon',
        leadScore: 88,
        status: 'ORDER COMPLETED • QRIS Verified',
        transcript: [
          { sender: 'customer', text: 'Min kulit aku gampang jerawatan cocok paket serum yang mana ya yang lagi flash sale di live?' },
          { sender: 'ai', text: 'Halo Rian! Berdasarkan jenis kulit acne-prone, kami sangat merekomendasikan Paket Salicylic Acid 2% + Niacinamide Serum yang sedang diskon bundling 30%.' },
          { sender: 'customer', text: 'Langsung bayar pakai QRIS bisa?' },
          { sender: 'ai', text: 'Bisa banget! Invoice otomatis terbit dengan barcode QRIS Dinamis. Pesanan langsung masuk antrean pick-up SiCepat hari ini juga.' }
        ]
      }
    },
    {
      id: 'marketplace',
      name: 'Shopee & Tokopedia Sync',
      icon: '🛍️',
      badge: 'Multi-Store Inventory',
      activeLeads: '5,630 Transaksi',
      conversionRate: '31.5%',
      avgResponseTime: '1.5 dtk',
      sampleLead: {
        customer: 'Budi_Santoso99',
        channelTag: 'Shopee Official Store',
        intent: 'Validasi Stok & Garansi Resmi',
        leadScore: 95,
        status: 'PAID • Resi Terbit Otomatis',
        transcript: [
          { sender: 'customer', text: 'Barang ready kirim hari ini pakai Instant Kurir?' },
          { sender: 'ai', text: 'Ready stock 18 unit di gudang Jakarta Barat. Pemesanan sebelum pukul 15.00 WIB langsung dikirim via Instant Kurir.' },
          { sender: 'customer', text: 'Sudah saya bayar ya min nomor pesanan 240915XYZ.' },
          { sender: 'ai', text: 'Terima kasih Pak Budi! Pembayaran telah terverifikasi sistem. Tim gudang sedang melakukan packing proteksi bubble wrap ganda.' }
        ]
      }
    },
    {
      id: 'webchat',
      name: 'Website Live Sales Widget',
      icon: '🌐',
      badge: 'Native Web Widget',
      activeLeads: '980 Kunjungan B2B',
      conversionRate: '22.0%',
      avgResponseTime: '2.0 dtk',
      sampleLead: {
        customer: 'Ibu Ratna (Direktur Operasional)',
        channelTag: 'Enterprise Web Portal',
        intent: 'Request Presentasi & POC Software',
        leadScore: 96,
        status: 'HIGH VALUE • Jadwal Meeting Terkunci',
        transcript: [
          { sender: 'customer', text: 'Perusahaan kami memiliki 250 staf dan 4 cabang gudang. Apakah sistem Orchestree bisa integrasi dengan ERP SAP?' },
          { sender: 'ai', text: 'Selamat sore Ibu Ratna. Ya, OrchestreeAI mendukung konektor terverifikasi untuk SAP ECC maupun SAP S/4HANA via RFC & OData API.' },
          { sender: 'customer', text: 'Bagus. Apakah bisa dijadwalkan sesi demo teknis hari Kamis jam 10 pagi?' },
          { sender: 'ai', text: 'Jadwal telah terkonfirmasi di kalender tim Enterprise Solution Architect kami. Undangan Google Meet resmi sudah terkirim ke email kantor Ibu.' }
        ]
      }
    }
  ];

  const currentChannelData = channelMetrics.find((c) => c.id === activeChannel) || channelMetrics[0];

  const personasList = [
    {
      id: 'receptionist',
      title: 'AI Frontliner & Receptionist',
      role: 'Penyambut Prospek & Routing Antrean',
      description: 'Menyapa pelanggan dalam 2 detik, menyaring maksud pembeli, dan mengarahkan ke divisi yang tepat',
      skills: ['Smart Intent Detection', 'Language Auto-Switch (ID/EN)', 'Multi-tenant Routing', 'VIP Queue Prioritization'],
      workload: '100% Pesan Tersaring Tanpa Delay'
    },
    {
      id: 'sdr',
      title: 'AI Sales Development Rep (SDR)',
      role: 'Kualifikasi Prospek & Lead Scoring',
      description: 'Menggali budget, otoritas keputusan, kebutuhan teknis, dan timeline proyek secara natural',
      skills: ['BANT Framework Matrix', 'Lead Scoring 0-100', 'Automated CRM Enrichment', 'Hot Lead Escalation'],
      workload: 'Kualifikasi 500+ Chat/Hari per Agen'
    },
    {
      id: 'consultant',
      title: 'AI Product & Solution Advisor',
      role: 'Konsultan Produk & Penangan Keberatan',
      description: 'Menjawab komparasi teknis, menghitung kalkulasi volume order, dan meredakan keraguan pembeli',
      skills: ['Company Brain Deep RAG', 'Competitor Comparison', 'Objection Dissolving', 'Regulatory Compliance Check'],
      workload: 'Zero Hallucination Guarantee'
    },
    {
      id: 'closer',
      title: 'AI Deal Closer & Quotation',
      role: 'Penerbit Draf Penawaran & Invoice',
      description: 'Menyusun dokumen PDF penawaran harga resmi, menerapkan batas diskon SOP, dan memicu persetujuan',
      skills: ['Dynamic Quotation PDF', 'Discounts Guardrails', 'QRIS & VA Generator', 'Contract Lock Engine'],
      workload: 'Draf Penawaran Terbit dalam 8 Detik'
    },
    {
      id: 'retention',
      title: 'AI Retention & Cart Recovery',
      role: 'Pemulih Keranjang & Re-order Proaktif',
      description: 'Mengingatkan checkout yang tertunda dan memprediksi waktu pembelian ulang perlengkapan habis pakai',
      skills: ['Abandoned Cart Follow-Up', 'LTV Lifetime Value Modeling', 'Replenishment Reminder', 'Churn Prevention'],
      workload: '+26% Penyelamatan Keranjang'
    }
  ];

  const selectedPersona = personasList.find((p) => p.id === selectedPersonaId) || personasList[0];

  const funnelStages = [
    { name: '1. First Contact & Greeting', desc: 'Respon otomatis <3 detik di kanal mana pun pelanggan menghubungi' },
    { name: '2. Discovery & Profiling', desc: 'Identifikasi kebutuhan spesifik, kategori industri, dan preferensi' },
    { name: '3. Smart Product Matching', desc: 'Rekomendasi katalog terpersonalisasi langsung dari Company Brain' },
    { name: '4. Objection Handling', desc: 'Jawaban berbasis fakta atas komparasi harga, bahan, dan garansi resmi' },
    { name: '5. Instant Cart & Checkout', desc: 'Penerbitan tautan keranjang dan invoice ber-barcode QRIS Dinamis' },
    { name: '6. Payment Webhook Verification', desc: 'Validasi mutasi bank/gateway otomatis tanpa upload bukti transfer palsu' },
    { name: '7. Logistics & Order Tracking', desc: 'Sinkronisasi nomor resi kurir dan notifikasi pengantaran real-time' },
    { name: '8. Post-Sale & Retention Loop', desc: 'Follow-up kepuasan CSAT dan jadwal pengingat repeat order otomatis' }
  ];

  return (
    <section id="omnichannel-sales" className="py-24 bg-[#071226] text-white border-t border-white/10 relative overflow-hidden">
      {/* Background Subtle Gradient Glow */}
      <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-[#08B85C]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[500px] h-[500px] bg-[#16B7D9]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header without trailing periods */}
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4">
            <Target className="w-3.5 h-3.5" />
            <span>OMNICHANNEL SALES & MARKETING WORKFORCE</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Sistem Penjualan & Pemasaran Omnichannel Terpadu
          </h2>

          <p className="mt-4 text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed max-w-3xl mx-auto">
            Hubungkan seluruh kanal interaksi pelanggan—dari WhatsApp, Telegram, TikTok, Instagram, hingga Web Chat dan Marketplace—ke dalam satu mesin kualifikasi penjualan dan mesin konversi otomatis
          </p>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2 border-b border-white/10 pb-4">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'inbox'
                ? 'bg-gradient-to-r from-[#08B85C] to-[#16B7D9] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Unified Multi-Channel Inbox</span>
          </button>

          <button
            onClick={() => setActiveTab('identity')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'identity'
                ? 'bg-gradient-to-r from-[#08B85C] to-[#16B7D9] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Users2 className="w-4 h-4" />
            <span>Customer 360 & Identity Resolution</span>
          </button>

          <button
            onClick={() => setActiveTab('commerce')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'commerce'
                ? 'bg-gradient-to-r from-[#08B85C] to-[#16B7D9] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Full-Funnel Commerce Engine</span>
          </button>

          <button
            onClick={() => setActiveTab('personas')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'personas'
                ? 'bg-gradient-to-r from-[#08B85C] to-[#16B7D9] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>10 AI Sales Personas & Scoring</span>
          </button>

          <button
            onClick={() => setActiveTab('campaign')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'campaign'
                ? 'bg-gradient-to-r from-[#08B85C] to-[#16B7D9] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Kampanye Cerdas & Revenue Attribution</span>
          </button>
        </div>

        {/* Tab 1: Multi-Channel Inbox Live Demonstration */}
        {activeTab === 'inbox' && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Channel Switcher */}
            <div className="lg:col-span-4 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#08B85C] mb-2">
                Pilih Kanal Komunikasi Aktif
              </h3>

              {channelMetrics.map((c) => {
                const isSelected = activeChannel === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveChannel(c.id as any)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-white/10 border-[#08B85C] shadow-lg shadow-[#08B85C]/15'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{c.icon}</span>
                      <div>
                        <div className="text-sm font-bold text-white">{c.name}</div>
                        <div className="text-[11px] text-slate-400">{c.badge}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-[#08B85C]">{c.conversionRate}</div>
                      <div className="text-[10px] text-slate-400">Konversi</div>
                    </div>
                  </button>
                );
              })}

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-slate-300 space-y-2 mt-4">
                <div className="flex items-center space-x-2 text-white font-semibold">
                  <ShieldCheck className="w-4 h-4 text-[#08B85C]" />
                  <span>Kepatuhan Multi-Nomor & Kredit Terpusat</span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Setiap tenant dapat mendaftarkan beberapa nomor WhatsApp resmi dengan alokasi token kredit terpusat, pembagian shift kerja, dan pembatasan wewenang antar divisi
                </p>
              </div>
            </div>

            {/* Right Interactive Chat Simulation */}
            <div className="lg:col-span-8 rounded-3xl bg-[#0B1835] border border-white/15 p-6 shadow-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/10 gap-2">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#08B85C] to-[#16B7D9] flex items-center justify-center font-bold text-white">
                    {currentChannelData.sampleLead.customer.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>{currentChannelData.sampleLead.customer}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-slate-300 font-normal">
                        {currentChannelData.sampleLead.channelTag}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">{currentChannelData.sampleLead.intent}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="px-3 py-1 rounded-xl bg-[#08B85C]/20 border border-[#08B85C]/40 text-[#08B85C] font-mono text-xs font-bold">
                    Skor: {currentChannelData.sampleLead.leadScore}/100
                  </div>
                  <span className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 px-3 py-1 rounded-xl border border-cyan-500/30">
                    {currentChannelData.sampleLead.status}
                  </span>
                </div>
              </div>

              {/* Chat Timeline Simulation */}
              <div className="space-y-3 py-3 min-h-[260px]">
                {currentChannelData.sampleLead.transcript.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex items-start space-x-2.5 ${
                      msg.sender === 'customer' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    {msg.sender === 'customer' && (
                      <div className="w-7 h-7 rounded-full bg-slate-700 text-slate-200 text-xs flex items-center justify-center font-bold shrink-0 mt-1">
                        C
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] sm:max-w-[70%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                        msg.sender === 'customer'
                          ? 'bg-white/10 text-slate-100 rounded-tl-none border border-white/10'
                          : 'bg-gradient-to-r from-[#08B85C]/20 via-[#16B7D9]/20 to-[#1976E8]/20 border border-[#08B85C]/40 text-white rounded-tr-none shadow-md'
                      }`}
                    >
                      <div className="text-[10px] font-bold mb-1 opacity-70 flex items-center space-x-1">
                        {msg.sender === 'customer' ? (
                          <span>Pelanggan</span>
                        ) : (
                          <>
                            <Bot className="w-3 h-3 text-[#08B85C]" />
                            <span className="text-[#08B85C]">Orchestree AI Sales Agent</span>
                          </>
                        )}
                      </div>
                      <p>{msg.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Handover & Context Panel Bar */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2 text-slate-300">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Respon rata-rata: <strong className="text-white font-mono">{currentChannelData.avgResponseTime}</strong></span>
                </div>
                <div className="flex items-center space-x-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-[#08B85C]" />
                  <span>Sinkronisasi CRM & ERP: <strong className="text-emerald-400">Aktif Real-time</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Customer 360 & Identity Resolution */}
        {activeTab === 'identity' && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#16B7D9]/15 text-[#16B7D9] text-xs font-semibold">
                <Users2 className="w-3.5 h-3.5" />
                <span>CROSS-PLATFORM IDENTITY RESOLUTION</span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Satu Profil Pelanggan Utuh Meskipun Berpindah 4 Kanal Berbeda
              </h3>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Pelanggan sering bertanya di Instagram DM, berpindah ke WhatsApp untuk nego harga, lalu checkout di Shopee. Engine Resolusi Identitas menyatukan seluruh jejak percakapan menjadi satu timeline tunggal tanpa data ganda
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-[#08B85C] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block text-sm">Exact Matching Terenkripsi</strong>
                    <span className="text-slate-400">Pencocokan presisi menggunakan nomor handphone terverifikasi atau alamat email resmi dengan enkripsi hash SHA-256</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-[#16B7D9] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block text-sm">Strong & Declared Linking</strong>
                    <span className="text-slate-400">Tautan identitas otomatis saat pelanggan menyebutkan nama akun media sosial atau nomor invoice sebelumnya</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block text-sm">Human Approval Gate untuk Kemiripan Rendah</strong>
                    <span className="text-slate-400">Jika terdapat ambiguitas profil, AI meminta konfirmasi staf manusia sebelum menggabungkan data sensitif</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile 360 Visual Mockup */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-[#0B1835] border border-white/15 shadow-2xl space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#08B85C] to-[#1976E8] flex items-center justify-center text-white font-black text-lg">
                    HW
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">Hendra Wijaya</h4>
                    <p className="text-xs text-slate-400">PT Sinar Berkah Logistik • Manufaktur & Distribusi</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold">
                  VIP TIER 1
                </span>
              </div>

              {/* Linked Accounts Pills */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Kanal Terhubung:</span>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200">
                    WA: +62 812-9882-XXXX
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200">
                    IG: @sinarberkah_id
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200">
                    Email: hendra@sinarberkah.co.id
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="text-slate-400 text-[10px] uppercase">Lifetime Value</div>
                  <div className="text-sm sm:text-base font-bold text-[#08B85C] font-mono mt-0.5">Rp 284.500.000</div>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="text-slate-400 text-[10px] uppercase">Total Order</div>
                  <div className="text-sm sm:text-base font-bold text-white font-mono mt-0.5">14 Transaksi</div>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="text-slate-400 text-[10px] uppercase">Sentimen CSAT</div>
                  <div className="text-sm sm:text-base font-bold text-cyan-300 font-mono mt-0.5">99.2% Puas</div>
                </div>
              </div>

              {/* Recent Activity Log */}
              <div className="space-y-2 text-xs">
                <div className="text-slate-400 font-semibold">Aktivitas Lintas Saluran Terbaru:</div>
                <div className="space-y-1.5">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-200">WhatsApp: Kualifikasi Genset 500kVA</span>
                    <span className="text-slate-400 text-[10px]">Hari ini, 13:45</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-200">Instagram: Like & Tanya Promo Kemerdekaan</span>
                    <span className="text-slate-400 text-[10px]">Kemarin, 20:12</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                    <span className="text-slate-200">Payment Gateway: Pelunasan Invoice #INV-8832</span>
                    <span className="text-slate-400 text-[10px]">12 Ags 2026</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Full-Funnel Commerce Engine */}
        {activeTab === 'commerce' && (
          <div className="mt-10 space-y-8">
            <div className="text-center max-w-2xl mx-auto">
              <h3 className="text-2xl font-bold text-white">
                Siklus Penjualan Lengkap dari Percakapan hingga Settlement Finansial
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300">
                Bukan sekadar chatbot pembuka FAQ. Sistem mampu membuat keranjang, menerbitkan penawaran, memverifikasi webhook pembayaran QRIS/VA, dan menginformasikan resi kurir
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {funnelStages.map((stage, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#08B85C]/40 transition-all space-y-2 relative group"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#08B85C]/20 to-[#16B7D9]/20 border border-[#08B85C]/30 text-[#08B85C] font-mono text-xs font-bold flex items-center justify-center">
                    0{idx + 1}
                  </div>
                  <h4 className="text-sm font-bold text-white group-hover:text-[#08B85C] transition-colors">
                    {stage.name}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {stage.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Bottom Guardrail Banner */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-blue-950/40 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <ShieldCheck className="w-8 h-8 text-[#08B85C] shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Pencegahan Fraud Bukti Transfer & Otomasi Gateway Terverifikasi
                  </h4>
                  <p className="text-xs text-slate-300">
                    Sistem tidak mengandalkan tangkapan layar transfer palsu. Status lunas hanya berubah jika terkonfirmasi oleh webhook Midtrans, Xendit, atau mutasi bank otomatis
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="px-3 py-1.5 rounded-xl bg-white/10 text-slate-200 text-xs font-semibold">
                  Midtrans • Xendit • BCA • Mandiri
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: 10 AI Sales Personas & Scoring */}
        {activeTab === 'personas' && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Persona List */}
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#08B85C] mb-2">
                Katalog Jabatan Staf AI Penjualan & Pemasaran
              </h3>

              {personasList.map((persona) => {
                const isSelected = selectedPersonaId === persona.id;
                return (
                  <button
                    key={persona.id}
                    onClick={() => setSelectedPersonaId(persona.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-white/10 border-[#08B85C] shadow-lg shadow-[#08B85C]/20'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-white">{persona.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{persona.role}</div>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-[#08B85C] translate-x-1' : 'text-slate-500'}`} />
                  </button>
                );
              })}
            </div>

            {/* Right Persona Detail & Lead Scoring Breakdown */}
            <div className="lg:col-span-7 space-y-6">
              {/* Persona Spec Card */}
              <div className="p-6 sm:p-8 rounded-3xl bg-[#0B1835] border border-white/15 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div>
                    <span className="text-xs font-mono uppercase text-[#08B85C] font-semibold">Role Profile</span>
                    <h4 className="text-xl font-bold text-white">{selectedPersona.title}</h4>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-[#08B85C]/15 border border-[#08B85C]/30 text-[#08B85C] text-xs font-bold font-mono">
                    24/7 ACTIVE
                  </span>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  {selectedPersona.description}
                </p>

                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Keahlian & Kemampuan Utama:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedPersona.skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 flex items-center space-x-1.5"
                      >
                        <Check className="w-3.5 h-3.5 text-[#08B85C]" />
                        <span>{skill}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                  <span>Tingkat Efisiensi:</span>
                  <span className="text-[#08B85C] font-mono font-bold">{selectedPersona.workload}</span>
                </div>
              </div>

              {/* Lead Scoring 0-100 Algorithm Breakdown */}
              <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/10 space-y-4">
                <div className="flex items-center space-x-2 text-white font-bold text-sm">
                  <BarChart3 className="w-4 h-4 text-[#16B7D9]" />
                  <span>Komponen Perhitungan Skor Prospek Otomatis (Lead Scoring 0-100)</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Kelengkapan Kualifikasi BANT (Budget, Authority, Need, Timeline)</span>
                      <span className="font-mono font-bold text-white">25%</span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#08B85C] h-full rounded-full w-[25%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Sinyal Niat Beli (Request Pricelist, Custom Spec, Lokasi Pengiriman)</span>
                      <span className="font-mono font-bold text-white">25%</span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#16B7D9] h-full rounded-full w-[25%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Kebaruan Interaksi & Kecepatan Membalas Pesan</span>
                      <span className="font-mono font-bold text-white">20%</span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-purple-500 h-full rounded-full w-[20%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Kesesuaian Anggaran dengan Katalog Produk Perusahaan</span>
                      <span className="font-mono font-bold text-white">15%</span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full rounded-full w-[15%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Kualitas Kanal Interaksi & Riwayat Transaksi Sebelumnya</span>
                      <span className="font-mono font-bold text-white">15%</span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-400 h-full rounded-full w-[15%]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Kampanye Cerdas & Revenue Attribution */}
        {activeTab === 'campaign' && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/15 text-purple-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>INTELLIGENT REVENUE ATTRIBUTION</span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Hubungkan Setiap Konten & Pesan Promosi Langsung ke Nominal Pendapatan Nyata
              </h3>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Ketahui secara pasti konten mana di Instagram yang mendatangkan chat WhatsApp, dan dari chat mana yang akhirnya membayar invoice. Sistem atribusi closed-loop menghilangkan tebak-tebakan biaya pemasaran
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center space-x-3">
                  <TrendingUp className="w-5 h-5 text-[#08B85C] shrink-0" />
                  <div>
                    <strong className="text-white block">Rantai Atribusi 7 Tahap</strong>
                    <span className="text-slate-400">Konten → Interaksi → Percakapan Chat → Kualifikasi Prospek → Pesanan → Pembayaran → Rekapitulasi Kas</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center space-x-3">
                  <Target className="w-5 h-5 text-[#16B7D9] shrink-0" />
                  <div>
                    <strong className="text-white block">Segmentasi Instruksi Bahasa Alami</strong>
                    <span className="text-slate-400">Cukup perintahkan: "Kirim pesan follow-up penawaran spesial untuk pelanggan B2B di Jabodetabek yang belum re-order selama 60 hari"</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue Attribution Funnel Graphic */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-[#0B1835] border border-white/15 shadow-2xl space-y-4">
              <h4 className="text-sm font-bold text-white pb-3 border-b border-white/10 flex items-center justify-between">
                <span>Laporan Simulasi Realisasi Kampanye Q3</span>
                <span className="text-xs text-[#08B85C] font-mono font-bold">+184% ROI</span>
              </h4>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-slate-300">1. Tayangan Video Reel & Feed</span>
                  <span className="font-mono font-bold text-white">142,500 Impresi</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-slate-300">2. Chat Percakapan WhatsApp Masuk</span>
                  <span className="font-mono font-bold text-[#16B7D9]">3,420 Percakapan</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-slate-300">3. Prospek Berkualitas Tinggi (Skor &gt;75)</span>
                  <span className="font-mono font-bold text-purple-300">1,120 Prospek</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-slate-300">4. Penawaran Harga Disetujui Manajer</span>
                  <span className="font-mono font-bold text-amber-300">410 Kontrak</span>
                </div>
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#08B85C]/20 border border-[#08B85C]/40">
                  <span className="text-white font-bold">5. Total Nilai Pendapatan Masuk Rekening</span>
                  <span className="font-mono font-black text-white text-sm">Rp 1.480.000.000</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
