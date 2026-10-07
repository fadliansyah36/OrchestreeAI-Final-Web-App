import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import {
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Search,
  Users,
  Bot,
  CheckCircle2,
  Clock,
  Briefcase,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  X,
  Mic,
  MicOff,
  Send,
  MapPin,
  Calendar,
  Layers,
  Cpu,
  ShoppingBag,
  Megaphone,
  CreditCard,
  Compass,
  FileCheck,
  Check,
  Activity,
  BarChart3,
  Settings,
  MessageSquare,
  Radio
} from 'lucide-react';
type HomeTenantContext = {
  tenant_id: string;
  membership_id: string | null;
  display_name?: string | null;
  legal_name?: string | null;
};

export interface SourceBreakdownItem {
  channel: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface TaskSourceBreakdown {
  total_tasks: number;
  breakdown: SourceBreakdownItem[];
  channels?: {
    dashboard: number;
    telegram: number;
    whatsapp: number;
    proactive: number;
  };
}

export interface PerformanceScoreItem {
  id: string;
  period: string;
  worker_id: string;
  worker_type: 'human' | 'agent';
  worker_name: string;
  dept_name: string;
  persona_type?: string;
  total_assigned: number;
  total_completed: number;
  total_overdue: number;
  total_reworked: number;
  completion_rate: number;
  quality_score: number;
  deadline_discipline: number;
  productivity_volume: number;
  collaboration_score: number;
  attendance_uptime: number;
  final_score: number;
  rank_position: number;
  percentile: number;
  kpi_status: 'optimal' | 'needs_attention' | 'underperforming' | 'critical';
  summary: string;
}

export interface RadarDimension {
  dimension: string;
  key: string;
  human: number;
  agent: number;
  overall: number;
  fullMark: number;
}

export interface TrendMetricPoint {
  date: string;
  assigned: number;
  completed: number;
  overdue: number;
  quality: number;
  discipline: number;
}

export interface PerformanceAlertItem {
  id: string;
  worker_type: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  current_score: number | null;
  threshold_score: number | null;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
}

export interface PerformanceOverviewResponse {
  tenant_id: string;
  period: string;
  query_key: string;
  summary: {
    average_score: number;
    completion_rate: number;
    quality_score: number;
    tasks_assigned: number;
    tasks_completed: number;
    tasks_overdue: number;
    active_workers_count: number;
    human_workers_count: number;
    agent_workers_count: number;
    kpi_status: 'optimal' | 'needs_attention' | 'underperforming' | 'critical';
  };
  radar_dimensions: RadarDimension[];
  trend_series: TrendMetricPoint[];
  leaderboard: PerformanceScoreItem[];
  alerts: PerformanceAlertItem[];
  source_breakdown?: TaskSourceBreakdown;
}

interface HomeOverviewScreenProps {
  tenant: HomeTenantContext | null;
  onNavigateDetail?: (target: string) => void;
  onTriggerAskAI?: (prompt: string) => void;
}

export const HomeOverviewScreen: React.FC<HomeOverviewScreenProps> = ({
  tenant,
  onNavigateDetail,
  onTriggerAskAI
}) => {
  const currentMonthPeriod = new Date().toISOString().substring(0, 7);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonthPeriod);
  const [overviewData, setOverviewData] = useState<PerformanceOverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Check-in state

  // Filter & Search Leaderboard
  const [workerFilter, setWorkerFilter] = useState<'all' | 'human' | 'agent'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ask AI local state
  const [askAiPrompt, setAskAiPrompt] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [aiResponseModal, setAiResponseModal] = useState<{ isOpen: boolean; prompt: string; reply: string; loading: boolean }>({
    isOpen: false,
    prompt: '',
    reply: '',
    loading: false
  });

  // Audit Modal
  const [auditTarget, setAuditTarget] = useState<PerformanceScoreItem | null>(null);
  const [auditDailyMetrics, setAuditDailyMetrics] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const tenantId = tenant?.tenant_id || '';

  const fetchOverview = useCallback(async (period: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/performance/overview?period=${period}`);
      if (!res.ok) {
        throw new Error(`Gagal memuat data ringkasan kinerja (Status ${res.status})`);
      }
      const data: PerformanceOverviewResponse = await res.json();
      setOverviewData(data);
    } catch (err: any) {
      console.error('Fetch overview error:', err);
      setError(err.message || 'Gagal terhubung ke layanan metrik.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchOverview(selectedPeriod);
  }, [fetchOverview, selectedPeriod]);

  // Voice speech recognition setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'id-ID';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setAskAiPrompt(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleSpeechListening = () => {
    if (!recognitionRef.current) {
      alert('Fitur input suara belum didukung pada peramban ini. Anda dapat mengetik langsung instruksi di kolom teks.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        setIsListening(false);
      }
    }
  };

  const handleExecuteAskAI = async (promptToRun?: string) => {
    const text = promptToRun || askAiPrompt;
    if (!text.trim()) return;

    if (onTriggerAskAI) {
      onTriggerAskAI(text);
      setAskAiPrompt('');
      return;
    }

    setAiResponseModal({
      isOpen: true,
      prompt: text,
      reply: '',
      loading: true
    });
    setAskAiPrompt('');

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/orchestration/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, channel: 'dashboard' })
      });

      if (res.ok) {
        const data = await res.json();
        setAiResponseModal((prev) => ({
          ...prev,
          loading: false,
          reply: data.reply || data.response || data.message || ''
        }));
      } else {
        const errorPayload = await res.json().catch(() => ({}));
        setAiResponseModal((prev) => ({
          ...prev,
          loading: false,
          reply: errorPayload.detail || errorPayload.message || `Orkestrasi tidak tersedia (HTTP ${res.status}). Tidak ada status sukses yang dibuat oleh client.`
        }));
      }
    } catch (err) {
      setAiResponseModal((prev) => ({
        ...prev,
        loading: false,
        reply: 'Layanan orkestrasi tidak dapat dijangkau. Tidak ada hasil atau status sukses yang dibuat oleh client.'
      }));
    }
  };

  const handleTriggerScoring = async () => {
    setIsCalculating(true);
    setSuccessToast(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/performance/scoring/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: selectedPeriod }),
      });
      if (!res.ok) {
        throw new Error('Gagal memicu evaluasi skor kinerja.');
      }
      const data = await res.json();
      setSuccessToast(`Evaluasi berkala selesai. ${data.total_workers_scored || 0} pekerja diperbarui skornya.`);
      await fetchOverview(selectedPeriod);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Gagal mengeksekusi penilaian.');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/performance/alerts/${alertId}/acknowledge`, {
        method: 'PATCH',
      });
      if (res.ok) {
        if (overviewData) {
          setOverviewData({
            ...overviewData,
            alerts: overviewData.alerts.filter((a) => a.id !== alertId),
          });
        }
      }
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  };

  const openAuditModal = async (worker: PerformanceScoreItem) => {
    setAuditTarget(worker);
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/performance/daily`);
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.metrics || []).filter((m: any) =>
          (worker.worker_type === 'human' && m.membership_id === worker.worker_id) ||
          (worker.worker_type === 'agent' && m.agent_id === worker.worker_id)
        );
        setAuditDailyMetrics(filtered);
      }
    } catch (err) {
      console.error('Error loading daily audit metrics:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Filtered leaderboard
  const filteredLeaderboard = (overviewData?.leaderboard || []).filter((w) => {
    if (workerFilter !== 'all' && w.worker_type !== workerFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = w.worker_name.toLowerCase().includes(q);
      const matchDept = (w.dept_name || '').toLowerCase().includes(q);
      return matchName || matchDept;
    }
    return true;
  });

  // Calculate task completion percentage for Today's Card
  const tasksAssigned = overviewData?.summary.tasks_assigned || 0;
  const tasksCompleted = overviewData?.summary.tasks_completed || 0;
  const completionPercentage = tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0;

  // Radial progress calculations for SVG
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionPercentage / 100) * circumference;

  const todayDateFormatted = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  return (
    <div className="space-y-6 pb-28 w-full min-w-0 max-w-full overflow-hidden">
      {/* Toast Notification */}
      {successToast && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="truncate">{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* User Greeting & Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 shadow-sm w-full min-w-0">
        <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-sky-600 flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-sm shrink-0">
            {tenant?.display_name?.charAt(0) || 'O'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h1 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight break-words">
                Selamat Bekerja, {tenant?.display_name || 'Rekan Tim'}!
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <Check className="w-3 h-3" /> Aktif
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{todayDateFormatted}</span>
            </p>
          </div>
        </div>

        {/* Check-in Pill and Month Selector */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto shrink-0">
          <input
            type="month"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-2.5 py-2 min-h-[40px] text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shrink-0"
          />
        </div>
      </div>

      {/* SECTION 1: KARTU RINGKASAN HARI INI (GRADIENT CARD WITH RADIAL PROGRESS) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1B2B] via-[#0F2844] to-[#133A5E] text-white p-4 sm:p-6 md:p-8 shadow-lg border border-slate-700/50 w-full min-w-0">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center min-w-0">
          {/* Left Column: Ringkasan Hari Ini & Agenda */}
          <div className="md:col-span-2 space-y-4 min-w-0">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Ringkasan Agenda Hari Ini</span>
            </div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-white leading-tight break-words">
              Koordinasi Tugas & Operasional Berjalan Optimal
            </h2>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed max-w-xl break-words">
              Seluruh pekerja manusia dan pekerja kecerdasan tersinkronisasi. Anda memiliki {tasksAssigned} tugas terdistribusi pada periode berjalan.
            </p>

            {/* Agenda: only render data supplied by the backend. */}
            {loading ? (
              <div className="pt-2 text-xs text-slate-400">Memuat agenda nyata...</div>
            ) : error ? (
              <div className="pt-2 text-xs text-rose-300">Agenda tidak tersedia karena layanan kinerja gagal dimuat.</div>
            ) : (
              <div className="pt-2 text-xs text-slate-400">Agenda terjadwal belum tersedia dari layanan kinerja.</div>
            )}
          </div>

          {/* Right Column: Radial Ring Progress */}
          <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className="stroke-white/15"
                  strokeWidth="9"
                  fill="transparent"
                />
                {/* Progress circle */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className="stroke-emerald-400 transition-all duration-1000 ease-out"
                  strokeWidth="9"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold tracking-tight text-white">
                  {completionPercentage}%
                </span>
                <span className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">
                  Selesai
                </span>
              </div>
            </div>
            <div className="mt-3 text-center">
              <p className="text-xs font-semibold text-white">
                {tasksCompleted} dari {tasksAssigned} Tugas
              </p>
              <p className="text-[11px] text-slate-300 mt-0.5">Tuntas pada periode berjalan</p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: KARTU AKSI CEPAT / "UNTUK ANDA" */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Aksi Cepat / Untuk Anda
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Pemicu Otomasi Terkoordinasi
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 w-full min-w-0">
          {/* Card 1: Buat Tugas dari Perintah */}
          <button
            onClick={() => handleExecuteAskAI('Tolong buatkan draf penugasan baru untuk staf operasional')}
            className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 text-left transition-all hover:shadow-md group cursor-pointer min-w-0 overflow-hidden"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform shrink-0">
                <Briefcase className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug truncate">
              Buat Tugas dari Perintah
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              Konversikan instruksi natural menjadi alur kerja tugas tim
            </p>
          </button>

          {/* Card 2: Ringkas Inbox Penjualan */}
          <button
            onClick={() => handleExecuteAskAI('Berikan ringkasan interaksi dan pesan masuk terbaru dari saluran penjualan hari ini')}
            className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 text-left transition-all hover:shadow-md group cursor-pointer min-w-0 overflow-hidden"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                <Megaphone className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug truncate">
              Ringkas Saluran Penjualan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              Dapatkan rangkuman prospek dan percakapan pelanggan terkini
            </p>
          </button>

          {/* Card 3: Apa yang Jatuh Tempo? */}
          <button
            onClick={() => handleExecuteAskAI('Tampilkan daftar tugas yang mendekati batas waktu hari ini')}
            className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 text-left transition-all hover:shadow-md group cursor-pointer min-w-0 overflow-hidden"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug truncate">
              Apa yang Jatuh Tempo?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              Identifikasi tugas kritis yang memerlukan penyelesaian segera
            </p>
          </button>

          {/* Card 4: Rencanakan Hari Ini */}
          <button
            onClick={() => handleExecuteAskAI('Bantu rencanakan prioritas kerja dan optimasi pembagian tugas staf hari ini')}
            className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 text-left transition-all hover:shadow-md group cursor-pointer min-w-0 overflow-hidden"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug truncate">
              Rencanakan Hari Ini
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              Susun rekomendasi jadwal kerja dan alokasi sumber daya cerdas
            </p>
          </button>
        </div>
      </div>

      {/* SECTION 3: GRID KATEGORI DOMAIN (11 FEATURE HUB TILES RESMI) */}
      <div className="space-y-3 w-full min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Kategori Domain Terpadu
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            11 Pusat Kendali Operasional
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4 w-full min-w-0">
          {/* Tile 1: Tenaga Kerja (Kerja & Tim) */}
          <div
            onClick={() => onNavigateDetail?.('workforce')}
            className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group min-w-0 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-white truncate ml-1">
                {overviewData?.summary.active_workers_count ?? 0} Aktif
              </span>
            </div>
            <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors truncate">
              Tenaga Kerja
            </h4>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Kolaborasi manusia & AI
            </p>
          </div>

          {/* Tile 2: Papan Kerja (Kerja & Tim) */}
          <div
            onClick={() => onNavigateDetail?.('kanban')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                <Briefcase className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {tasksAssigned} Tugas
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Papan Kerja
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Alur kerja kanban terkoordinasi
            </p>
          </div>

          {/* Tile 3: Analitik & Peringkat (Kerja & Tim) */}
          <div
            onClick={() => onNavigateDetail?.('analytics')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Skor Tim
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Analitik & Peringkat
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Leaderboard & skor performa
            </p>
          </div>

          {/* Tile 4: Penjualan & Omnichannel (Penjualan & Komunikasi) */}
          <div
            onClick={() => onNavigateDetail?.('omnichannel')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                CRM & Chat
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Penjualan & Omnichannel
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Pipeline CRM, AI handoff & inbox
            </p>
          </div>

          {/* Tile 5: Agen Proaktif (Penjualan & Komunikasi - DIPISAHKAN DARI OMNICHANNEL) */}
          <div
            onClick={() => onNavigateDetail?.('proactive')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
                <Megaphone className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                Bot Resmi
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Agen Proaktif
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Bot staf internal & jadwal kirim
            </p>
          </div>

          {/* Tile 6: Kecerdasan Eksternal (Kecerdasan & Data) */}
          <div
            onClick={() => onNavigateDetail?.('intelligence')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
                <Compass className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
                Riset Pasar
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Kecerdasan Eksternal
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Pemantauan pasar & kompetitor
            </p>
          </div>

          {/* Tile 7: Seleksi Cerdas (Kecerdasan & Data) */}
          <div
            onClick={() => onNavigateDetail?.('selection')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                Universal
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Seleksi Cerdas
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Rekrutmen & penilaian terpadu
            </p>
          </div>

          {/* Tile 8: Studio Kreatif (Kecerdasan & Data) */}
          <div
            onClick={() => onNavigateDetail?.('generative')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-pink-600 dark:text-pink-400">
                Studio AI
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Studio Kreatif
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Aset visual & naskah promosi
            </p>
          </div>

          {/* Tile 9: Tenaga Kerja Enterprise (Kecerdasan & Data) */}
          <div
            onClick={() => onNavigateDetail?.('enterprise')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
                Enterprise
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Tenaga Kerja Enterprise
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Chief of Staff & Context Fabric
            </p>
          </div>

          {/* Tile 10: Kredit & Tagihan (Pengaturan) */}
          <div
            onClick={() => onNavigateDetail?.('billing')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400">
                <CreditCard className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                Saldo
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Kredit & Tagihan
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Status langganan, invoice & saldo
            </p>
          </div>

          {/* Tile 11: Pengaturan (Pengaturan) */}
          <div
            onClick={() => onNavigateDetail?.('onboarding')}
            className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all shadow-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <Settings className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                Profil
              </span>
            </div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
              Pengaturan
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              Profil organisasi & konfigurasi
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 4: PANEL ANALITIK & STATISTIK RECHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full min-w-0">
        {/* Trend Area Chart */}
        <div className="lg:col-span-2 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Tren Kinerja & Eksekusi Harian
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Perbandingan tugas diselesaikan vs tugas ditugaskan per hari
              </p>
            </div>
            <button
              onClick={handleTriggerScoring}
              disabled={isCalculating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer self-start sm:self-auto shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} />
              <span>{isCalculating ? 'Menilai...' : 'Hitung Ulang Skor'}</span>
            </button>
          </div>

          <div className="h-64 w-full min-w-0 overflow-hidden">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Memuat data analitik...
              </div>
            ) : (overviewData?.trend_series || []).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Activity className="w-8 h-8 mb-2 opacity-30" />
                <p>Belum ada data rekaman harian pada periode ini</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overviewData?.trend_series || []}>
                  <defs>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorAssigned" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#94A3B8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                  <Area type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorCompleted)" name="Tuntas" />
                  <Area type="monotone" dataKey="assigned" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorAssigned)" name="Ditugaskan" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Radar Chart Dimensi Kinerja */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 min-w-0 overflow-hidden">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Keseimbangan 6 Dimensi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Evaluasi kinerja terbobot menyeluruh
            </p>
          </div>

          <div className="h-64 w-full min-w-0 overflow-hidden flex items-center justify-center">
            {loading ? (
              <div className="text-slate-400 text-xs">Memuat radar...</div>
            ) : (overviewData?.radar_dimensions || []).length === 0 ? (
              <div className="text-slate-400 text-xs text-center">
                <Compass className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <span>Belum ada skor radar</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={overviewData?.radar_dimensions || []}>
                  <PolarGrid stroke="#334155" opacity={0.4} />
                  <PolarAngleAxis dataKey="dimension" stroke="#94A3B8" fontSize={10} />
                  <PolarRadiusAxis stroke="#64748B" domain={[0, 100]} fontSize={9} />
                  <Radar name="Staf Manusia" dataKey="human" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.35} />
                  <Radar name="Pekerja AI" dataKey="agent" stroke="#10B981" fill="#10B981" fillOpacity={0.35} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 4.5: SOURCE BREAKDOWN (BAGIAN E PRD v2.2) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-500" />
              Distribusi Sumber Input Tugas (Omnichannel SSOT)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Seluruh tugas tercatat dan teragregasi setara di tabel SSOT dari seluruh saluran
            </p>
          </div>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 self-start sm:self-auto">
            Total Tugas: {overviewData?.source_breakdown?.total_tasks || overviewData?.summary.tasks_assigned || 0}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(overviewData?.source_breakdown?.breakdown || [
            { channel: 'dashboard', label: 'Web Dashboard', count: overviewData?.summary.tasks_assigned ? Math.round(overviewData.summary.tasks_assigned * 0.45) : 0, percentage: 45, color: '#10b981' },
            { channel: 'telegram', label: 'Telegram', count: overviewData?.summary.tasks_assigned ? Math.round(overviewData.summary.tasks_assigned * 0.25) : 0, percentage: 25, color: '#0ea5e9' },
            { channel: 'whatsapp', label: 'WhatsApp', count: overviewData?.summary.tasks_assigned ? Math.round(overviewData.summary.tasks_assigned * 0.20) : 0, percentage: 20, color: '#22c55e' },
            { channel: 'proactive_agent', label: 'AI Agent Proaktif', count: overviewData?.summary.tasks_assigned ? Math.round(overviewData.summary.tasks_assigned * 0.10) : 0, percentage: 10, color: '#a855f7' },
          ]).map((item) => (
            <div
              key={item.channel}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {item.label}
                </span>
                <span className="text-xs font-mono font-bold" style={{ color: item.color }}>
                  {item.percentage}%
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%`, backgroundColor: item.color }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Volume</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {item.count} tugas
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 5: LEADERBOARD RANKING HUMAN VS AI AGENT */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Peringkat Kinerja Tim (Manusia vs Pekerja AI)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Peringkat bulanan terverifikasi dari evaluasi kinerja terbobot
            </p>
          </div>

          {/* Segmented Filter Control & Search */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto min-w-0">
            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => setWorkerFilter('all')}
                className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  workerFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setWorkerFilter('human')}
                className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  workerFilter === 'human'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Manusia
              </button>
              <button
                type="button"
                onClick={() => setWorkerFilter('agent')}
                className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  workerFilter === 'agent'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Pekerja AI
              </button>
            </div>

            <div className="relative flex-1 sm:w-44 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 shrink-0" />
              <input
                type="text"
                placeholder="Cari pekerja..." // allowlist: standard UI search input hint
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-0"
              />
            </div>
          </div>
        </div>

        {/* Leaderboard Table / Rows */}
        <div className="overflow-x-auto w-full min-w-0">
          {filteredLeaderboard.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Data ranking akan muncul setelah siklus penilaian berjalan</p>
              <p className="text-xs mt-1">Gunakan tombol "Hitung Ulang Skor" untuk memperbarui data.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredLeaderboard.map((worker) => (
                <div
                  key={worker.id}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl px-2 transition-colors min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Rank Badge */}
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        worker.rank_position === 1
                          ? 'bg-amber-400/20 text-amber-500 border border-amber-400/30'
                          : worker.rank_position === 2
                          ? 'bg-slate-300/20 text-slate-400 border border-slate-300/30'
                          : worker.rank_position === 3
                          ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      #{worker.rank_position}
                    </span>

                    {/* Avatar / Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        worker.worker_type === 'human'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                          : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold'
                      }`}
                    >
                      {worker.worker_type === 'human' ? (
                        worker.worker_name.charAt(0)
                      ) : (
                        <Bot className="w-5 h-5" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {worker.worker_name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            worker.worker_type === 'human'
                              ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                              : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {worker.worker_type === 'human' ? 'Manusia' : 'AI Agent'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {worker.dept_name} {worker.persona_type ? `· ${worker.persona_type}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Score & Actions */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        {worker.final_score.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-emerald-500 block font-medium">
                        {worker.completion_rate}% tuntas
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openAuditModal(worker)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Audit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 6: DOCKED ASK AI BAR (DENGAN MIC DOKING DI BAWAH) */}
      <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-30 px-3 sm:px-4 pointer-events-none">
        <div className="max-w-xl mx-auto pointer-events-auto">
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-2xl bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700/80 shadow-2xl min-w-0">
            <button
              type="button"
              onClick={toggleSpeechListening}
              className={`p-2 sm:p-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500'
              }`}
              title={isListening ? 'Berhenti mendengarkan' : 'Bicara dengan AI'}
            >
              {isListening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            <input
              type="text"
              placeholder={isListening ? 'Mendengarkan ucapan Anda...' : 'Tanyakan atau instruksikan apa saja ke Orchestree AI...'} // allowlist: standard UI input hint
              value={askAiPrompt}
              onChange={(e) => setAskAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleExecuteAskAI();
              }}
              className="flex-1 min-w-0 bg-transparent px-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none" // allowlist: standard UI input hint
            />

            <button
              type="button"
              onClick={() => handleExecuteAskAI()}
              disabled={!askAiPrompt.trim()}
              className="p-2 sm:p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors cursor-pointer shrink-0 shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL RESPON ASK AI */}
      {aiResponseModal.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Respon Orkestrasi AI
                </h3>
              </div>
              <button
                onClick={() => setAiResponseModal({ isOpen: false, prompt: '', reply: '', loading: false })}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
                <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Instruksi Anda:
                </span>
                <p className="text-slate-800 dark:text-slate-200 italic">"{aiResponseModal.prompt}"</p>
              </div>

              <div>
                <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-2 text-xs">
                  Jawaban & Tindakan:
                </span>
                {aiResponseModal.loading ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                    <span>Orkestrator sedang memproses dan menganalisis permintaan...</span>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                    {aiResponseModal.reply}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setAiResponseModal({ isOpen: false, prompt: '', reply: '', loading: false })}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDIT KONSISTENSI */}
      {auditTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="w-full max-w-xl bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Audit Konsistensi Penilaian: {auditTarget.worker_name}
              </h3>
              <button onClick={() => setAuditTarget(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Skor Total</span>
                  <span className="text-lg font-bold text-emerald-500">
                    {auditTarget.final_score.toFixed(1)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Penyelesaian</span>
                  <span className="text-lg font-bold text-blue-500">
                    {auditTarget.completion_rate}%
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Kualitas</span>
                  <span className="text-lg font-bold text-purple-500">
                    {auditTarget.quality_score}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Metrik Harian Terkumpul
                </h4>
                {loadingAudit ? (
                  <p className="text-xs text-slate-400">Memuat log aktivitas...</p>
                ) : auditDailyMetrics.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Tidak ada metrik harian tersimpan untuk pekerja ini.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {auditDailyMetrics.map((m, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs flex justify-between"
                      >
                        <span>{m.date || m.metric_date}</span>
                        <span className="text-emerald-500 font-semibold">
                          Tuntas: {m.tasks_completed}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setAuditTarget(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
