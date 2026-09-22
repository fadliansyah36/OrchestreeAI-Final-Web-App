import React, { useState } from 'react';
import {
  Building2,
  Cpu,
  Layers,
  ShieldCheck,
  Workflow,
  Network,
  Database,
  Lock,
  GitBranch,
  Activity,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Server,
  Zap,
  BarChart3,
  Bot,
  Users2,
  FileCheck2,
  Search,
  Eye,
  Check,
  AlertTriangle,
  FolderLock,
  MessageSquare,
  HelpCircle
} from 'lucide-react';

export const EnterpriseWorkforceSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fabric' | 'cognitive' | 'catalog' | 'security' | 'closedloop' | 'executive'>('fabric');
  const [activeConnector, setActiveConnector] = useState<'erp' | 'wms' | 'scada' | 'crm' | 'hris'>('erp');
  const [selectedAgentIndex, setSelectedAgentIndex] = useState<number>(0);

  const enterpriseConnectors = [
    {
      id: 'erp',
      name: 'SAP & Oracle NetSuite ERP',
      protocol: 'OData / RFC API / Webhook',
      dataType: 'Keuangan, Purchase Order, Master Vendor & Biaya Proyek',
      status: 'TERVERIFIKASI • 99.98% Uptime',
      latency: '18 ms',
      metrics: '142,000 Transaksi Terindeks / Hari',
      securityGuard: 'Row-Level Authorization & Enkripsi AES-256 GCM'
    },
    {
      id: 'wms',
      name: 'Manhattan & Odoo Warehouse (WMS)',
      protocol: 'REST API & Event Bus',
      dataType: 'Level Stok Fisik, Lokasi Bin Gudang, Barcode Scanner & Pengiriman',
      status: 'REAL-TIME STREAM • Zero Delay',
      latency: '24 ms',
      metrics: '8 Gudang Wilayah Tersinkronisasi',
      securityGuard: 'Otomatisasi Verifikasi Selisih Stok Fisik vs Jurnal'
    },
    {
      id: 'scada',
      name: 'SCADA & Industrial IoT Telemetry',
      protocol: 'MQTT / OPC-UA / Modbus',
      dataType: 'Sensor Getaran Mesin, Suhu Operasional, Jam Kerja Unit & Fuel Fleet',
      status: 'STREAM AKTIF • 1.2k Sensor',
      latency: '8 ms',
      metrics: 'Early Warning Predictive Maintenance',
      securityGuard: 'Pemisahan Jaringan OT-IT dengan Read-Only Bridge'
    },
    {
      id: 'crm',
      name: 'Salesforce & Enterprise HubSpot',
      protocol: 'GraphQL & Webhooks',
      dataType: 'Pipeline Prospek B2B, Kontrak Enterprise, Deal Stage & Riwayat Nego',
      status: 'TERKONEKSI • 2-Way Sync',
      latency: '35 ms',
      metrics: '4,200 Akun Pelanggan Korporasi',
      securityGuard: 'PDP Policy Decision Point Validasi Wewenang Akses'
    },
    {
      id: 'hris',
      name: 'Workday & Talenta HRIS',
      protocol: 'Secure OAuth 2.0 API',
      dataType: 'Struktur Organisasi, Jabatan Resmi, Jadwal Shift & Sertifikasi Teknis',
      status: 'SINKRON • Tiap 15 Menit',
      latency: '40 ms',
      metrics: '1,850 Karyawan Aktif Terpetakan',
      securityGuard: 'Privasi Data Pribadi UU PDP 2024 Compliance'
    }
  ];

  const currentConnector = enterpriseConnectors.find((c) => c.id === activeConnector) || enterpriseConnectors[0];

  const cognitiveStages = [
    { num: '01', stage: 'Observe', desc: 'Menangkap sinyal multi-sistem dari ERP, log IoT mesin, dan pesan WhatsApp staf' },
    { num: '02', stage: 'Understand', desc: 'Normalisasi teks dan parameter operasional ke dalam ontologi bisnis perusahaan' },
    { num: '03', stage: 'Correlate', desc: 'Menghubungkan anomali getaran mesin dengan jadwal pengiriman barang dan stok cadangan' },
    { num: '04', stage: 'Research', desc: 'Mencari dokumen SOP resmi, garansi vendor, dan kontrak kerja sama di Company Brain' },
    { num: '05', stage: 'Analyze', desc: 'Menghitung potensi dampak kerugian finansial, keterlambatan SLA, dan alokasi budget' },
    { num: '06', stage: 'Detect', desc: 'Mengidentifikasi akar penyebab masalah secara presisi menggunakan analisis kausalitas' },
    { num: '07', stage: 'Predict', desc: 'Mensimulasikan skenario masa depan jika tidak segera diambil tindakan korektif' },
    { num: '08', stage: 'Recommend', desc: 'Menyusun opsi keputusan terbaik lengkap dengan estimasi biaya dan waktu penyelesaian' },
    { num: '09', stage: 'Orchestrate', desc: 'Mendelegasikan tugas teknis kepada staf AI spesialis dan staf departemen manusia' },
    { num: '10', stage: 'Execute', desc: 'Mengeksekusi tindakan otomatis atau memicu gerbang persetujuan 1-klik pimpinan' }
  ];

  const aiAgentRoles = [
    {
      title: 'AI Chief of Staff',
      stars: '5-Star Top Coordinator',
      duty: 'Dekomposisi target pimpinan, orkestrasi 14 staf AI, dan briefing eksekutif',
      tools: ['Cross-System DAG', 'Executive Cockpit', 'Company Brain RAG', 'WhatsApp Gateway'],
      output: 'Executive Daily Briefing & Alert Eskalasi'
    },
    {
      title: 'AI Company Intelligence',
      stars: 'Central Knowledge Master',
      duty: 'Indeks dokumen SOP, regulasi keselamatan kerja, dan profil korporasi terenkripsi',
      tools: ['Vector Database', 'Semantic RAG', 'Document Classifier'],
      output: 'Konteks Tunggal Tanpa Halusinasi'
    },
    {
      title: 'AI Operations & Fleet',
      stars: 'Operations Orchestrator',
      duty: 'Monitoring logistik gudang, utilisasi armada truk, dan kepatuhan alur kerja',
      tools: ['WMS API', 'GPS Telematics', 'Route Optimizer'],
      output: 'Optimasi Utilisasi Armada & Logistik'
    },
    {
      title: 'AI Finance & Cash Flow',
      stars: 'Financial Modeler',
      duty: 'Rekonsiliasi mutasi bank, audit kepatuhan invoice, dan prediksi arus kas 6 bulan',
      tools: ['Accurate', 'BCA/Mandiri API', 'Jurnal Ledger'],
      output: 'Rekonsiliasi Kas 500+ Invoice per Menit'
    },
    {
      title: 'AI Procurement & Vendor',
      stars: 'Supply Chain Specialist',
      duty: 'Perbandingan komparasi penawaran vendor, verifikasi dokumen legalitas, dan PO',
      tools: ['ERP SAP', 'Vendor Portal', 'Price Indexer'],
      output: 'Evaluasi Hemat Biaya Pengadaan & Draf PO'
    },
    {
      title: 'AI Sales & Deal Closer',
      stars: 'Revenue Specialist',
      duty: 'Kualifikasi prospek masuk B2B, penerbitan draf kontrak resmi, dan follow-up deal',
      tools: ['WhatsApp API', 'HubSpot CRM', 'PDF Quotation Engine'],
      output: 'Kualifikasi Prospek BANT dalam 3 Detik'
    },
    {
      title: 'AI HR & People Ops',
      stars: 'Talent & Compliance',
      duty: 'Screening CV kandidat berbasis rubrik objektif, tracking absensi, dan FAQ SOP',
      tools: ['Talent ATS', 'Attendance Vault', 'Employee WA Portal'],
      output: 'Penyaringan Kandidat & Monitoring Tim'
    },
    {
      title: 'AI Customer Success',
      stars: 'Retention & SLA Sentinel',
      duty: 'Monitoring tiket kendala, mitigasi churn pelanggan korporasi, dan resolusi komplain',
      tools: ['Zendesk API', 'WhatsApp Support', 'Ticket Router'],
      output: 'Respon Masalah Kritis di Bawah 1 Menit'
    },
    {
      title: 'AI Project & Milestones',
      stars: 'Project Governance',
      duty: 'Pelacak milestone proyek, deteksi keterlambatan subkontraktor, dan mitigasi risiko',
      tools: ['Microsoft Project API', 'Jira', 'Trello API'],
      output: 'Early Warning Keterlambatan Proyek'
    },
    {
      title: 'AI Marketing & Branding',
      stars: 'Creative Specialist',
      duty: 'Penyusunan naskah konten promosi, audit kepatuhan brand kit, dan sebaran media',
      tools: ['Brand Kit Vault', 'Meta API', 'Content Scheduler'],
      output: 'Penerbitan Konten Terjadwal Multi-Platform'
    },
    {
      title: 'AI CRM & Customer Success',
      stars: 'Lifecycle Specialist',
      duty: 'Segmentasi pelanggan, prediksi repeat order, dan penjadwalan re-engagement',
      tools: ['CRM Database', 'LTV Calculator', 'Email Gateway'],
      output: 'Peningkatan Retensi & Nilai Transaksi'
    },
    {
      title: 'AI Task & Workflow',
      stars: 'SLA Sentinel',
      duty: 'Delegasi tiket pekerjaan, pengingat deadline otomatis, dan pelaporan bottleneck',
      tools: ['Kanban Engine', 'Notification Bus', 'Escalation Timer'],
      output: 'Nol Tiket Pekerjaan Terbengkalai'
    },
    {
      title: 'AI Knowledge & Document',
      stars: 'Document Archiver',
      duty: 'Ekstraksi dokumen faktur scan, klasifikasi arsip legalitas, dan pencarian cepat',
      tools: ['OCR Vision API', 'Document Vault', 'Audit Log'],
      output: 'Pencarian Dokumen Kontrak Instan'
    },
    {
      title: 'AI Research & Intelligence',
      stars: 'Market Strategist',
      duty: 'Riset regulasi industri baru, pergerakan kompetitor, dan komparasi pasar',
      tools: ['Web Intelligence API', 'Market Reports', 'Summarizer'],
      output: 'Briefing Tren Bisnis & Regulasi Baru'
    },
    {
      title: 'AI Reporting & BI Analyst',
      stars: 'Analytics Specialist',
      duty: 'Sintesis metrik lintas departemen menjadi ringkasan grafik untuk jajaran direksi',
      tools: ['BigQuery', 'Looker Studio', 'Executive KPI Engine'],
      output: 'Dashboard Kinerja Harian Real-Time'
    }
  ];

  return (
    <section id="enterprise-workforce" className="py-24 bg-gradient-to-b from-[#071226] via-[#0A1835] to-[#071226] text-white border-t border-white/10 relative overflow-hidden">
      {/* Visual Accent Glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#1976E8]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 left-0 w-[400px] h-[400px] bg-[#08B85C]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header without trailing periods */}
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#16B7D9]/30 text-xs font-semibold text-[#16B7D9] mb-4">
            <Building2 className="w-3.5 h-3.5" />
            <span>ENTERPRISE WORKFORCE OPERATING SYSTEM</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Sistem Operasi Workforce Terpadu untuk Skala Korporasi
          </h2>

          <p className="mt-4 text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed max-w-3xl mx-auto">
            Arsitektur kognitif 10 tahap yang mengintegrasikan ERP, CRM, WMS, SCADA/IoT, dan basis data perusahaan ke dalam orkestrasi staf manusia dan 15 jabatan staf AI terstandarisasi
          </p>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2 border-b border-white/10 pb-4">
          <button
            onClick={() => setActiveTab('fabric')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'fabric'
                ? 'bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>Integration Fabric & Connectors</span>
          </button>

          <button
            onClick={() => setActiveTab('cognitive')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'cognitive'
                ? 'bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>10-Stage Cognitive Loop</span>
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'catalog'
                ? 'bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>15 Standardized AI Job Titles</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'security'
                ? 'bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>ABAC Security & Data Quality</span>
          </button>

          <button
            onClick={() => setActiveTab('closedloop')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'closedloop'
                ? 'bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Workflow className="w-4 h-4" />
            <span>Closed-Loop & Continuous Learning</span>
          </button>

          <button
            onClick={() => setActiveTab('executive')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'executive'
                ? 'bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white shadow-lg'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Executive Conversational Query</span>
          </button>
        </div>

        {/* Tab 1: Integration Fabric & Connectors */}
        {activeTab === 'fabric' && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Connectors Selector */}
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#16B7D9] mb-2">
                Konektor Terverifikasi Sistem Korporasi
              </h3>

              {enterpriseConnectors.map((c) => {
                const isSelected = activeConnector === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveConnector(c.id as any)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-white/10 border-[#16B7D9] shadow-lg shadow-[#16B7D9]/20'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-white">{c.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{c.protocol}</div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-cyan-300">
                      {c.latency}
                    </span>
                  </button>
                );
              })}

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-slate-300 space-y-2">
                <div className="flex items-center space-x-2 text-white font-semibold">
                  <Lock className="w-4 h-4 text-[#08B85C]" />
                  <span>3 Mode Aliran Data Fleksibel</span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Mendukung Real-time Event Streaming (Webhook/Kafka), Near-Real-time Scheduled Sync (Polling terencana), dan Batch Ingestion berkala untuk laporan historis volume besar
                </p>
              </div>
            </div>

            {/* Right Active Connector Detail Card */}
            <div className="lg:col-span-7 rounded-3xl bg-[#0B1835] border border-white/15 p-6 sm:p-8 shadow-2xl space-y-5">
              <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/10 gap-2">
                <div>
                  <span className="text-xs font-mono uppercase text-[#16B7D9] font-bold">Konektor Aktif</span>
                  <h4 className="text-xl font-bold text-white">{currentConnector.name}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{currentConnector.protocol}</p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold">
                  {currentConnector.status}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Cakupan Objek Data:</span>
                  <p className="text-white font-medium">{currentConnector.dataType}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                    <span className="text-slate-400 text-[10px] uppercase">Rata-rata Latensi</span>
                    <p className="text-base font-bold text-white font-mono mt-0.5">{currentConnector.latency}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                    <span className="text-slate-400 text-[10px] uppercase">Throughput Harian</span>
                    <p className="text-base font-bold text-[#08B85C] font-mono mt-0.5">{currentConnector.metrics}</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 flex items-start space-x-2.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-xs font-bold text-white">Guardrail & Kebijakan Keamanan:</strong>
                    <span className="text-xs text-cyan-300">{currentConnector.securityGuard}</span>
                  </div>
                </div>
              </div>

              {/* Zero-Copy Security Assurance */}
              <div className="pt-2 text-xs text-slate-400 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#08B85C]" />
                <span>Zero-Data Retention Policy untuk kredensial otorisasi sistem luar</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: 10-Stage Cognitive Loop */}
        {activeTab === 'cognitive' && (
          <div className="mt-10 space-y-8">
            <div className="text-center max-w-3xl mx-auto">
              <h3 className="text-2xl font-bold text-white">
                Arsitektur Kognitif 10 Tahap Tanpa Tebak-tebakan
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300">
                Setiap kesimpulan dan delegasi tugas melewati proses penalaran sistematis bertahap untuk menjamin kepatuhan terhadap SOP dan keakuratan data
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {cognitiveStages.map((st, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#16B7D9]/50 transition-all space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-black text-[#16B7D9]">{st.num}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-white">STAGE</span>
                  </div>
                  <h4 className="text-sm font-bold text-white group-hover:text-[#16B7D9] transition-colors">
                    {st.stage}
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {st.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Cross-System Correlator Scenario Box */}
            <div className="p-6 sm:p-8 rounded-3xl bg-[#0B1835] border border-white/15 shadow-2xl space-y-4">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <GitBranch className="w-4 h-4 text-[#08B85C]" />
                <span>Studi Kasus Korelasi Sinyal Lintas Sistem (Cross-System Correlator)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1.5">
                  <span className="text-amber-400 font-bold uppercase text-[10px]">Sinyal 1: SCADA IoT</span>
                  <h5 className="font-bold text-white">Anomali Getaran Mesin Turbin</h5>
                  <p className="text-slate-400">Sensor mendeteksi suhu melebihi ambang 82°C pada jalur produksi Pabrik 2</p>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1.5">
                  <span className="text-cyan-400 font-bold uppercase text-[10px]">Sinyal 2: ERP SAP</span>
                  <h5 className="font-bold text-white">Jadwal Pengiriman Batch 500k</h5>
                  <p className="text-slate-400">Target muat kontainer ekspor dijadwalkan besok sore pukul 16.00 WIB</p>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1.5">
                  <span className="text-emerald-400 font-bold uppercase text-[10px]">Sinyal 3: WMS Odoo</span>
                  <h5 className="font-bold text-white">Ketersediaan Suku Cadang Bearing</h5>
                  <p className="text-slate-400">Tersedia 4 unit bearing cadangan resmi di Gudang Maintenance Barat</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border border-emerald-500/40 text-xs text-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-[#08B85C] shrink-0" />
                  <span><strong>Tindakan AI Chief of Staff:</strong> Otomatis alihkan 40% beban kerja ke Jalur 1, pesan jadwal ganti bearing teknisi pkl 22.00 malam, dan kirimkan draf konfirmasi ke Kepala Pabrik via WA</span>
                </div>
                <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-bold shrink-0">
                  Resiko Keterlambatan Turun 95%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: 15 Standardized AI Job Titles */}
        {activeTab === 'catalog' && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Agent List */}
            <div className="lg:col-span-5 space-y-2.5 max-h-[520px] overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#08B85C] mb-1">
                Katalog 15 Jabatan Staf AI Terstandarisasi
              </h3>

              {aiAgentRoles.map((agent, idx) => {
                const isSelected = selectedAgentIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedAgentIndex(idx)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-white/10 border-[#08B85C] shadow-lg shadow-[#08B85C]/20'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-white flex items-center space-x-2">
                        <span>{agent.title}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{agent.stars}</div>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-[#08B85C]' : 'text-slate-600'}`} />
                  </button>
                );
              })}
            </div>

            {/* Right Selected Agent Spec Profile */}
            <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-[#0B1835] border border-white/15 shadow-2xl space-y-5">
              <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/10 gap-2">
                <div>
                  <span className="text-xs font-mono uppercase text-[#08B85C] font-semibold">Standardized Title</span>
                  <h4 className="text-xl sm:text-2xl font-bold text-white">{aiAgentRoles[selectedAgentIndex].title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{aiAgentRoles[selectedAgentIndex].stars}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#08B85C]/15 border border-[#08B85C]/30 text-[#08B85C] text-xs font-bold font-mono">
                  ENTERPRISE READY
                </span>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold block mb-1">
                    Jobdesk & Tanggung Jawab Utama:
                  </span>
                  <p className="text-slate-200 text-sm leading-relaxed">
                    {aiAgentRoles[selectedAgentIndex].duty}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold block mb-2">
                    Konektor Tools & Sistem yang Digunakan:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {aiAgentRoles[selectedAgentIndex].tools.map((tool, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-xs flex items-center space-x-1.5"
                      >
                        <Check className="w-3.5 h-3.5 text-[#08B85C]" />
                        <span>{tool}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Deliverable Output Kerja Nyata:</span>
                  <p className="text-white font-semibold text-xs">{aiAgentRoles[selectedAgentIndex].output}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                <span>Evaluasi Kinerja:</span>
                <span className="text-[#08B85C] font-mono font-bold">Terhubung ke Objective Performance Score</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: ABAC Security & Data Quality */}
        {activeTab === 'security' && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/15 text-[#08B85C] text-xs font-semibold">
                <FolderLock className="w-3.5 h-3.5" />
                <span>ATTRIBUTE-BASED ACCESS CONTROL (ABAC)</span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Model AI Hanya Melihat Data yang Diizinkan oleh Jabatan Manusia
              </h3>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Prinsip Default-Deny: Jika staf penjualan meminta analisis gaji manajemen, AI menolak karena atribut otorisasi tidak mencakup data payroll. Tidak ada celah data bocor antar divisi
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                  <strong className="text-white block text-sm">5 Status Ketersediaan Data Lintas Sistem</strong>
                  <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">Available</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">Delayed</span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">Incomplete</span>
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">Conflicting</span>
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">No Permission</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                  <strong className="text-white block text-sm">Deteksi Selisih & Kualitas Data Otomatis</strong>
                  <span className="text-slate-400">
                    Bila angka penerimaan gudang WMS berbeda dengan PO di SAP, AI langsung memunculkan peringatan diskrepansi sebelum jurnal dicatat permanen
                  </span>
                </div>
              </div>
            </div>

            {/* ABAC Architecture Diagram */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-[#0B1835] border border-white/15 shadow-2xl space-y-4">
              <h4 className="text-sm font-bold text-white pb-3 border-b border-white/10 flex items-center justify-between">
                <span>Alur Policy Decision Point (PDP)</span>
                <span className="text-xs text-emerald-400 font-mono">Enforced Zero-Trust</span>
              </h4>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">1. Request Pengguna</div>
                    <div className="text-white font-medium">Staf Sales meminta simulasi diskon 25%</div>
                  </div>
                  <span className="text-cyan-300 font-mono text-[11px]">User Query</span>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold">2. Policy Decision Point</div>
                    <div className="text-white font-medium">Validasi: Batas diskon Sales Rep maksimal 10%</div>
                  </div>
                  <span className="text-amber-400 font-mono text-[11px]">SOP Check</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200">
                  <div className="text-[10px] uppercase font-bold text-amber-300 mb-0.5">3. Tindakan Terpimpin</div>
                  <div className="font-medium text-xs text-white">
                    AI otomatis menahan eksekusi dan memicu notifikasi persetujuan ke Direktur Penjualan via WhatsApp
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Closed-Loop Workforce & Continuous Learning */}
        {activeTab === 'closedloop' && (
          <div className="mt-10 space-y-8">
            <div className="text-center max-w-3xl mx-auto">
              <h3 className="text-2xl font-bold text-white">
                Alur Kerja Tertutup dari Deteksi hingga Verifikasi Sumber Nyata
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-300">
                Pekerjaan tidak dianggap selesai hanya karena tombol diklik. Sistem memverifikasi langsung perubahan data di database sumber untuk memastikan keaslian hasil kerja
              </p>
            </div>

            {/* 8-Step Closed Loop Flow Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-xs">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[#08B85C] font-mono font-bold text-[10px]">STEP 1</div>
                <div className="font-bold text-white text-[11px]">Deteksi</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[#08B85C] font-mono font-bold text-[10px]">STEP 2</div>
                <div className="font-bold text-white text-[11px]">Analisis</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[#08B85C] font-mono font-bold text-[10px]">STEP 3</div>
                <div className="font-bold text-white text-[11px]">Buat Tugas</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[#08B85C] font-mono font-bold text-[10px]">STEP 4</div>
                <div className="font-bold text-white text-[11px]">Delegasi</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[#08B85C] font-mono font-bold text-[10px]">STEP 5</div>
                <div className="font-bold text-white text-[11px]">Pantau SLA</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[#08B85C] font-mono font-bold text-[10px]">STEP 6</div>
                <div className="font-bold text-white text-[11px]">Follow-Up</div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 space-y-1">
                <div className="text-emerald-400 font-mono font-bold text-[10px]">STEP 7</div>
                <div className="font-bold text-white text-[11px]">Verifikasi Data</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[#08B85C] font-mono font-bold text-[10px]">STEP 8</div>
                <div className="font-bold text-white text-[11px]">Laporan</div>
              </div>
            </div>

            {/* Continuous Learning Mechanism Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-[#0B1835] border border-white/15 shadow-2xl space-y-4">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <Activity className="w-4 h-4 text-[#16B7D9]" />
                <span>Continuous Learning Tanpa Kebutuhan Fine-Tuning LLM yang Mahal</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Setiap kali pimpinan melakukan revisi pada draf surat penawaran atau laporan analitik, sistem mencatat koreksi tersebut ke dalam Vault Memori Episodik. Agen AI memperbarui skor keyakinan keterampilannya sehingga kesalahan yang sama tidak pernah berulang di masa mendatang
              </p>
            </div>
          </div>
        )}

        {/* Tab 6: Executive Conversational Query Cockpit */}
        {activeTab === 'executive' && (
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-semibold">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>EXECUTIVE CONVERSATIONAL INTELLIGENCE</span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Tanyakan Kondisi Perusahaan Layaknya Berbicara dengan Chief of Staff Senior
              </h3>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Direksi tidak perlu membuka 10 tab spreadsheet atau menunggu rekap mingguan. Cukup ajukan pertanyaan strategis via WhatsApp atau Dashboard, AI merangkum data real-time beserta rekomendasi keputusan
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center space-x-3">
                  <Eye className="w-5 h-5 text-[#08B85C] shrink-0" />
                  <div>
                    <strong className="text-white block">Panel Transparansi Penalaran (Explainability)</strong>
                    <span className="text-slate-400">Setiap jawaban menyertakan alasan "Mengapa AI menyarankan hal ini" dan sitasi dokumen SOP perusahaan terkait</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center space-x-3">
                  <BarChart3 className="w-5 h-5 text-[#16B7D9] shrink-0" />
                  <div>
                    <strong className="text-white block">Skor Keyakinan Matematis (Confidence Score)</strong>
                    <span className="text-slate-400">Tingkat kepastian analitik dihitung transparan (contoh: 98.4% Confidence) sebelum saran diajukan ke pimpinan</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Conversation Simulation Screen */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-[#0B1835] border border-white/15 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <Bot className="w-5 h-5 text-[#08B85C]" />
                  <span className="font-bold text-white text-sm">AI Chief of Staff Executive Channel</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  CONFIDENCE: 98.4%
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-white/10 text-slate-200 border border-white/10">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">CEO (Budi Santoso):</span>
                  <p>"Arya, bagaimana proyeksi arus kas perusahaan di akhir bulan depan jika pembayaran proyek Pertamina mundur 2 minggu?"</p>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border border-emerald-500/40 text-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Chief of Staff Response:</span>
                  </span>
                  <p className="leading-relaxed">
                    "Berdasarkan simulasi AI Finance Hendra pada 3 mutasi bank dan jadwal tagihan vendor di Accurate: Arus kas tetap positif sebesar Rp 412 juta, namun rasio likuiditas mendekati ambang batas minimum SOP. Rekomendasi: Tahan pembayaran PO non-kritis sebesar Rp 180 juta di minggu ke-3 atau aktifkan fasilitas diskon pelunasan cepat 2% untuk 4 invoice piutang distributor."
                  </p>
                  <div className="pt-2 border-t border-white/10 text-[10px] text-slate-400 flex items-center justify-between">
                    <span>Sitasi: SOP Kebijakan Kas PT-2024-CFO</span>
                    <span className="text-[#08B85C] font-semibold">1-Klik Eksekusi Tersedia</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
