import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Users2,
  Cpu,
  Layers,
  CheckCircle2,
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Zap,
  TrendingUp,
  GitBranch,
  Network as NetworkIcon,
  ListFilter,
  Share2,
  Workflow,
  X,
  MessageSquare,
  Bot,
  UserCheck,
  Building2,
  Database,
  Mail,
  Compass,
  Crown,
  FileCheck,
  BarChart3,
  Sparkles,
  Trophy,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  WORKFORCE_TREE_DATA,
  ALL_WORKFORCE_NODES,
  WorkforceTreeNode,
} from './workforceTreeData';

// Visual Universe Node positions mapped for the Reference Image Layout
interface UniverseNodeItem {
  id: string;
  name: string;
  sub: string;
  role: string;
  cluster: 'TOP_BLUE' | 'LEFT_GREEN' | 'RIGHT_PURPLE' | 'BOTTOM_AMBER';
  color: 'blue' | 'green' | 'purple' | 'amber';
  iconEmoji: string;
  x: number; // percentage in universe canvas
  y: number; // percentage in universe canvas
  partnerName: string;
  score: number;
  status: string;
  currentTask: string;
  tools: string[];
  responsibilities: string[];
  skills: string[];
}

const UNIVERSE_NODES: UniverseNodeItem[] = [
  // TOP BLUE CLUSTER (Strategy & Intelligence)
  {
    id: 'agent-strategist',
    name: 'AI STRATEGIST',
    sub: 'Strategi & Perencanaan',
    role: 'Market Expansion & Strategic Advisory',
    cluster: 'TOP_BLUE',
    color: 'blue',
    iconEmoji: '🤖',
    x: 50,
    y: 12,
    partnerName: 'Budi Santoso (CEO)',
    score: 98,
    status: 'ACTIVE',
    currentTask: 'Analisis peluang ekspansi pasar regional & proyeksi Q3',
    tools: ['Google Trends API', 'Statista', 'Company Brain', 'Executive Cockpit'],
    responsibilities: ['Penyusunan blueprint ekspansi', 'Analisis kompetitor berkala', 'Rekomendasi alokasi modal'],
    skills: ['Strategic Planning', 'Market Sizing', 'Competitor Intelligence', 'Scenario Modeling'],
  },
  {
    id: 'agent-researcher',
    name: 'AI RESEARCHER',
    sub: 'Riset & Analisis',
    role: 'Deep Intelligence & Industry Benchmarking',
    cluster: 'TOP_BLUE',
    color: 'blue',
    iconEmoji: '🤖',
    x: 27,
    y: 18,
    partnerName: 'Budi Santoso (CEO)',
    score: 97,
    status: 'ACTIVE',
    currentTask: 'Sintesis laporan benchmark industri fintech & e-commerce 2026',
    tools: ['Search Grounding', 'Perplexity Engine', 'Semantic Scholar'],
    responsibilities: ['Riset tren industri mikro & makro', 'Validasi data eksternal', 'Penyusunan digest riset'],
    skills: ['Deep Research', 'Synthesized Briefings', 'Data Verification', 'Patent & Trend Scouting'],
  },
  {
    id: 'agent-finance-analyst',
    name: 'AI FINANCE ANALYST',
    sub: 'Keuangan & Forecasting',
    role: 'Unit Economics & Cashflow Modeling',
    cluster: 'TOP_BLUE',
    color: 'blue',
    iconEmoji: '🤖',
    x: 73,
    y: 18,
    partnerName: 'Siti Rahma (Finance Manager)',
    score: 99,
    status: 'ACTIVE',
    currentTask: 'Rekonsiliasi 128 invoice otomatis & audit proyeksi runway 6 bulan',
    tools: ['BCA API', 'Accurate Online', 'Google Sheets', 'Invoice OCR'],
    responsibilities: ['Otomasi rekonsiliasi kas', 'Deteksi anomali pengeluaran', 'Kalkulasi margin kotor harian'],
    skills: ['Financial Forecasting', 'Burn Rate Monitoring', 'Tax Audit Guard', 'Multi-Currency Recon'],
  },

  // LEFT GREEN CLUSTER (Growth & Sales)
  {
    id: 'agent-cos-sub',
    name: 'AI CHIEF OF STAFF',
    sub: 'Eksekusi & Orkestrasi',
    role: 'Sub-Orchestration & Workflow Gate',
    cluster: 'LEFT_GREEN',
    color: 'blue',
    iconEmoji: '🤖',
    x: 21,
    y: 31,
    partnerName: 'Arya (Chief of Staff)',
    score: 99,
    status: 'ORCHESTRATING',
    currentTask: 'Monitoring eksekusi sprint mingguan lintas 6 departemen',
    tools: ['Trello REST', 'Slack Gateway', 'WhatsApp Router'],
    responsibilities: ['Sinkronisasi status tugas', 'Eskalasi blocker tugas', 'Distribusi beban kerja agent'],
    skills: ['Sprint Orchestration', 'Multi-Agent Routing', 'SLA Enforcer'],
  },
  {
    id: 'agent-sales-mgr',
    name: 'AI SALES MANAGER',
    sub: 'Penjualan & Pipeline',
    role: 'WhatsApp CRM & Deal Acceleration',
    cluster: 'LEFT_GREEN',
    color: 'green',
    iconEmoji: '🤖',
    x: 18,
    y: 45,
    partnerName: 'Doni Pratama (Senior AE)',
    score: 97,
    status: 'ACTIVE',
    currentTask: 'Kualifikasi 42 prospek masuk via WhatsApp & persiapan draft quotation',
    tools: ['WhatsApp Business API', 'HubSpot CRM', 'Google Sheets'],
    responsibilities: ['Respon instan 24/7 WhatsApp', 'Scoring prospek B2B', 'Draft penawaran harga personal'],
    skills: ['WhatsApp Conversational Sales', 'Objection Handling', 'Lead Scoring', 'Pipeline Nurturing'],
  },
  {
    id: 'agent-mkt-mgr',
    name: 'AI MARKETING MANAGER',
    sub: 'Marketing & Campaign',
    role: 'Omnichannel Campaign & Strategy Specialist',
    cluster: 'LEFT_GREEN',
    color: 'green',
    iconEmoji: '🎯',
    x: 17,
    y: 59,
    partnerName: 'Maya Wulandari (Marketing Director)',
    score: 98,
    status: 'ACTIVE',
    currentTask: 'Alokasi budget kampanye Omnichannel Q3 & kalkulasi target ROAS',
    tools: ['Meta Ads API', 'Google Analytics 4', 'Instagram Graph'],
    responsibilities: ['Penyusunan jadwal kampanye', 'Optimasi ROAS iklan', 'Pelaporan performa konversi'],
    skills: ['GTM Strategy', 'Funnel Analytics', 'Audience Segmentation', 'Omnichannel Scheduling'],
  },
  {
    id: 'agent-growth-analyst',
    name: 'AI GROWTH ANALYST',
    sub: 'Growth & Optimasi',
    role: 'Viral Loops & Conversion Rate Optimization',
    cluster: 'LEFT_GREEN',
    color: 'green',
    iconEmoji: '📈',
    x: 20,
    y: 73,
    partnerName: 'Maya Wulandari (Marketing Director)',
    score: 96,
    status: 'ACTIVE',
    currentTask: 'Eksperimen A/B testing headline landing page & optimasi funnel checkout',
    tools: ['Mixpanel', 'Hotjar API', 'PostHog Analytics'],
    responsibilities: ['Eksperimen pertumbuhan mingguan', 'Analisis cohort retensi', 'Optimasi funnel checkout'],
    skills: ['A/B Testing', 'Funnel Diagnostics', 'Retention Cohorts', 'Viral Coefficient Tracking'],
  },

  // RIGHT PURPLE CLUSTER (Content & Creative)
  {
    id: 'agent-knowledge-mgr',
    name: 'AI KNOWLEDGE MANAGER',
    sub: 'Memori & Dokumentasi',
    role: 'Enterprise Brain & SOP Governance',
    cluster: 'RIGHT_PURPLE',
    color: 'blue',
    iconEmoji: '🧠',
    x: 79,
    y: 31,
    partnerName: 'All Human & AI Teams',
    score: 99,
    status: 'ACTIVE',
    currentTask: 'Pembaruan indeks SOP operasional versi 3.4 di Company Brain Vault',
    tools: ['pgvector Storage', 'Semantic Embeddings', 'Docs Parser'],
    responsibilities: ['Indeksasi SOP & kebijakan', 'Menjawab query RAG internal', 'Pencegahan halusinasi data'],
    skills: ['Semantic Retrieval', 'Vector RAG Indexing', 'Versioned Memory', 'Zero-Data-Leak Guard'],
  },
  {
    id: 'agent-content-creator',
    name: 'AI CONTENT CREATOR',
    sub: 'Konten & Copywriting',
    role: 'High-Converting Copy & Script Specialist',
    cluster: 'RIGHT_PURPLE',
    color: 'purple',
    iconEmoji: '✍️',
    x: 82,
    y: 45,
    partnerName: 'Content Marketing Staff',
    score: 97,
    status: 'ACTIVE',
    currentTask: 'Menulis 12 caption Instagram storytelling & 3 naskah video TikTok promosi',
    tools: ['Google Docs', 'WordPress REST', 'Telegram Bot'],
    responsibilities: ['Penyusunan caption viral', 'Naskah video promosi produk', 'Email newsletter mingguan'],
    skills: ['Direct Response Copywriting', 'Storytelling Hooks', 'SEO Content Strategy', 'Indonesian Slang & Tone'],
  },
  {
    id: 'agent-social-mgr',
    name: 'AI SOCIAL MEDIA MANAGER',
    sub: 'Sosial Media & Komunitas',
    role: 'Multi-Channel Auto-Dispatch & Moderation',
    cluster: 'RIGHT_PURPLE',
    color: 'purple',
    iconEmoji: '📱',
    x: 83,
    y: 59,
    partnerName: 'Maya Wulandari (Marketing Director)',
    score: 98,
    status: 'AUTOPILOT',
    currentTask: 'Penerbitan otomatis konten Carousel pkl 19:00 WIB & filter spam komentar',
    tools: ['Instagram Graph', 'TikTok API', 'LinkedIn API', 'X / Twitter'],
    responsibilities: ['Penjadwalan multi-platform', 'Moderasi komentar otomatis', 'Monitoring viral spike'],
    skills: ['Optimal Time Dispatch', 'Hashtag Matrix', 'Sentiment Filtering', 'Community Engagement'],
  },
  {
    id: 'agent-designer',
    name: 'AI DESIGNER',
    sub: 'Desain Grafis & Visual',
    role: 'Brand Safe-Zone & Motion Asset Studio',
    cluster: 'RIGHT_PURPLE',
    color: 'purple',
    iconEmoji: '🎨',
    x: 80,
    y: 73,
    partnerName: 'Andi Pratama (Creative Lead)',
    score: 98,
    status: 'ACTIVE',
    currentTask: 'Render storyboard video 9:16 & verifikasi safe-zone palet #08B85C',
    tools: ['Creative Studio', 'Imagen 3', 'Google Veo 2', 'Brand Kit Engine'],
    responsibilities: ['Generasi aset visual kampanye', 'Pemeriksaan rasio kontras WCAG', 'Storyboard video vertikal'],
    skills: ['Visual Prompting', 'WCAG AAA Compliance', 'Motion Asset Gen', 'Safe-Zone Geometry'],
  },

  // BOTTOM AMBER CLUSTER (Operations, HR & Intelligence)
  {
    id: 'agent-hr-mgr',
    name: 'AI HR MANAGER',
    sub: 'Human Capital & Talent',
    role: 'Workforce Readiness & Candidate Screening',
    cluster: 'BOTTOM_AMBER',
    color: 'amber',
    iconEmoji: '👥',
    x: 34,
    y: 85,
    partnerName: 'Rina Kartika (HR Director)',
    score: 96,
    status: 'ACTIVE',
    currentTask: 'Screening 64 CV kandidat teknis & kalkulasi skor kesiapan staf',
    tools: ['Talent ATS', 'WhatsApp Gateway', 'Attendance Vault'],
    responsibilities: ['Penyaringan awal CV pelamar', 'FAQ SOP staf karyawan via WA', 'Monitoring indeks kesehatan kerja'],
    skills: ['Automated Screening', 'Workforce Sentiment', 'HR Policy RAG', 'Readiness Scoring'],
  },
  {
    id: 'agent-data-analyst',
    name: 'AI DATA ANALYST',
    sub: 'Data & Business Intelligence',
    role: 'Predictive BI & Real-time Metrics',
    cluster: 'BOTTOM_AMBER',
    color: 'amber',
    iconEmoji: '📊',
    x: 50,
    y: 91,
    partnerName: 'Executive Leadership',
    score: 99,
    status: 'ACTIVE',
    currentTask: 'Sintesis dashboard KPI eksekutif harian & deteksi anomali churn rate',
    tools: ['BigQuery', 'Postgres SQL', 'Google Looker Studio'],
    responsibilities: ['Penyusunan dashboard harian', 'Deteksi anomali metriks', 'Kueri data terenkripsi'],
    skills: ['SQL Automation', 'Anomaly Detection', 'Cohort Modeling', 'Executive KPI Reports'],
  },
  {
    id: 'agent-customer-success',
    name: 'AI CUSTOMER SUCCESS',
    sub: 'Kepuasan & Retensi',
    role: 'Escalation Guard & Proactive SLA Defense',
    cluster: 'BOTTOM_AMBER',
    color: 'amber',
    iconEmoji: '🛡️',
    x: 66,
    y: 85,
    partnerName: 'Customer Support Lead',
    score: 98,
    status: 'AUTOPILOT',
    currentTask: 'Monitoring 180 tiket keluhan & otomatisasi refund di bawah batas otorisasi',
    tools: ['Zendesk API', 'WhatsApp Support', 'Jurnal Billing'],
    responsibilities: ['Pencegahan churn pelanggan', 'Eskalasi tiket prioritas tinggi', 'Survei CSAT otomatis'],
    skills: ['Ticket Classification', 'CSAT Sentinel', 'Refund Guardrail', 'SLA Escalation'],
  },
];

export const WorkforceUniverseDiagram: React.FC = () => {
  const [viewMode, setViewMode] = useState<'UNIVERSE' | 'TREE' | 'LIST'>('UNIVERSE');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'AI' | 'HUMAN' | 'PARTNERS' | 'TOOLS'>('ALL');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-cos-arya');
  const [mobileZoomLevel, setMobileZoomLevel] = useState<number>(1); // 0.85, 1, 1.2
  const [activeClusterTab, setActiveClusterTab] = useState<'ALL' | 'TOP' | 'LEFT' | 'RIGHT' | 'BOTTOM'>('ALL');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['root-orchestree', 'node-cos-arya', 'pillar-ai-workforce', 'pillar-human-workforce', 'dept-ai-marketing', 'dept-human-marketing'])
  );

  // Selected Universe item details
  const activeUniverseNode = useMemo(() => {
    const fromUniverse = UNIVERSE_NODES.find((n) => n.id === selectedNodeId);
    if (fromUniverse) return fromUniverse;

    const fromTree = ALL_WORKFORCE_NODES.find((n) => n.id === selectedNodeId);
    if (fromTree) {
      return {
        id: fromTree.id,
        name: fromTree.name.toUpperCase(),
        sub: fromTree.title,
        role: fromTree.role,
        cluster: 'LEFT_GREEN' as const,
        color: fromTree.category === 'HUMAN' ? 'blue' as const : 'green' as const,
        iconEmoji: fromTree.avatarEmoji || '👤',
        x: 50,
        y: 50,
        partnerName: fromTree.partnerName || 'AI Chief of Staff (Arya)',
        score: fromTree.score || 98,
        status: fromTree.status,
        currentTask: fromTree.currentTask || fromTree.description || 'Aktif dalam orkestrasi tugas harian.',
        tools: fromTree.connectedTools || ['WhatsApp', 'Executive Dashboard'],
        responsibilities: fromTree.responsibilities || ['Kolaborasi harian', 'Approval tugas'],
        skills: fromTree.skills || ['Multi-Task Execution', 'Compliance'],
      };
    }

    // Default to Arya Chief of Staff
    return {
      id: 'node-cos-arya',
      name: 'AI CHIEF OF STAFF',
      sub: 'ARYA — Eksekusi & Orkestrasi Terpusat',
      role: 'Executive Intelligence & Multi-Agent Orchestration Hub',
      cluster: 'TOP_BLUE' as const,
      color: 'blue' as const,
      iconEmoji: '👑',
      x: 50,
      y: 50,
      partnerName: 'Budi Santoso (CEO / Founder)',
      score: 99,
      status: 'ORCHESTRATING',
      currentTask: 'Dekomposisi sasaran strategis, orkestrasi 16 AI agen spesialis, dan koordinasi persetujuan manusia',
      tools: ['WhatsApp Gateway', 'Executive Cockpit', 'Company Brain RAG', 'Model Router DAG', 'Trello / Slack API'],
      responsibilities: [
        'Memecah target bisnis menjadi rencana kerja terukur',
        'Mendelegasikan tugas ke AI Agent departemen terkait',
        'Menyusun executive briefing harian untuk pimpinan',
        'Meminta persetujuan manusia untuk aksi berisiko tinggi',
      ],
      skills: ['Goal Decomposition', 'Cross-Agent Delegation', 'Executive Reporting', 'Decision Tracking', 'SLA Governance'],
    };
  }, [selectedNodeId]);

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filtered nodes for Tree & List views
  const filteredNodes = useMemo(() => {
    return ALL_WORKFORCE_NODES.filter((node) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.skills && node.skills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))) ||
        (node.connectedTools && node.connectedTools.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));

      let matchesFilter = true;
      if (selectedFilter === 'AI') {
        matchesFilter = node.category === 'AI' || node.type === 'AI_AGENT';
      } else if (selectedFilter === 'HUMAN') {
        matchesFilter = node.category === 'HUMAN' || node.type === 'HUMAN_EMPLOYEE';
      } else if (selectedFilter === 'PARTNERS') {
        matchesFilter = !!node.partnerId;
      } else if (selectedFilter === 'TOOLS') {
        matchesFilter = node.category === 'ECOSYSTEM' || node.type === 'TOOL';
      }

      return matchesSearch && matchesFilter;
    });
  }, [searchQuery, selectedFilter]);

  // Styling helper for agent cards
  const getCardColorClasses = (color: string, isSelected: boolean) => {
    if (color === 'green') {
      return isSelected
        ? 'bg-[#08B85C]/20 border-[#08B85C] shadow-lg shadow-[#08B85C]/40 ring-2 ring-[#08B85C]/60 text-white'
        : 'bg-[#071F1A]/80 border-[#08B85C]/40 hover:border-[#08B85C] hover:bg-[#08B85C]/15 hover:shadow-md hover:shadow-[#08B85C]/20 text-slate-100';
    }
    if (color === 'purple') {
      return isSelected
        ? 'bg-[#7C3AED]/25 border-[#A855F7] shadow-lg shadow-[#7C3AED]/40 ring-2 ring-[#A855F7]/60 text-white'
        : 'bg-[#180E2B]/80 border-[#7C3AED]/40 hover:border-[#A855F7] hover:bg-[#7C3AED]/15 hover:shadow-md hover:shadow-[#7C3AED]/20 text-slate-100';
    }
    if (color === 'amber') {
      return isSelected
        ? 'bg-[#D97706]/25 border-[#F59E0B] shadow-lg shadow-[#D97706]/40 ring-2 ring-[#F59E0B]/60 text-white'
        : 'bg-[#221606]/80 border-[#F59E0B]/40 hover:border-[#F59E0B] hover:bg-[#D97706]/15 hover:shadow-md hover:shadow-[#D97706]/20 text-slate-100';
    }
    // blue (default)
    return isSelected
      ? 'bg-[#1976E8]/25 border-[#16B7D9] shadow-lg shadow-[#1976E8]/40 ring-2 ring-[#16B7D9]/60 text-white'
      : 'bg-[#0A1835]/80 border-[#1976E8]/40 hover:border-[#16B7D9] hover:bg-[#1976E8]/15 hover:shadow-md hover:shadow-[#1976E8]/20 text-slate-100';
  };

  const getSubBadgeColor = (color: string) => {
    if (color === 'green') return 'text-[#08B85C]';
    if (color === 'purple') return 'text-[#C084FC]';
    if (color === 'amber') return 'text-[#FBBF24]';
    return 'text-[#16B7D9]';
  };

  return (
    <section id="workforce-universe" className="py-20 bg-[#050B16] text-white border-t border-white/10 relative overflow-hidden selection:bg-[#08B85C]/30">
      {/* Background ambient lighting & neural grid dots */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-[#08B85C]/15 via-[#1976E8]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-[600px] h-[600px] bg-[#7C3AED]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* ==================== 1. SECTION HEADER (From Reference) ==================== */}
        <div className="text-center max-w-4xl mx-auto">
          {/* Luminous Title */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-[#E0F2FE] to-[#BAE6FD] tracking-tight uppercase drop-shadow-[0_0_25px_rgba(22,183,217,0.35)]">
            INTERACTIVE WORKFORCE UNIVERSE
          </h2>

          {/* Subtitle */}
          <p className="mt-2 text-xs sm:text-sm font-extrabold uppercase tracking-[0.25em] text-[#16B7D9] drop-shadow-sm">
            AI AGENT & HUMAN STAFF COLLABORATION ECOSYSTEM
          </p>

          {/* Center Brand Pill Badge */}
          <div className="mt-4 inline-flex items-center space-x-2.5 px-5 py-1.5 rounded-full bg-[#0A1835]/90 border border-[#16B7D9]/50 text-xs font-mono font-bold text-white shadow-lg shadow-[#16B7D9]/20 backdrop-blur-md">
            <span className="text-[#08B85C] font-black tracking-wider">ORCHESTREE.AI</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300 font-semibold tracking-wide">AI WORKFORCE OPERATING SYSTEM</span>
          </div>
        </div>

        {/* Top Control Bar: Legends & View Switcher */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-3 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
          {/* Legend Chips */}
          <div className="flex items-center space-x-4 text-xs font-semibold">
            <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#1976E8]/20 border border-[#1976E8]/40 text-[#16B7D9]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1976E8] shadow-[0_0_8px_#1976E8]" />
              <span>AI AGENT</span>
            </span>
            <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#08B85C]/20 border border-[#08B85C]/40 text-[#08B85C]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#08B85C] shadow-[0_0_8px_#08B85C]" />
              <span>HUMAN STAFF</span>
            </span>
            <span className="hidden md:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_#A855F7]" />
              <span>TOOLS & CHANNELS</span>
            </span>
          </div>

          {/* View Mode Controls */}
          <div className="flex items-center space-x-1 p-1 rounded-xl bg-black/40 border border-white/10 text-xs">
            <button
              onClick={() => setViewMode('UNIVERSE')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                viewMode === 'UNIVERSE'
                  ? 'bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white shadow-md shadow-[#08B85C]/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <NetworkIcon className="w-3.5 h-3.5" />
              <span>Ecosystem Universe</span>
            </button>
            <button
              onClick={() => setViewMode('TREE')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                viewMode === 'TREE'
                  ? 'bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white shadow-md shadow-[#08B85C]/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Pohon Hirarki</span>
            </button>
            <button
              onClick={() => setViewMode('LIST')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                viewMode === 'LIST'
                  ? 'bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white shadow-md shadow-[#08B85C]/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Daftar Lengkap</span>
            </button>
          </div>
        </div>

        {/* ==================== 2. MAIN INTERACTIVE VISUALIZER ==================== */}
        <div className="mt-6 rounded-3xl bg-[#071226]/90 border border-white/15 p-3 sm:p-6 lg:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          {/* VIEW MODE 1: UNIVERSE NEURAL ECOSYSTEM (Direct Match to User Reference, Full UI on Mobile & Desktop) */}
          {viewMode === 'UNIVERSE' && (
            <div className="flex flex-col items-center w-full">
              {/* Mobile / Tablet Quick Cluster Filter Pills */}
              <div className="w-full flex items-center justify-between gap-2 mb-3 sm:mb-4 overflow-x-auto pb-1 no-scrollbar">
                <div className="flex items-center space-x-1.5 shrink-0 text-[10px] sm:text-xs">
                  <span className="text-slate-400 font-mono text-[9px] uppercase hidden sm:inline mr-1">Fokus:</span>
                  {[
                    { id: 'ALL', label: 'Semua Klaster' },
                    { id: 'TOP', label: 'Strategi 🔵' },
                    { id: 'LEFT', label: 'Sales/Growth 🟢' },
                    { id: 'RIGHT', label: 'Kreatif 🟣' },
                    { id: 'BOTTOM', label: 'HR/Data 🟡' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveClusterTab(tab.id as any)}
                      className={`px-2.5 py-1 rounded-full border transition-all cursor-pointer font-bold shrink-0 ${
                        activeClusterTab === tab.id
                          ? 'bg-[#16B7D9]/20 border-[#16B7D9] text-[#16B7D9] shadow-sm shadow-[#16B7D9]/25'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Mobile Zoom Controls */}
                <div className="flex items-center space-x-1 shrink-0 bg-black/40 border border-white/10 rounded-xl p-0.5 text-[10px]">
                  <button
                    onClick={() => setMobileZoomLevel((prev) => Math.max(0.85, prev - 0.15))}
                    title="Zoom Out"
                    className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 flex items-center justify-center font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="px-1.5 font-mono text-slate-400 font-bold text-[9px]">
                    {Math.round(mobileZoomLevel * 100)}%
                  </span>
                  <button
                    onClick={() => setMobileZoomLevel((prev) => Math.min(1.3, prev + 0.15))}
                    title="Zoom In"
                    className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 flex items-center justify-center font-bold cursor-pointer"
                  >
                    +
                  </button>
                  {mobileZoomLevel !== 1 && (
                    <button
                      onClick={() => setMobileZoomLevel(1)}
                      className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] text-slate-300 hover:text-white cursor-pointer ml-0.5"
                    >
                      Fit
                    </button>
                  )}
                </div>
              </div>

              {/* Ecosystem Universe Interactive Canvas Wrapper (Scrollable on zoom, fully scalable on mobile) */}
              <div className="w-full overflow-x-auto overflow-y-hidden rounded-2xl bg-[#040A17]/90 border border-white/10 relative p-1 sm:p-2 no-scrollbar">
                <div
                  className="relative w-full aspect-[4/5] sm:aspect-[4/3] md:aspect-[16/10] min-w-[320px] max-w-full mx-auto flex items-center justify-center transition-transform duration-300 origin-center"
                  style={{
                    transform: `scale(${mobileZoomLevel})`,
                    minHeight: mobileZoomLevel > 1 ? '560px' : '440px',
                  }}
                >
                  {/* Background SVG Splines & Energy Roots (Scales with 100% width/height) */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      {/* Gradients for Glowing Energy Roots */}
                      <linearGradient id="root-blue" x1="50%" y1="50%" x2="50%" y2="15%">
                        <stop offset="0%" stopColor="#16B7D9" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#1976E8" stopOpacity="0.3" />
                      </linearGradient>
                      <linearGradient id="root-green" x1="50%" y1="50%" x2="20%" y2="55%">
                        <stop offset="0%" stopColor="#16B7D9" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#08B85C" stopOpacity="0.3" />
                      </linearGradient>
                      <linearGradient id="root-purple" x1="50%" y1="50%" x2="80%" y2="55%">
                        <stop offset="0%" stopColor="#16B7D9" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.3" />
                      </linearGradient>
                      <linearGradient id="root-amber" x1="50%" y1="50%" x2="50%" y2="85%">
                        <stop offset="0%" stopColor="#16B7D9" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.3" />
                      </linearGradient>
                    </defs>

                    {/* Concentric Ambient Energy Rings */}
                    <circle
                      cx="50%"
                      cy="50%"
                      r="18%"
                      fill="none"
                      stroke="#16B7D9"
                      strokeWidth="1"
                      strokeOpacity="0.18"
                      strokeDasharray="4 4"
                      className="animate-spin"
                      style={{ animationDuration: '60s' }}
                    />
                    <circle
                      cx="50%"
                      cy="50%"
                      r="32%"
                      fill="none"
                      stroke="#08B85C"
                      strokeWidth="1"
                      strokeOpacity="0.12"
                      strokeDasharray="6 6"
                      className="animate-spin"
                      style={{ animationDuration: '90s', animationDirection: 'reverse' }}
                    />
                    <circle cx="50%" cy="50%" r="42%" fill="none" stroke="#7C3AED" strokeWidth="1" strokeOpacity="0.08" />

                    {/* Energy Branches from Center (50%, 50%) to Node locations */}
                    {/* Top Cluster Lines */}
                    {(activeClusterTab === 'ALL' || activeClusterTab === 'TOP') && (
                      <>
                        <path d="M 50% 50% Q 38% 30% 26% 22%" fill="none" stroke="url(#root-blue)" strokeWidth="2" strokeDasharray="3 2" />
                        <path d="M 50% 50% Q 50% 25% 50% 16%" fill="none" stroke="url(#root-blue)" strokeWidth="2.5" />
                        <path d="M 50% 50% Q 62% 30% 74% 22%" fill="none" stroke="url(#root-blue)" strokeWidth="2" strokeDasharray="3 2" />
                      </>
                    )}

                    {/* Left Cluster Lines */}
                    {(activeClusterTab === 'ALL' || activeClusterTab === 'LEFT') && (
                      <>
                        <path d="M 50% 50% Q 32% 38% 18% 33%" fill="none" stroke="url(#root-green)" strokeWidth="2" />
                        <path d="M 50% 50% Q 28% 46% 15% 46%" fill="none" stroke="url(#root-green)" strokeWidth="2.5" />
                        <path d="M 50% 50% Q 28% 57% 15% 61%" fill="none" stroke="url(#root-green)" strokeWidth="2.5" />
                        <path d="M 50% 50% Q 32% 67% 19% 75%" fill="none" stroke="url(#root-green)" strokeWidth="2" />
                      </>
                    )}

                    {/* Right Cluster Lines */}
                    {(activeClusterTab === 'ALL' || activeClusterTab === 'RIGHT') && (
                      <>
                        <path d="M 50% 50% Q 68% 38% 82% 33%" fill="none" stroke="url(#root-purple)" strokeWidth="2" />
                        <path d="M 50% 50% Q 72% 46% 85% 46%" fill="none" stroke="url(#root-purple)" strokeWidth="2.5" />
                        <path d="M 50% 50% Q 72% 57% 85% 61%" fill="none" stroke="url(#root-purple)" strokeWidth="2.5" />
                        <path d="M 50% 50% Q 68% 67% 81% 75%" fill="none" stroke="url(#root-purple)" strokeWidth="2" />
                      </>
                    )}

                    {/* Bottom Cluster Lines */}
                    {(activeClusterTab === 'ALL' || activeClusterTab === 'BOTTOM') && (
                      <>
                        <path d="M 50% 50% Q 40% 70% 30% 86%" fill="none" stroke="url(#root-amber)" strokeWidth="2" />
                        <path d="M 50% 50% Q 50% 72% 50% 92%" fill="none" stroke="url(#root-amber)" strokeWidth="2.5" />
                        <path d="M 50% 50% Q 60% 70% 70% 86%" fill="none" stroke="url(#root-amber)" strokeWidth="2" />
                      </>
                    )}
                  </svg>

                  {/* CENTER HUB: AI CHIEF OF STAFF — ARYA */}
                  <div
                    onClick={() => setSelectedNodeId('node-cos-arya')}
                    className="relative z-20 cursor-pointer group flex flex-col items-center justify-center transition-all duration-300"
                  >
                    {/* Outer Glowing Energy Rings */}
                    <div className="absolute w-24 h-24 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full bg-gradient-to-r from-[#08B85C]/25 via-[#16B7D9]/35 to-[#7C3AED]/25 blur-lg sm:blur-xl animate-pulse" />
                    <div
                      className="absolute w-20 h-20 sm:w-30 sm:h-30 md:w-36 md:h-36 rounded-full border border-[#16B7D9]/40 animate-ping opacity-25"
                      style={{ animationDuration: '3s' }}
                    />

                    {/* Center Core Circle with Glowing Tree Emblem */}
                    <div
                      className={`relative w-20 h-20 sm:w-26 sm:h-26 md:w-32 md:h-32 rounded-full bg-gradient-to-b from-[#0A1835] to-[#050B16] border-2 flex flex-col items-center justify-center p-1.5 sm:p-2.5 md:p-3 text-center shadow-2xl transition-transform duration-300 ${
                        selectedNodeId === 'node-cos-arya'
                          ? 'border-[#16B7D9] shadow-[0_0_35px_#16B7D9] scale-105 sm:scale-110 ring-2 sm:ring-4 ring-[#16B7D9]/30'
                          : 'border-[#16B7D9]/60 hover:scale-105 hover:border-[#16B7D9] shadow-[0_0_20px_rgba(22,183,217,0.3)]'
                      }`}
                    >
                      {/* Orchestree Glowing Tree Icon */}
                      <img
                        src="/logoorchestreeweb.png"
                        alt="OrchestreeAI Chief of Staff"
                        className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded-lg object-contain filter drop-shadow-[0_0_12px_#16B7D9] animate-pulse"
                        referrerPolicy="no-referrer"
                      />
                      <h3 className="font-extrabold text-[8px] sm:text-[9.5px] md:text-[11px] uppercase tracking-wider text-white mt-0.5 sm:mt-1 leading-none">
                        AI CHIEF OF STAFF
                      </h3>
                      <span className="text-[7px] sm:text-[8.5px] md:text-[10px] font-black text-[#16B7D9] tracking-widest uppercase mt-0.5 leading-none">
                        ARYA
                      </span>
                    </div>
                  </div>

                  {/* Node Cards Positioned in Relative Orbital Coordinates (Visible on BOTH Mobile & Desktop) */}
                  <div className="absolute inset-0 pointer-events-none">
                    {UNIVERSE_NODES.map((node) => {
                      const isSelected = selectedNodeId === node.id;
                      const isDimmed =
                        activeClusterTab !== 'ALL' &&
                        ((activeClusterTab === 'TOP' && node.cluster !== 'TOP_BLUE') ||
                          (activeClusterTab === 'LEFT' && node.cluster !== 'LEFT_GREEN') ||
                          (activeClusterTab === 'RIGHT' && node.cluster !== 'RIGHT_PURPLE') ||
                          (activeClusterTab === 'BOTTOM' && node.cluster !== 'BOTTOM_AMBER'));

                      return (
                        <div
                          key={node.id}
                          style={{
                            left: `${node.x}%`,
                            top: `${node.y}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                          onClick={() => setSelectedNodeId(node.id)}
                          className={`absolute pointer-events-auto cursor-pointer transition-all duration-300 ${
                            isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-10'
                          } ${isDimmed ? 'opacity-25 grayscale' : 'opacity-100'}`}
                        >
                          <div
                            className={`px-1.5 sm:px-2.5 md:px-3.5 py-1 sm:py-1.5 md:py-2 rounded-xl sm:rounded-2xl border backdrop-blur-md flex items-center space-x-1.5 sm:space-x-2 md:space-x-2.5 shadow-lg sm:shadow-xl transition-all ${getCardColorClasses(
                              node.color,
                              isSelected
                            )}`}
                          >
                            {/* Node Avatar Icon */}
                            <div className="w-5 h-5 sm:w-6.5 sm:h-6.5 md:w-8 md:h-8 rounded-lg sm:rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-[10px] sm:text-xs md:text-sm shadow-inner shrink-0">
                              {node.iconEmoji}
                            </div>

                            {/* Title & Subtitle */}
                            <div className="text-left whitespace-nowrap">
                              <h4 className="text-[7.5px] sm:text-[9px] md:text-[11px] font-black tracking-wide uppercase leading-tight">
                                {node.name}
                              </h4>
                              <p className={`text-[6.5px] sm:text-[7.5px] md:text-[9px] font-semibold leading-tight ${getSubBadgeColor(node.color)}`}>
                                {node.sub}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Mobile Quick-Tap Agent Carousel (Allows seamless swiping & instant node focus on mobile phones) */}
              <div className="w-full mt-3 flex items-center space-x-2 overflow-x-auto pb-1 pt-1 sm:hidden no-scrollbar">
                <span className="text-[9px] font-mono uppercase text-slate-500 shrink-0">Pilih Agen:</span>
                <button
                  onClick={() => setSelectedNodeId('node-cos-arya')}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border shrink-0 transition-all ${
                    selectedNodeId === 'node-cos-arya'
                      ? 'bg-[#16B7D9]/20 border-[#16B7D9] text-white shadow-sm shadow-[#16B7D9]/30'
                      : 'bg-white/5 border-white/10 text-slate-300'
                  }`}
                >
                  🌳 ARYA (Chief of Staff)
                </button>
                {UNIVERSE_NODES.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border shrink-0 transition-all ${
                      selectedNodeId === node.id
                        ? 'bg-[#08B85C]/20 border-[#08B85C] text-white shadow-sm shadow-[#08B85C]/30'
                        : 'bg-white/5 border-white/10 text-slate-300'
                    }`}
                  >
                    {node.iconEmoji} {node.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* VIEW MODE 2: TREE HIERARCHY */}
          {viewMode === 'TREE' && (
            <div className="space-y-4 pt-2">
              <div className="text-xs text-slate-400 border-b border-white/10 pb-3 flex items-center justify-between">
                <span>Struktur hirarki pohon organisasi OrchestreeAI</span>
                <span className="text-[10px] text-slate-500 font-mono">Klik cabang untuk eksplorasi</span>
              </div>
              <div className="pl-2">
                <SimpleTreeRenderer
                  node={WORKFORCE_TREE_DATA}
                  selectedId={selectedNodeId}
                  expandedNodes={expandedNodes}
                  onSelectNode={(n) => setSelectedNodeId(n.id)}
                  onToggleExpand={toggleExpand}
                />
              </div>
            </div>
          )}

          {/* VIEW MODE 3: LIST FILTER */}
          {viewMode === 'LIST' && (
            <div className="space-y-3 pt-2 max-h-[500px] overflow-y-auto pr-2">
              <div className="text-xs text-slate-400">
                Menampilkan {filteredNodes.length} entitas tenaga kerja dalam sistem
              </div>
              {filteredNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-[#08B85C] bg-[#08B85C]/15 ring-2 ring-[#08B85C]/30 text-white'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/5 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <span className="text-xl">{node.avatarEmoji || '👤'}</span>
                      <div className="truncate text-left">
                        <div className="text-xs font-bold text-white truncate">{node.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">{node.title || node.role}</div>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-white/10 uppercase shrink-0">
                      {node.type}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ==================== 3. FLOATING / IN-VIEW DETAIL INSPECTOR MODAL ==================== */}
          {activeUniverseNode && (
            <div className="mt-8 p-5 rounded-3xl bg-[#0A1835]/95 border border-[#16B7D9]/40 shadow-2xl backdrop-blur-xl transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl shadow-inner">
                    {activeUniverseNode.iconEmoji}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                        {activeUniverseNode.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-[#08B85C]/20 border border-[#08B85C]/40 text-[10px] font-mono font-bold text-[#08B85C]">
                        {activeUniverseNode.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#16B7D9] font-medium">{activeUniverseNode.role}</p>
                  </div>
                </div>

                {/* Partner Mapping Badge */}
                <div className="flex items-center space-x-3 bg-black/40 px-3.5 py-2 rounded-2xl border border-white/10">
                  <Share2 className="w-4 h-4 text-[#08B85C]" />
                  <div className="text-left">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Partner Staf Manusia</span>
                    <span className="text-xs font-bold text-white">{activeUniverseNode.partnerName}</span>
                  </div>
                </div>
              </div>

              {/* Task & Responsibilities Breakdown */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                {/* Active Task */}
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#16B7D9]" />
                    <span>Tugas Aktif Saat Ini</span>
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed">{activeUniverseNode.currentTask}</p>
                </div>

                {/* Responsibilities */}
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#08B85C]" />
                    <span>Tanggung Jawab Operasional</span>
                  </span>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {activeUniverseNode.responsibilities.map((r, i) => (
                      <li key={i} className="truncate">• {r}</li>
                    ))}
                  </ul>
                </div>

                {/* Connected Tools & Channels */}
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center space-x-1.5">
                    <Database className="w-3.5 h-3.5 text-purple-400" />
                    <span>Tools & Integrasi</span>
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {activeUniverseNode.tools.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-300 font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ==================== 4. NEW SECTION: KOLABORASI STAFF AI AGENT DAN STAFF HUMAN ==================== */}
        <HumanAiCollaborationCards />
      </div>
    </section>
  );
};

// Component: KOLABORASI STAFF AI AGENT DAN STAFF HUMAN
const HumanAiCollaborationCards: React.FC = () => {
  const [expandedCard, setExpandedCard] = useState<'AI' | 'HUMAN' | null>(null);

  const toggleExpand = (card: 'AI' | 'HUMAN') => {
    setExpandedCard((prev) => (prev === card ? null : card));
  };

  const aiCapabilities = [
    'Bekerja sesuai jadwal dan jam kerja',
    'Membaca task dan prioritas',
    'Mengakses Company Brain dan business knowledge',
    'Berkoordinasi dengan AI Agent lainnya',
    'Menerima informasi dari Staff Human',
    'Menjalankan pekerjaan sesuai kapasitas dan skill',
    'Membuat report pekerjaan',
    'Memberikan rekomendasi',
    'Mengirim notifikasi',
    'Meminta informasi atau approval dari Human Staff',
    'Berkomunikasi melalui WhatsApp',
    'Terhubung dengan Telegram',
    'Terhubung dengan tools perusahaan',
    'Memberikan update pekerjaan secara realtime.',
  ];

  const humanCapabilities = [
    'Mengirim task melalui WhatsApp',
    'Mengirim task melalui Telegram',
    'Meminta bantuan AI Agent',
    'Mengirim update pekerjaan',
    'Mengirim report harian',
    'Meminta status task',
    'Menerima notifikasi AI Agent',
    'Menerima rekomendasi',
    'Melakukan approval',
    'Berkomunikasi dengan AI Partner',
    'Memantau pekerjaan AI Agent',
    'Mendapatkan informasi realtime.',
  ];

  return (
    <div className="mt-14 pt-10 border-t border-[#243247] relative">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#1479F5]/10 border border-[#1479F5]/30 text-[#06B6D4] text-xs font-mono font-bold mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>HUMAN + AI = ONE WORKFORCE</span>
        </div>
        <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F8FAFC] via-[#E2E8F0] to-[#94A3B8] tracking-tight uppercase">
          KOLABORASI STAFF AI AGENT DAN STAFF HUMAN
        </h3>
        <p className="mt-3 text-sm sm:text-base text-[#94A3B8] leading-relaxed max-w-2xl mx-auto">
          OrchestreeAI menyatukan Staff AI Agent dan Staff Human dalam satu ekosistem kerja yang terhubung, komunikatif, dan berjalan secara berkelanjutan.
        </p>
      </div>

      {/* Two Primary Interactive Cards with Center Connection */}
      <div className="relative">
        {/* Desktop Glowing Visual Connection Rail between Cards */}
        <div className="hidden lg:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex-col items-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-[#0B1220] border-2 border-[#16C784] shadow-[0_0_20px_rgba(22,199,132,0.5)] flex items-center justify-center text-[#16C784] animate-pulse">
            <Share2 className="w-4 h-4" />
          </div>
          <div className="mt-1 px-2.5 py-0.5 rounded-full bg-[#111827] border border-[#243247] text-[10px] font-mono font-bold text-[#06B6D4] uppercase tracking-wider shadow-md whitespace-nowrap">
            AI WORKFORCE PARTNER
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
          {/* ==================== CARD 01: STAFF AI AGENT ==================== */}
          <div
            className={`rounded-3xl bg-[#0B1220] border transition-all duration-300 p-6 sm:p-7 flex flex-col justify-between relative group ${
              expandedCard === 'AI'
                ? 'border-[#16C784] shadow-2xl shadow-[#16C784]/20 ring-1 ring-[#16C784]/40'
                : 'border-[#243247] hover:border-[#16C784]/60 hover:shadow-xl hover:shadow-[#16C784]/10'
            }`}
          >
            {/* Top Header */}
            <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#16C784]/15 border border-[#16C784]/30 flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform">
                    🤖
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#16C784]/20 border border-[#16C784]/40 text-[10px] font-mono font-bold text-[#16C784] tracking-wider uppercase inline-block">
                      AI WORKFORCE
                    </span>
                    <h4 className="text-xl sm:text-2xl font-black text-[#F8FAFC] tracking-tight mt-0.5">
                      Staff AI Agent
                    </h4>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#16C784]/10 border border-[#16C784]/30 text-[11px] font-mono font-bold text-[#16C784]">
                  <span className="w-2 h-2 rounded-full bg-[#16C784] animate-ping" />
                  <span>● ACTIVE</span>
                </div>
              </div>

              {/* Primary Description */}
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-5">
                Staff AI Agent bekerja secara autonom sesuai dengan jobdesk, knowledge bisnis, task, prioritas, jadwal kerja, dan aturan perusahaan yang telah ditetapkan.
              </p>

              {/* WhatsApp Live Visual Demonstration */}
              <div className="p-4 rounded-2xl bg-[#050B16] border border-[#243247] mb-6 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/5 text-xs text-[#94A3B8]">
                  <span className="flex items-center space-x-1.5 font-bold text-[#16C784]">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp AI Communication</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Realtime Relay</span>
                </div>

                {/* Chat Bubble AI Staff */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-start space-x-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#16C784]/20 border border-[#16C784]/40 flex items-center justify-center text-[11px] shrink-0 font-bold text-[#16C784]">
                      AI
                    </div>
                    <div className="p-3 rounded-2xl rounded-tl-sm bg-[#111827] border border-[#243247] text-[#F8FAFC] max-w-[90%] shadow-sm">
                      <div className="text-[10px] font-mono text-[#06B6D4] font-bold mb-0.5">AI STAFF (KIRANA - MARKETING)</div>
                      <p className="leading-relaxed">
                        Task Marketing hari ini telah selesai. 3 konten telah dibuat dan menunggu approval.
                      </p>
                      <div className="mt-1 flex items-center space-x-2 text-[9px] text-[#94A3B8] font-mono">
                        <span>14:32 WIB</span>
                        <span>•</span>
                        <span className="text-[#16C784]">✓✓ Terkirim ke WA Manager</span>
                      </div>
                    </div>
                  </div>

                  {/* Animated Activity Indicator */}
                  <div className="flex items-center space-x-2 pl-8 pt-1 text-[11px] text-[#06B6D4] font-mono font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4] animate-pulse" />
                    <span>AI bekerja autonom & sinkronisasi Company Brain...</span>
                  </div>
                </div>
              </div>

              {/* Capabilities Grid */}
              <div className="space-y-2 mb-6">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] block">
                  Kapabilitas & Tanggung Jawab Mandiri:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#F8FAFC]">
                  {aiCapabilities.slice(0, 8).map((cap, i) => (
                    <div key={i} className="flex items-start space-x-2 p-1.5 rounded-lg bg-[#111827]/50 border border-white/5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#16C784] shrink-0 mt-0.5" />
                      <span className="text-[11px] text-slate-300 leading-snug">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Expandable How It Works Trigger */}
            <div className="pt-4 border-t border-[#243247]">
              <button
                onClick={() => toggleExpand('AI')}
                className="w-full py-2.5 px-4 rounded-xl bg-[#111827] hover:bg-[#16C784]/15 border border-[#243247] hover:border-[#16C784]/40 text-xs font-bold text-[#F8FAFC] transition-all flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center space-x-2">
                  <Bot className="w-4 h-4 text-[#16C784]" />
                  <span>Bagaimana Staff AI bekerja?</span>
                </span>
                <span className="text-[#16C784] text-[11px] font-mono">
                  {expandedCard === 'AI' ? 'Tutup Detail ▲' : 'Lihat Siklus Kerja ▼'}
                </span>
              </button>

              {/* Expanded Step Sequence */}
              {expandedCard === 'AI' && (
                <div className="mt-4 p-4 rounded-2xl bg-[#050B16] border border-[#16C784]/30 space-y-3 transition-all animate-fadeIn">
                  <div className="text-[11px] font-mono uppercase text-[#16C784] font-bold">
                    Siklus Eksekusi Mandiri Staff AI:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
                    {[
                      { step: '1. Knowledge', desc: 'Akses SOP & Company Brain' },
                      { step: '2. Task', desc: 'Baca prioritas & parameter' },
                      { step: '3. Schedule', desc: 'Eksekusi sesuai jadwal jam kerja' },
                      { step: '4. Execution', desc: 'Menjalankan tools & aset bisnis' },
                      { step: '5. Communication', desc: 'Notifikasi WA / Telegram' },
                      { step: '6. Report', desc: 'Laporan hasil & minta review' },
                    ].map((s, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-[#111827] border border-[#243247]">
                        <div className="font-bold text-[#16C784] text-[11px]">{s.step}</div>
                        <div className="text-[10px] text-[#94A3B8] mt-0.5 leading-tight">{s.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-400 italic pt-1 border-t border-white/5">
                    "Staff AI bukan sekadar chatbot. Staff AI adalah rekan kerja digital yang bekerja tanpa henti."
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ==================== CARD 02: STAFF HUMAN ==================== */}
          <div
            className={`rounded-3xl bg-[#0B1220] border transition-all duration-300 p-6 sm:p-7 flex flex-col justify-between relative group ${
              expandedCard === 'HUMAN'
                ? 'border-[#1479F5] shadow-2xl shadow-[#1479F5]/20 ring-1 ring-[#1479F5]/40'
                : 'border-[#243247] hover:border-[#1479F5]/60 hover:shadow-xl hover:shadow-[#1479F5]/10'
            }`}
          >
            {/* Top Header */}
            <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#1479F5]/15 border border-[#1479F5]/30 flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform">
                    👤
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#1479F5]/20 border border-[#1479F5]/40 text-[10px] font-mono font-bold text-[#06B6D4] tracking-wider uppercase inline-block">
                      HUMAN WORKFORCE
                    </span>
                    <h4 className="text-xl sm:text-2xl font-black text-[#F8FAFC] tracking-tight mt-0.5">
                      Staff Human
                    </h4>
                  </div>
                </div>

                {/* Connected Indicator */}
                <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#1479F5]/10 border border-[#1479F5]/30 text-[11px] font-mono font-bold text-[#06B6D4]">
                  <span className="w-2 h-2 rounded-full bg-[#06B6D4] animate-ping" />
                  <span>● CONNECTED</span>
                </div>
              </div>

              {/* Primary Description */}
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-5">
                Dapat meminta bantuan AI Agent, mengirim task melalui WhatsApp, mengirim report pekerjaan, dan berkomunikasi dengan Staff AI Agent tanpa harus membuka aplikasi.
              </p>

              {/* WhatsApp Live Visual Demonstration */}
              <div className="p-4 rounded-2xl bg-[#050B16] border border-[#243247] mb-6 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/5 text-xs text-[#94A3B8]">
                  <span className="flex items-center space-x-1.5 font-bold text-[#06B6D4]">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp Human Relay & Commands</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">2-Way Bridge</span>
                </div>

                {/* Chat Bubble Human & AI */}
                <div className="space-y-2.5 text-xs">
                  {/* Human Message */}
                  <div className="flex items-start space-x-2.5 justify-end">
                    <div className="p-3 rounded-2xl rounded-tr-sm bg-[#1479F5]/20 border border-[#1479F5]/40 text-[#F8FAFC] max-w-[85%] text-right shadow-sm">
                      <div className="text-[10px] font-mono text-[#06B6D4] font-bold mb-0.5">STAFF HUMAN (DONI - SENIOR AE)</div>
                      <p className="leading-relaxed">
                        @Arya, bantu follow up task Sales hari ini dan verifikasi 5 lead baru.
                      </p>
                      <div className="mt-1 text-[9px] text-[#94A3B8] font-mono">14:35 WIB • ✓✓ Dibaca AI</div>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-[#1479F5]/20 border border-[#1479F5]/40 flex items-center justify-center text-[11px] shrink-0 font-bold text-[#1479F5]">
                      👤
                    </div>
                  </div>

                  {/* AI Response */}
                  <div className="flex items-start space-x-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#16C784]/20 border border-[#16C784]/40 flex items-center justify-center text-[11px] shrink-0 font-bold text-[#16C784]">
                      AI
                    </div>
                    <div className="p-3 rounded-2xl rounded-tl-sm bg-[#111827] border border-[#243247] text-[#F8FAFC] max-w-[85%] shadow-sm">
                      <div className="text-[10px] font-mono text-[#16C784] font-bold mb-0.5">AI CHIEF OF STAFF (ARYA)</div>
                      <p className="leading-relaxed">
                        Baik Mas Doni. Saya sudah instruksikan AI Sales Partner untuk follow up 5 lead via WhatsApp API & update CRM.
                      </p>
                      <div className="mt-1 text-[9px] text-[#94A3B8] font-mono">14:35 WIB • Eksekusi Aktif</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Capabilities Grid */}
              <div className="space-y-2 mb-6">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] block">
                  Kemudahan Interaksi Staf Manusia:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#F8FAFC]">
                  {humanCapabilities.slice(0, 8).map((cap, i) => (
                    <div key={i} className="flex items-start space-x-2 p-1.5 rounded-lg bg-[#111827]/50 border border-white/5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#1479F5] shrink-0 mt-0.5" />
                      <span className="text-[11px] text-slate-300 leading-snug">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Expandable How It Works Trigger */}
            <div className="pt-4 border-t border-[#243247]">
              <button
                onClick={() => toggleExpand('HUMAN')}
                className="w-full py-2.5 px-4 rounded-xl bg-[#111827] hover:bg-[#1479F5]/15 border border-[#243247] hover:border-[#1479F5]/40 text-xs font-bold text-[#F8FAFC] transition-all flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center space-x-2">
                  <UserCheck className="w-4 h-4 text-[#1479F5]" />
                  <span>Bagaimana Staff Human bekerja dengan AI?</span>
                </span>
                <span className="text-[#06B6D4] text-[11px] font-mono">
                  {expandedCard === 'HUMAN' ? 'Tutup Detail ▲' : 'Lihat Siklus Kerja ▼'}
                </span>
              </button>

              {/* Expanded Step Sequence */}
              {expandedCard === 'HUMAN' && (
                <div className="mt-4 p-4 rounded-2xl bg-[#050B16] border border-[#1479F5]/30 space-y-3 transition-all animate-fadeIn">
                  <div className="text-[11px] font-mono uppercase text-[#06B6D4] font-bold">
                    Siklus Kolaborasi Staf Manusia dengan AI:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
                    {[
                      { step: '1. Task', desc: 'Kirim instruksi atau delegasi' },
                      { step: '2. WhatsApp', desc: 'Kirim via chat WA / Telegram' },
                      { step: '3. AI Agent', desc: 'OrchestreeAI proses konteks' },
                      { step: '4. Execution', desc: 'AI partner bekerja otomatis' },
                      { step: '5. Report', desc: 'Terima briefing & draft hasil' },
                      { step: '6. Review', desc: 'Approval 1-klik oleh manusia' },
                    ].map((s, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-[#111827] border border-[#243247]">
                        <div className="font-bold text-[#06B6D4] text-[11px]">{s.step}</div>
                        <div className="text-[10px] text-[#94A3B8] mt-0.5 leading-tight">{s.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-400 italic pt-1 border-t border-white/5">
                    "Staff Human tidak perlu meninggalkan workflow mereka. Mereka bekerja bersama AI melalui tools komunikasi sehari-hari."
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Connecting Badge */}
        <div className="mt-6 flex lg:hidden items-center justify-center">
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-[#0B1220] border border-[#243247] text-xs font-mono text-[#06B6D4] shadow-lg">
            <span className="w-2 h-2 rounded-full bg-[#16C784] animate-pulse" />
            <span className="font-bold">STAFF HUMAN ↕ ORCHESTREEAI ↕ STAFF AI AGENT</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Simple Tree Renderer for Hierarchical Mode
interface SimpleTreeRendererProps {
  node: WorkforceTreeNode;
  selectedId: string;
  expandedNodes: Set<string>;
  onSelectNode: (node: WorkforceTreeNode) => void;
  onToggleExpand: (id: string, e?: React.MouseEvent) => void;
}

const SimpleTreeRenderer: React.FC<SimpleTreeRendererProps> = ({
  node,
  selectedId,
  expandedNodes,
  onSelectNode,
  onToggleExpand,
}) => {
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div className="my-1.5 text-left">
      <div
        onClick={() => onSelectNode(node)}
        className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
          isSelected
            ? 'border-[#08B85C] bg-[#08B85C]/20 ring-2 ring-[#08B85C]/40 text-white'
            : 'border-white/10 bg-white/[0.02] hover:bg-white/5 text-slate-200'
        }`}
      >
        <div className="flex items-center space-x-2 truncate">
          {hasChildren ? (
            <button
              onClick={(e) => onToggleExpand(node.id, e)}
              className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-slate-300 hover:text-white shrink-0 cursor-pointer"
            >
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            </div>
          )}
          <span className="text-lg shrink-0">{node.avatarEmoji || '🔹'}</span>
          <div className="truncate">
            <span className="text-xs font-bold text-white mr-2">{node.name}</span>
            <span className="text-[10px] text-slate-400">{node.title || node.role}</span>
          </div>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-white/10 uppercase shrink-0">
          {node.type}
        </span>
      </div>

      {hasChildren && isExpanded && (
        <div className="pl-4 ml-3 border-l border-[#08B85C]/30 space-y-1 mt-1">
          {node.children!.map((child) => (
            <SimpleTreeRenderer
              key={child.id}
              node={child}
              selectedId={selectedId}
              expandedNodes={expandedNodes}
              onSelectNode={onSelectNode}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};
