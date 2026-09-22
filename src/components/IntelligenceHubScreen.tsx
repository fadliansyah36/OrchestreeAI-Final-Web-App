import React, { useState, useEffect } from 'react';
import {
  Radar,
  Globe2,
  TrendingUp,
  Brain,
  Search,
  Sparkles,
  FileText,
  Upload,
  Database,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Tag,
  Plus,
  Radio,
  ExternalLink,
  Sliders,
  Send,
  Building,
  DollarSign,
  Zap,
  Target,
  FileSpreadsheet,
  AlertTriangle,
  Play
} from 'lucide-react';
import { TenantRegistrationResponse } from '../types';

interface IntelligenceHubScreenProps {
  tenant: TenantRegistrationResponse | null;
  onBack?: () => void;
  defaultTab?: 'competitor' | 'world' | 'prospecting' | 'brain';
}

interface CompetitorTarget {
  id: string;
  name: string;
  domain: string;
  target_type: string;
  target_url: string;
  category: string;
  frequency: string;
  is_active: boolean;
  crawler_adapter: string;
  robots_txt_status: string;
  last_scraped_at?: string;
  last_status: string;
}

interface CompetitorChangeEvent {
  id: string;
  target_id: string;
  target_name?: string;
  change_type: string;
  title: string;
  description: string;
  diff_payload: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected_at: string;
}

interface CompetitorInsight {
  id: string;
  target_id: string;
  target_name?: string;
  title: string;
  summary: string;
  category: string;
  novelty_score: number;
  relevance_score: number;
  urgency_score: number;
  business_impact_score: number;
  final_score: number;
  dispatch_action: 'SEND_IMMEDIATE' | 'INCLUDE_DIGEST' | 'DISCARD';
  strategic_recommendation: string;
  counter_strategy: Record<string, any>;
  proactive_dispatched: boolean;
  idempotency_key: string;
  created_at: string;
}

interface CompetitorReport {
  id: string;
  report_type: string;
  title: string;
  period_start: string;
  period_end: string;
  summary_markdown: string;
  key_takeaways: string[];
  action_items: string[];
  created_at: string;
}

interface MemoryDocument {
  id: string;
  tenant_id: string;
  title: string;
  summary?: string;
  category: string;
  source_type: string;
  data_classification: string;
  confidence: number;
  decay_factor: number;
  access_count: number;
  last_accessed_at?: string;
  created_at: string;
}

interface SearchResultItem {
  document_id: string;
  chunk_id?: string;
  title: string;
  content: string;
  summary?: string;
  category: string;
  confidence: number;
  rrf_score: number;
  similarity?: number;
}

export const IntelligenceHubScreen: React.FC<IntelligenceHubScreenProps> = ({
  tenant,
  onBack,
  defaultTab = 'competitor',
}) => {
  const isValidUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const tenantId = isValidUuid(tenant?.tenant_id) ? tenant!.tenant_id : 'd1159d6d-0044-42ea-8007-d549a0011402';

  const [topTab, setTopTab] = useState<'competitor' | 'world' | 'prospecting' | 'brain'>(defaultTab);

  // Competitor Monitor State
  const [targets, setTargets] = useState<CompetitorTarget[]>([]);
  const [changes, setChanges] = useState<CompetitorChangeEvent[]>([]);
  const [insights, setInsights] = useState<CompetitorInsight[]>([]);
  const [reports, setReports] = useState<CompetitorReport[]>([]);
  const [isLoadingCompetitor, setIsLoadingCompetitor] = useState(false);
  const [crawlingTargetId, setCrawlingTargetId] = useState<string | null>(null);
  const [crawlFeedback, setCrawlFeedback] = useState<{ id: string; status: string; message: string } | null>(null);
  const [dispatchingInsightId, setDispatchingInsightId] = useState<string | null>(null);

  // New Target Form Modal
  const [showAddTarget, setShowAddTarget] = useState(false);
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetDomain, setNewTargetDomain] = useState('');
  const [newTargetUrl, setNewTargetUrl] = useState('');
  const [newTargetCategory, setNewTargetCategory] = useState('direct_competitor');
  const [newTargetFrequency, setNewTargetFrequency] = useState('daily');
  const [newTargetAdapter, setNewTargetAdapter] = useState('WebAdapter');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  // Generate Report Modal
  const [showGenerateReport, setShowGenerateReport] = useState(false);
  const [reportTitle, setReportTitle] = useState('Ringkasan Mingguan Lanskap Pasar Q3');
  const [reportType, setReportType] = useState('weekly_digest');
  const [reportStart, setReportStart] = useState('2026-09-15');
  const [reportEnd, setReportEnd] = useState('2026-09-22');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // World Monitor State
  const [worldSignals, setWorldSignals] = useState<any[]>([]);
  const [isLoadingWorld, setIsLoadingWorld] = useState(false);

  // Vibe Prospecting State
  const [vibeProspects, setVibeProspects] = useState<any[]>([]);
  const [isLoadingVibe, setIsLoadingVibe] = useState(false);

  // Company Brain State
  const [brainTab, setBrainTab] = useState<'search' | 'documents' | 'ingest' | 'decay'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLatency, setSearchLatency] = useState<number | null>(null);

  const [documents, setDocuments] = useState<MemoryDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('knowledge');
  const [newClassification, setNewClassification] = useState<'public' | 'internal' | 'confidential' | 'restricted'>('internal');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const [isConsolidating, setIsConsolidating] = useState(false);
  const [decayReport, setDecayReport] = useState<any | null>(null);

  // Load Initial Competitor Data
  useEffect(() => {
    if (topTab === 'competitor') {
      fetchCompetitorData();
    } else if (topTab === 'world') {
      fetchWorldSignals();
    } else if (topTab === 'prospecting') {
      fetchVibeProspects();
    } else if (topTab === 'brain' && brainTab === 'documents') {
      fetchDocuments();
    }
  }, [topTab, brainTab, tenantId]);

  const fetchCompetitorData = async () => {
    setIsLoadingCompetitor(true);
    try {
      const [tRes, cRes, iRes, rRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/competitor/targets`),
        fetch(`/api/v1/tenants/${tenantId}/competitor/changes`),
        fetch(`/api/v1/tenants/${tenantId}/competitor/insights`),
        fetch(`/api/v1/tenants/${tenantId}/competitor/reports`),
      ]);

      if (tRes.ok) {
        const d = await tRes.json();
        setTargets(d.data || []);
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setChanges(d.data || []);
      }
      if (iRes.ok) {
        const d = await iRes.json();
        setInsights(d.data || []);
      }
      if (rRes.ok) {
        const d = await rRes.json();
        setReports(d.data || []);
      }
    } catch (err) {
      console.warn('Gagal memuat data kompetitor:', err);
    } finally {
      setIsLoadingCompetitor(false);
    }
  };

  const fetchWorldSignals = async () => {
    setIsLoadingWorld(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/intelligence/world-monitor`);
      if (res.ok) {
        const d = await res.json();
        setWorldSignals(d.signals || []);
      }
    } catch (err) {
      console.warn('Gagal memuat sinyal pasar global:', err);
    } finally {
      setIsLoadingWorld(false);
    }
  };

  const fetchVibeProspects = async () => {
    setIsLoadingVibe(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/intelligence/vibe-prospecting`);
      if (res.ok) {
        const d = await res.json();
        setVibeProspects(d.radar_items || []);
      }
    } catch (err) {
      console.warn('Gagal memuat vibe prospecting:', err);
    } finally {
      setIsLoadingVibe(false);
    }
  };

  const handleCrawlTarget = async (targetId: string, force = true) => {
    setCrawlingTargetId(targetId);
    setCrawlFeedback(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/competitor/targets/${targetId}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_refresh: force }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setCrawlFeedback({
          id: targetId,
          status: data.data.status,
          message: data.data.message || 'Scraping F.01-SCRAPE berhasil dijalankan.',
        });
        // Refresh feeds
        await fetchCompetitorData();
      } else {
        setCrawlFeedback({
          id: targetId,
          status: 'error',
          message: data.error || 'Gagal menjalankan scraping.',
        });
      }
    } catch (err: any) {
      setCrawlFeedback({
        id: targetId,
        status: 'error',
        message: err.message || 'Terjadi kesalahan jaringan.',
      });
    } finally {
      setCrawlingTargetId(null);
    }
  };

  const handleAddTargetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetName.trim() || !newTargetDomain.trim() || !newTargetUrl.trim()) return;

    setIsSavingTarget(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/competitor/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTargetName,
          domain: newTargetDomain,
          target_url: newTargetUrl,
          category: newTargetCategory,
          frequency: newTargetFrequency,
          crawler_adapter: newTargetAdapter,
        }),
      });
      if (res.ok) {
        setShowAddTarget(false);
        setNewTargetName('');
        setNewTargetDomain('');
        setNewTargetUrl('');
        await fetchCompetitorData();
      }
    } catch (err) {
      console.warn('Gagal menyimpan target:', err);
    } finally {
      setIsSavingTarget(false);
    }
  };

  const handleDispatchInsight = async (insightId: string) => {
    setDispatchingInsightId(insightId);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/competitor/insights/${insightId}/dispatch`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchCompetitorData();
      }
    } catch (err) {
      console.warn('Gagal mengirim insight:', err);
    } finally {
      setDispatchingInsightId(null);
    }
  };

  const handleGenerateReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingReport(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/competitor/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: reportTitle,
          report_type: reportType,
          period_start: reportStart,
          period_end: reportEnd,
        }),
      });
      if (res.ok) {
        setShowGenerateReport(false);
        await fetchCompetitorData();
      }
    } catch (err) {
      console.warn('Gagal membuat laporan:', err);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Company Brain Handlers
  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    setDocsError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/memory/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal memuat daftar memori`);
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setDocsError(err.message || 'Gagal memuat memori.');
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    const start = performance.now();

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/memory/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          category: selectedCategory !== 'all' ? selectedCategory : undefined,
          limit: 10,
        }),
      });

      setSearchLatency(Math.round(performance.now() - start));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setIsIngesting(true);
    setIngestSuccess(null);
    setIngestError(null);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/memory/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          category: newCategory,
          data_classification: newClassification,
          source_type: 'manual_entry',
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal menyimpan memori`);
      setIngestSuccess(`Dokumen '${newTitle}' berhasil diindeks ke dalam memori kognitif.`);
      setNewTitle('');
      setNewContent('');
      if (brainTab === 'documents') fetchDocuments();
    } catch (err: any) {
      setIngestError(err.message || 'Terjadi kesalahan saat memproses dokumen.');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleConsolidateDecay = async () => {
    setIsConsolidating(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/memory/consolidate`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setDecayReport(data);
      }
    } catch (err) {
      console.warn('Gagal konsolidasi decay:', err);
    } finally {
      setIsConsolidating(false);
    }
  };

  return (
    <div id="intelligence-hub-screen" className="min-h-screen bg-[#070D18] text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Radar className="w-3.5 h-3.5" /> F.01-SCRAPE & Market Intelligence
              </span>
              <span className="text-xs text-slate-400">Isolasi Organisasi Aktif</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Intelijen Pasar, Radar Pesaing & Memori
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Pemantauan perubahan harga, peluncuran produk, dan strategi tandingan otonom berbasis scoring gating terintegrasi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onBack && (
              <button
                id="btn-back-hub"
                onClick={onBack}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Kembali ke Hub
              </button>
            )}
            <button
              id="btn-refresh-intel"
              onClick={() => {
                if (topTab === 'competitor') fetchCompetitorData();
                if (topTab === 'world') fetchWorldSignals();
                if (topTab === 'prospecting') fetchVibeProspects();
                if (topTab === 'brain') fetchDocuments();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-600/30 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCompetitor || isLoadingWorld || isLoadingVibe ? 'animate-spin' : ''}`} />
              Segarkan Data
            </button>
          </div>
        </div>

        {/* Top-Level Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 overflow-x-auto pb-px">
          <button
            id="tab-btn-competitor"
            onClick={() => setTopTab('competitor')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              topTab === 'competitor'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Radar className="w-4 h-4" />
            Pemantau Pesaing
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {targets.length}
            </span>
          </button>

          <button
            id="tab-btn-world"
            onClick={() => setTopTab('world')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              topTab === 'world'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Globe2 className="w-4 h-4" />
            Radar Pasar Global
          </button>

          <button
            id="tab-btn-prospecting"
            onClick={() => setTopTab('prospecting')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              topTab === 'prospecting'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Vibe Prospecting
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
              Radar Aktif
            </span>
          </button>

          <button
            id="tab-btn-brain"
            onClick={() => setTopTab('brain')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              topTab === 'brain'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Brain className="w-4 h-4" />
            Company Brain & Memori
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: PEMANTAU PESAING (COMPETITOR MONITOR) */}
        {/* ========================================================================= */}
        {topTab === 'competitor' && (
          <div className="space-y-6">

            {/* Feedback Alert for Crawl */}
            {crawlFeedback && (
              <div
                id="crawl-feedback-alert"
                className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
                  crawlFeedback.status === 'success'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : crawlFeedback.status === 'blocked_by_robots'
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {crawlFeedback.status === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />}
                  {crawlFeedback.status === 'blocked_by_robots' && <ShieldCheck className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />}
                  {crawlFeedback.status === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" />}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide">
                      {crawlFeedback.status === 'success' && 'Hasil Crawling F.01-SCRAPE Sukses'}
                      {crawlFeedback.status === 'blocked_by_robots' && 'Penolakan Sesuai Kepatuhan Robots.txt/ToS'}
                      {crawlFeedback.status === 'error' && 'Pemberitahuan Sistem Crawling'}
                    </div>
                    <p className="text-xs mt-0.5 opacity-90 leading-relaxed">{crawlFeedback.message}</p>
                  </div>
                </div>
                <button
                  onClick={() => setCrawlFeedback(null)}
                  className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Section: Targets & Action Header */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    Target Kompetitor Terdaftar
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mesin otonom mengekstrak penawaran harga & produk menggunakan LLM Page Structure Understanding.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    id="btn-open-add-target"
                    onClick={() => setShowAddTarget(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Target
                  </button>
                  <button
                    id="btn-open-gen-report"
                    onClick={() => setShowGenerateReport(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-semibold hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" /> Buat Laporan Intelijen
                  </button>
                </div>
              </div>

              {/* Targets Table / Grid */}
              {targets.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-800 rounded-lg">
                  <Radar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Belum ada target kompetitor yang didaftarkan.</p>
                  <button
                    onClick={() => setShowAddTarget(true)}
                    className="mt-3 text-xs text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    + Daftarkan Target Pertama Sekarang
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {targets.map((tgt) => (
                    <div
                      key={tgt.id}
                      id={`target-card-${tgt.id}`}
                      className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-lg p-4 flex flex-col justify-between transition-colors"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
                              {tgt.crawler_adapter}
                            </span>
                            <h3 className="text-sm font-bold text-white mt-1.5">{tgt.name}</h3>
                            <a
                              href={tgt.target_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1 mt-0.5 truncate max-w-[220px]"
                            >
                              <span>{tgt.domain}</span>
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            </a>
                          </div>

                          <div className="text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                tgt.robots_txt_status === 'allowed'
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                  : tgt.robots_txt_status === 'disallowed'
                                  ? 'bg-amber-950/60 text-amber-400 border border-amber-800'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              Robots: {tgt.robots_txt_status}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                          <div>
                            <span className="block text-slate-500">Frekuensi</span>
                            <span className="font-semibold text-slate-300 capitalize">{tgt.frequency}</span>
                          </div>
                          <div>
                            <span className="block text-slate-500">Status Terakhir</span>
                            <span
                              className={`font-semibold capitalize ${
                                tgt.last_status === 'success'
                                  ? 'text-emerald-400'
                                  : tgt.last_status === 'blocked_by_robots'
                                  ? 'text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {tgt.last_status}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          {tgt.last_scraped_at
                            ? `Crawl: ${new Date(tgt.last_scraped_at).toLocaleTimeString()}`
                            : 'Belum pernah di-crawl'}
                        </span>
                        <button
                          id={`btn-crawl-${tgt.id}`}
                          onClick={() => handleCrawlTarget(tgt.id)}
                          disabled={crawlingTargetId === tgt.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {crawlingTargetId === tgt.id ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                              <span>Mengekstrak...</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                              <span>Crawl Sekarang</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section: Peristiwa Perubahan Terdeteksi (detectChange) & Insight Gating */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Kolom Kiri: Peristiwa Perubahan Terdeteksi (detectChange) */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Peristiwa Perubahan Terdeteksi (detectChange)
                    </h2>
                    <span className="text-xs text-slate-400 font-mono">{changes.length} Events</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Perbandingan snapshot otomatis mengidentifikasi pergeseran harga, produk baru, dan kampanye pesaing.
                  </p>

                  {changes.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-slate-800 rounded-lg text-xs text-slate-500">
                      Belum ada peristiwa perubahan yang tercatat. Jalankan scraping pada target di atas.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                      {changes.map((ch) => (
                        <div
                          key={ch.id}
                          id={`change-event-${ch.id}`}
                          className="p-3.5 rounded-lg bg-slate-950/90 border border-slate-800 hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                ch.severity === 'critical'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : ch.severity === 'high'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {ch.severity} • {ch.change_type}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(ch.detected_at).toLocaleDateString()}
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-white mt-1.5">{ch.title}</h4>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{ch.description}</p>

                          {ch.diff_payload && Object.keys(ch.diff_payload).length > 0 && (
                            <div className="mt-2.5 p-2 rounded bg-slate-900/90 border border-slate-800/80 text-[11px] font-mono text-slate-300 space-y-1">
                              {ch.diff_payload.previous_price && (
                                <div className="text-slate-400">
                                  Harga Lama: <span className="line-through text-slate-500">{ch.diff_payload.previous_price}</span>
                                </div>
                              )}
                              {ch.diff_payload.current_price && (
                                <div className="text-emerald-400 font-bold">
                                  Harga Baru: {ch.diff_payload.current_price} ({ch.diff_payload.change_percent}%)
                                </div>
                              )}
                              {ch.diff_payload.product && (
                                <div className="text-sky-300">
                                  Produk: {ch.diff_payload.product.name} — {ch.diff_payload.product.price}
                                </div>
                              )}
                              {ch.diff_payload.campaign && (
                                <div className="text-purple-300">
                                  Promo: &ldquo;{ch.diff_payload.campaign.title}&rdquo; (Kode: {ch.diff_payload.campaign.discount_code || 'N/A'})
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Kolom Kanan: Scoring Gating & Insight Matang */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Scoring Gating & Rekomendasi Taktis
                    </h2>
                    <span className="text-xs text-slate-400 font-mono">{insights.length} Insights</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Formula 4-Dimensi: Novelty (20%), Relevance (25%), Urgency (25%), Business Impact (30%).
                  </p>

                  {insights.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-slate-800 rounded-lg text-xs text-slate-500">
                      Belum ada insight matang yang dihasilkan. Lakukan crawl untuk memicu gating otomatis.
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                      {insights.map((ins) => (
                        <div
                          key={ins.id}
                          id={`insight-card-${ins.id}`}
                          className="p-4 rounded-lg bg-slate-950/90 border border-slate-800 hover:border-slate-700 transition-colors space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                ins.dispatch_action === 'SEND_IMMEDIATE'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : ins.dispatch_action === 'INCLUDE_DIGEST'
                                  ? 'bg-sky-950 text-sky-300 border border-sky-800'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {ins.dispatch_action}
                            </span>
                            <span className="text-xs font-bold font-mono text-emerald-400">
                              Skor: {(ins.final_score * 100).toFixed(0)} / 100
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-white">{ins.title}</h4>
                          <p className="text-xs text-slate-400 leading-relaxed">{ins.summary}</p>

                          {/* Breakdown Nilai Skor */}
                          <div className="grid grid-cols-4 gap-1.5 p-2 rounded bg-slate-900/80 border border-slate-800 text-[10px] text-center">
                            <div>
                              <span className="block text-slate-500">Novelty</span>
                              <span className="font-bold text-slate-300">{(ins.novelty_score * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <span className="block text-slate-500">Relevance</span>
                              <span className="font-bold text-slate-300">{(ins.relevance_score * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <span className="block text-slate-500">Urgency</span>
                              <span className="font-bold text-amber-400">{(ins.urgency_score * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <span className="block text-slate-500">Impact</span>
                              <span className="font-bold text-emerald-400">{(ins.business_impact_score * 100).toFixed(0)}%</span>
                            </div>
                          </div>

                          {/* Rekomendasi Taktis & Counter Strategy */}
                          <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-200 space-y-1">
                            <span className="font-bold text-emerald-400 block text-[11px] uppercase tracking-wide">
                              Rekomendasi Respons:
                            </span>
                            <p className="leading-relaxed">{ins.strategic_recommendation}</p>
                          </div>

                          {/* Idempotency Key & Proactive Dispatch Status */}
                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                            <div className="text-slate-500 font-mono truncate max-w-[200px]" title={ins.idempotency_key}>
                              Key: {ins.idempotency_key}
                            </div>
                            <div>
                              {ins.proactive_dispatched ? (
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Terkirim ke Proactive
                                </span>
                              ) : (
                                <button
                                  id={`btn-dispatch-${ins.id}`}
                                  onClick={() => handleDispatchInsight(ins.id)}
                                  disabled={dispatchingInsightId === ins.id}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  <Send className="w-2.5 h-2.5" />
                                  Kirim ke Proactive Agent
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section: Laporan Intelijen Terbitan (Competitor Reports) */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400" />
                  Laporan Intelijen & Digest Berkala
                </h2>
                <button
                  onClick={() => setShowGenerateReport(true)}
                  className="text-xs text-sky-400 hover:underline font-semibold cursor-pointer"
                >
                  + Terbitkan Laporan Baru
                </button>
              </div>

              {reports.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  Belum ada dokumen laporan intelijen yang diterbitkan.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reports.map((rep) => (
                    <div key={rep.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">{rep.title}</span>
                        <span className="text-slate-500 font-mono text-[10px]">
                          {rep.period_start} s/d {rep.period_end}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 line-clamp-3 leading-relaxed whitespace-pre-line">
                        {rep.summary_markdown}
                      </div>
                      {rep.key_takeaways && rep.key_takeaways.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/80">
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Poin Kunci:</span>
                          <ul className="list-disc list-inside text-xs text-slate-300 mt-0.5 space-y-0.5">
                            {rep.key_takeaways.map((k, idx) => (
                              <li key={idx}>{k}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: RADAR PASAR GLOBAL (WORLD MONITOR) */}
        {/* ========================================================================= */}
        {topTab === 'world' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Globe2 className="w-5 h-5 text-emerald-400" />
                    Radar Intelijen Ekosistem Makro
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Pemantauan sentimen industri, regulasi kepatuhan data privasi, dan dinamika tarif inferensi komputasi global.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Status: Terhubung Aktif
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {worldSignals.map((sig) => (
                  <div key={sig.id} className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                        {sig.category}
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        Relevansi: {(sig.relevance_score * 100).toFixed(0)}%
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white">{sig.headline}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{sig.summary}</p>

                    <div className="p-3 rounded bg-slate-900 border border-slate-800 text-xs space-y-1">
                      <span className="text-slate-500 font-bold block text-[11px]">Rekomendasi Tindakan:</span>
                      <p className="text-slate-300">{sig.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: VIBE PROSPECTING */}
        {/* ========================================================================= */}
        {topTab === 'prospecting' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    Vibe Prospecting (Sinyal Kebutuhan Komersial Nyata)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Radar sinyal percakapan publik B2B yang menunjukkan intensitas kebutuhan adopsi otomasi tenaga kerja AI.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Radar Omnichannel Aktif
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {vibeProspects.map((vp) => (
                  <div key={vp.id} className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        Kanal: {vp.channel}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        Intensitas: {(vp.intent_score * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs text-slate-500 font-bold uppercase">Entitas Terkait</h4>
                      <div className="text-sm font-bold text-white mt-0.5">{vp.company_hint}</div>
                    </div>

                    <div className="p-3 rounded bg-slate-900 border border-slate-800 text-xs text-slate-300 italic">
                      &ldquo;{vp.trigger_phrase}&rdquo;
                    </div>

                    <div className="p-3 rounded bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-200">
                      <span className="font-bold text-emerald-400 block text-[11px] uppercase">Rencana Outreach Taktis:</span>
                      <p className="mt-0.5">{vp.suggested_outreach}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: COMPANY BRAIN & MEMORI (HYBRID SEARCH, INGEST, DECAY) */}
        {/* ========================================================================= */}
        {topTab === 'brain' && (
          <div className="space-y-6">
            {/* Sub Tabs for Brain */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <button
                onClick={() => setBrainTab('search')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  brainTab === 'search' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Pencarian Hybrid (RRF)
              </button>
              <button
                onClick={() => setBrainTab('documents')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  brainTab === 'documents' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Repositori Dokumen Memori
              </button>
              <button
                onClick={() => setBrainTab('ingest')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  brainTab === 'ingest' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Ingesti Pengetahuan Baru
              </button>
              <button
                onClick={() => setBrainTab('decay')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  brainTab === 'decay' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Konsolidasi & Memory Decay
              </button>
            </div>

            {/* Search Content */}
            {brainTab === 'search' && (
              <div className="space-y-4">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Cari pengetahuan perusahaan (vektor + teks lengkap)"
                    className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSearching ? 'Mencari...' : 'Cari'}
                  </button>
                </form>

                {hasSearched && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-400">
                      Ditemukan {searchResults.length} hasil ({searchLatency} ms)
                    </div>
                    {searchResults.map((res, idx) => (
                      <div key={idx} className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white">{res.title}</span>
                          <span className="text-emerald-400 font-mono text-[11px]">
                            RRF Skor: {res.rrf_score.toFixed(4)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{res.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Documents Content */}
            {brainTab === 'documents' && (
              <div className="space-y-3">
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Belum ada dokumen memori tersimpan.
                  </div>
                ) : (
                  documents.map((doc) => (
                    <div key={doc.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">{doc.title}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                          <span>Kategori: {doc.category}</span>
                          <span>•</span>
                          <span>Klasifikasi: {doc.data_classification}</span>
                          <span>•</span>
                          <span>Akses: {doc.access_count}x</span>
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <span className="text-emerald-400 font-mono">
                          Konfidensi: {(doc.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Ingest Content */}
            {brainTab === 'ingest' && (
              <form onSubmit={handleIngest} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 max-w-2xl">
                <h3 className="text-sm font-bold text-white">Ingesti Dokumen Pengetahuan Organisasi</h3>
                {ingestSuccess && <div className="p-3 rounded bg-emerald-950 text-emerald-300 text-xs">{ingestSuccess}</div>}
                {ingestError && <div className="p-3 rounded bg-rose-950 text-rose-300 text-xs">{ingestError}</div>}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Judul Dokumen</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Isi Dokumen Pengetahuan</label>
                  <textarea
                    rows={6}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Kategori</label>
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Klasifikasi Data</label>
                    <select
                      value={newClassification}
                      onChange={(e: any) => setNewClassification(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="public">Public</option>
                      <option value="internal">Internal</option>
                      <option value="confidential">Confidential</option>
                      <option value="restricted">Restricted</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isIngesting}
                  className="px-4 py-2 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
                >
                  {isIngesting ? 'Memproses Ingesti...' : 'Simpan & Indeks ke Memori'}
                </button>
              </form>
            )}

            {/* Decay Content */}
            {brainTab === 'decay' && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 max-w-2xl">
                <h3 className="text-sm font-bold text-white">Konsolidasi Memori & Peluruhan (Decay)</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Memori kognitif menerapkan kurva forgetting Ebbinghaus untuk memprioritaskan dokumen yang sering diakses dan relevan secara dinamis.
                </p>

                <button
                  onClick={handleConsolidateDecay}
                  disabled={isConsolidating}
                  className="px-4 py-2 rounded bg-slate-800 border border-slate-700 text-white text-xs font-semibold hover:bg-slate-700 cursor-pointer disabled:opacity-50"
                >
                  {isConsolidating ? 'Menjalankan Konsolidasi...' : 'Jalankan Konsolidasi Decay Sekarang'}
                </button>

                {decayReport && (
                  <div className="p-3 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                    <div className="font-bold text-emerald-400">Hasil Konsolidasi:</div>
                    <div>Dokumen Terproses: {decayReport.processed_count || 0}</div>
                    <div>Status: Sukses diperbarui</div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Modal: Tambah Target Kompetitor Baru */}
        {showAddTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Tambah Sasaran Pesaing Baru
                </h3>
                <button
                  onClick={() => setShowAddTarget(false)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Batal
                </button>
              </div>

              <form onSubmit={handleAddTargetSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nama Perusahaan Pesaing</label>
                  <input
                    type="text"
                    required
                    value={newTargetName}
                    onChange={(e) => setNewTargetName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Domain</label>
                  <input
                    type="text"
                    required
                    value={newTargetDomain}
                    onChange={(e) => setNewTargetDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">URL Target Halaman Publik</label>
                  <input
                    type="url"
                    required
                    value={newTargetUrl}
                    onChange={(e) => setNewTargetUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Kategori</label>
                    <select
                      value={newTargetCategory}
                      onChange={(e) => setNewTargetCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white"
                    >
                      <option value="direct_competitor">Pesaing Langsung</option>
                      <option value="indirect_competitor">Pesaing Tak Langsung</option>
                      <option value="market_leader">Market Leader</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Frekuensi Crawl</label>
                    <select
                      value={newTargetFrequency}
                      onChange={(e) => setNewTargetFrequency(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white"
                    >
                      <option value="hourly">Setiap Jam</option>
                      <option value="daily">Harian (Rekomendasi)</option>
                      <option value="weekly">Mingguan</option>
                      <option value="manual">Hanya Manual</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tipe Adapter Crawl</label>
                  <select
                    value={newTargetAdapter}
                    onChange={(e) => setNewTargetAdapter(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="WebAdapter">WebAdapter (HTML Landing Page / Pricing)</option>
                    <option value="MarketplaceAdapter">MarketplaceAdapter (Katalog E-Commerce)</option>
                    <option value="SocialAdapter">SocialAdapter (Pengumuman Sosial)</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddTarget(false)}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTarget}
                    className="px-4 py-1.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingTarget ? 'Menyimpan...' : 'Simpan Sasaran'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Generate Laporan Intelijen */}
        {showGenerateReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                  Buat Laporan Intelijen Berkala
                </h3>
                <button
                  onClick={() => setShowGenerateReport(false)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Batal
                </button>
              </div>

              <form onSubmit={handleGenerateReportSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Judul Laporan</label>
                  <input
                    type="text"
                    required
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tipe Laporan</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="weekly_digest">Weekly Executive Digest</option>
                    <option value="pricing_audit">Audit Tandingan Harga</option>
                    <option value="quarterly_landscape">Lanskap Strategis Kuartalan</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Awal Periode</label>
                    <input
                      type="date"
                      required
                      value={reportStart}
                      onChange={(e) => setReportStart(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Akhir Periode</label>
                    <input
                      type="date"
                      required
                      value={reportEnd}
                      onChange={(e) => setReportEnd(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 text-white"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGenerateReport(false)}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isGeneratingReport}
                    className="px-4 py-1.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingReport ? 'Membuat Laporan...' : 'Terbitkan Laporan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
