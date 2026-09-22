import React, { useState, useEffect } from 'react';
import {
  Brain,
  Search,
  Sparkles,
  FileText,
  Upload,
  Database,
  Filter,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  RefreshCw,
  Tag,
  BookOpen,
  Plus
} from 'lucide-react';
import { TenantRegistrationResponse } from '../types';

interface IntelligenceHubScreenProps {
  tenant: TenantRegistrationResponse | null;
  onBack?: () => void;
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
}) => {
  const isValidUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const tenantId = isValidUuid(tenant?.tenant_id) ? tenant!.tenant_id : 'd1159d6d-0044-42ea-8007-d549a0011402';
  const [activeTab, setActiveTab] = useState<'search' | 'documents' | 'ingest' | 'decay'>('search');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchLatency, setSearchLatency] = useState<number | null>(null);

  // Documents list state
  const [documents, setDocuments] = useState<MemoryDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // Ingestion form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('knowledge');
  const [newClassification, setNewClassification] = useState<'public' | 'internal' | 'confidential' | 'restricted'>('internal');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Decay consolidation state
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [decayReport, setDecayReport] = useState<any | null>(null);

  // Fetch documents on load & tab switch
  useEffect(() => {
    if (activeTab === 'documents') {
      fetchDocuments();
    }
  }, [activeTab, tenantId]);

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
          query: searchQuery.trim(),
          category: selectedCategory === 'all' ? undefined : selectedCategory,
          limit: 6,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSearchResults(data.results || []);
      setSearchLatency(Math.round(performance.now() - start));
    } catch (err: any) {
      console.error('Search error:', err);
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
          title: newTitle.trim(),
          content: newContent.trim(),
          category: newCategory,
          data_classification: newClassification,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setIngestSuccess(`Dokumen '${result.title}' berhasil disimpan & dibagi ke dalam ${result.chunks_count} chunk bervektor 1536!`);
      setNewTitle('');
      setNewContent('');
      fetchDocuments();
    } catch (err: any) {
      setIngestError(err.message || 'Gagal menyimpan dokumen memori');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleRunDecayConsolidate = async () => {
    setIsConsolidating(true);
    setDecayReport(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/memory/consolidate`, {
        method: 'POST',
      });
      const data = await res.json();
      setDecayReport(data);
      fetchDocuments();
    } catch (err: any) {
      console.error('Consolidation failed:', err);
    } finally {
      setIsConsolidating(false);
    }
  };

  return (
    <div id="intelligence-hub-screen" className="min-h-screen bg-[#070D18] text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Breadcrumb & Identity */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/10">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Intelligence Hub & Company Brain
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                  F.01-MEMFLOW
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Pencarian Semantik Hybrid HNSW 1536 Dimensi, Ingestion Terisolasi RLS, & Pengelolaan Memori Jangka Panjang
              </p>
            </div>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
            >
              Kembali ke Feature Hub
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-white/5 pb-2">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'search'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Pencarian Global Hybrid (RRF)</span>
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'documents'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Dokumen Memori ({documents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ingest')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'ingest'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Memori Baru</span>
          </button>

          <button
            onClick={() => setActiveTab('decay')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'decay'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Konsolidasi & Peluruhan (Decay)</span>
          </button>
        </div>

        {/* TAB 1: HYBRID GLOBAL SEARCH */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Search Input Bar */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/10 shadow-xl backdrop-blur">
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="relative flex items-center">
                  <Search className="w-5 h-5 text-emerald-400 absolute left-4 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari SOP kebijakan, data klien, instruksi alur kerja, dokumen tender..." // allowlist: UI search input guidance text
                    className="w-full pl-12 pr-28 py-3.5 rounded-2xl bg-black/40 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" // allowlist: Tailwind placeholder styling class
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="absolute right-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {isSearching ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Mencari...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Cari</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                    <span>Filter Kategori:</span>
                    {['all', 'knowledge', 'sop', 'crm', 'finance'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg uppercase tracking-wider text-[10px] font-semibold transition-colors cursor-pointer ${
                          selectedCategory === cat
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> RLS Filter Aktif
                    </span>
                    <span>•</span>
                    <span>pgvector HNSW (kNN) + tsvector (RRF)</span>
                  </div>
                </div>
              </form>
            </div>

            {/* Results Overview */}
            {hasSearched && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>
                    Ditemukan <strong className="text-emerald-400">{searchResults.length}</strong> hasil memori untuk &ldquo;{searchQuery}&rdquo;
                  </span>
                  {searchLatency !== null && (
                    <span className="font-mono text-[11px]">Latensi: {searchLatency}ms</span>
                  )}
                </div>

                {searchResults.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-white/5 border border-white/5">
                    <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-300">Tidak ada memori yang cocok ditemukan</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Coba gunakan kata kunci berbeda, atau simpan dokumen pengetahuan baru melalui tab &ldquo;Tambah Memori Baru&rdquo;.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {searchResults.map((item, idx) => (
                      <div
                        key={item.chunk_id || item.document_id || idx}
                        className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-emerald-500/40 transition-all space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-white leading-snug">
                              {item.title}
                            </h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                              RRF {(item.rrf_score * 100).toFixed(2)}
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed line-clamp-4 bg-black/20 p-2.5 rounded-xl border border-white/5 font-sans">
                            {item.content || item.summary}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 uppercase text-[10px] font-semibold">
                              {item.category}
                            </span>
                            {item.similarity !== undefined && (
                              <span className="font-mono text-[10px] text-sky-400">
                                Sim: {(item.similarity * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Confidence: {((item.confidence || 1.0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DOCUMENTS CATALOG */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">Indeks Memori Organisasi</h2>
                <p className="text-xs text-slate-400">Dokumen referensi pengetahuan yang tersimpan di Supabase pgvector</p>
              </div>
              <button
                onClick={fetchDocuments}
                disabled={isLoadingDocs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDocs ? 'animate-spin' : ''}`} />
                <span>Segarkan</span>
              </button>
            </div>

            {docsError && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{docsError}</span>
              </div>
            )}

            {isLoadingDocs ? (
              <div className="p-8 text-center text-xs text-slate-500">Memuat katalog memori...</div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">Belum ada memori terindeks</p>
                <p className="text-xs text-slate-500">Tambahkan SOP, kebijakan, atau dokumen tender pertama Anda.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-slate-400 font-semibold border-b border-white/10">
                    <tr>
                      <th className="p-3.5">Judul Dokumen</th>
                      <th className="p-3.5">Kategori</th>
                      <th className="p-3.5">Klasifikasi</th>
                      <th className="p-3.5">Confidence</th>
                      <th className="p-3.5">Akses</th>
                      <th className="p-3.5">Dibuat Pada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-3.5 font-medium text-white max-w-xs truncate">
                          {doc.title}
                        </td>
                        <td className="p-3.5 uppercase font-mono text-[10px] text-slate-400">
                          {doc.category}
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            doc.data_classification === 'restricted'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : doc.data_classification === 'confidential'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {doc.data_classification}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-emerald-400">
                          {((doc.confidence ?? 1.0) * 100).toFixed(0)}%
                        </td>
                        <td className="p-3.5 font-mono text-slate-400">
                          {doc.access_count ?? 0}x
                        </td>
                        <td className="p-3.5 text-slate-400 text-[11px]">
                          {new Date(doc.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INGEST NEW MEMORY */}
        {activeTab === 'ingest' && (
          <div className="max-w-2xl mx-auto p-6 rounded-3xl bg-slate-900/60 border border-white/10 shadow-xl space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Simpan Dokumen ke Company Brain</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Teks akan dipartisi secara cerdas menjadi potongan teks (chunks) dan di-embed ke vektor 1536 menggunakan Gemini API dengan RLS tenant isolation.
              </p>
            </div>

            {ingestSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{ingestSuccess}</span>
              </div>
            )}

            {ingestError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{ingestError}</span>
              </div>
            )}

            <form onSubmit={handleIngest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Judul Dokumen / Memori</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Mis. SOP Penanganan Insiden Keamanan Finansial v2.1" // allowlist: UI input example text
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Kategori</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="knowledge">Knowledge / Pengetahuan</option>
                    <option value="sop">Standar Operasional (SOP)</option>
                    <option value="crm">Klien & CRM</option>
                    <option value="finance">Finansial & Kebijakan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Klasifikasi Data</label>
                  <select
                    value={newClassification}
                    onChange={(e: any) => setNewClassification(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="internal">Internal Organisasi</option>
                    <option value="confidential">Confidential (Rahasia)</option>
                    <option value="restricted">Restricted (Sangat Terbatas)</option>
                    <option value="public">Publik</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Isi Dokumen / Catatan Memori</label>
                <textarea
                  required
                  rows={6}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Masukkan isi pedoman, aturan bisnis, atau pengetahuan operasional di sini..." // allowlist: UI textarea guidance prompt
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>

              <button
                type="submit"
                disabled={isIngesting || !newTitle.trim() || !newContent.trim()}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isIngesting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sedang Menyimpan & Meng-embed Vektor...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Simpan & Vektorisasi ke Supabase</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: DECAY CONSOLIDATION */}
        {activeTab === 'decay' && (
          <div className="max-w-2xl mx-auto p-6 rounded-3xl bg-slate-900/60 border border-white/10 shadow-xl space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Konsolidasi & Peluruhan Memori Jangka Panjang</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                F.01-MEMFLOW menerapkan rumus peluruhan eksponensial:
                <code className="text-emerald-400 block font-mono text-[11px] mt-1 bg-black/40 p-2 rounded-lg border border-white/5">
                  new_conf = max(0.10, current_conf * exp(-decay_factor * (days_elapsed / 7.0)))
                </code>
                Dokumen yang jarang diakses akan perlahan menyusut bobot relevansinya dalam perangkingan RRF.
              </p>
            </div>

            {decayReport && (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Hasil Konsolidasi Memori:
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>Dokumen Dipindai: <strong className="text-white">{decayReport.scanned_documents}</strong></div>
                  <div>Dokumen Diluruhkan: <strong className="text-emerald-400">{decayReport.decayed_documents}</strong></div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleRunDecayConsolidate}
              disabled={isConsolidating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {isConsolidating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sedang Menjalankan Konsolidasi...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Jalankan Konsolidasi Peluruhan Sekarang</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
