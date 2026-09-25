import React, { useState, useEffect } from 'react';
import {
  Zap,
  Layers,
  Database,
  Search,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Clock,
  Cpu,
  RefreshCw,
  Send,
  Sliders,
  DollarSign,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface TokenSavingsSummary {
  total_queries: number;
  cache_hits: number;
  cache_misses: number;
  cache_hit_rate_pct: number;
  total_tokens_saved: number;
  total_cost_saved_usd: number;
  total_cost_spent_usd: number;
  total_cost_baseline_usd: number;
  avg_latency_saved_ms: number;
}

interface TokenSavingsLogItem {
  id: string;
  request_id: string | null;
  cache_hit: boolean;
  task_type: string;
  original_prompt_tokens: number;
  tokens_saved: number;
  cost_without_cache_usd: number;
  cost_with_cache_usd: number;
  cost_saved_usd: number;
  latency_saved_ms: number;
  model_tier_selected: string;
  model_id_selected: string;
  similarity_score: number | null;
  created_at: string;
}

interface Props {
  tenantId: string;
}

export const TokenOptimizationScreen: React.FC<Props> = ({ tenantId }) => {
  const [summary, setSummary] = useState<TokenSavingsSummary | null>(null);
  const [logs, setLogs] = useState<TokenSavingsLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<'ALL' | 'HITS' | 'MISSES'>('ALL');
  
  // Interactive test inferencing state
  const [promptInput, setPromptInput] = useState<string>('Klasifikasikan sentimen keluhan pelanggan ini: pesanan belum tiba.');
  const [taskTypeInput, setTaskTypeInput] = useState<string>('classification');
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sumRes, logRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/tokenopt/summary`),
        fetch(`/api/v1/tenants/${tenantId}/tokenopt/logs?limit=50`),
      ]);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }
      if (logRes.ok) {
        const logData = await logRes.json();
        setLogs(logData);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat analitik penghematan token.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const handleTestInference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;

    setTestLoading(true);
    setTestResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/v1/orchestration/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          task_type: taskTypeInput,
          prompt: promptInput,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Inferensi gagal (${res.status})`);
      }

      const data = await res.json();
      setTestResult(data);
      // Refresh summary & audit log
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menjalankan pengujian inferensi.');
    } finally {
      setTestLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filterType === 'HITS') return log.cache_hit;
    if (filterType === 'MISSES') return !log.cache_hit;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-slate-100">
      {/* Header Hub */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Zap className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Optimasi Token & Semantic Cache
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              F.01-TOKENOPT
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Penghematan token otomatis berbasis pencarian kesamaan vektor pgvector dan klasifikasi tingkat model dinamis.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition cursor-pointer self-start md:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Segarkan Data
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Cache Hit Rate */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Efisiensi Cache</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white tracking-tight">
              {summary ? `${summary.cache_hit_rate_pct}%` : '0.0%'}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
              <span>Hits: {summary?.cache_hits || 0}</span>
              <span>Total: {summary?.total_queries || 0} kueri</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, summary?.cache_hit_rate_pct || 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Metric 2: Tokens Saved */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Token Terselamatkan</span>
            <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
              <Database className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white tracking-tight">
              {summary ? summary.total_tokens_saved.toLocaleString('id-ID') : '0'}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              100% token keluaran dihemat saat terjadi kesamaan kosinus pgvector &ge; 0.92
            </p>
          </div>
        </div>

        {/* Metric 3: Cost Saved USD */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Biaya Dihemat</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-emerald-400 tracking-tight">
              ${summary ? summary.total_cost_saved_usd.toFixed(4) : '0.0000'}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
              <span>Pengeluaran: ${summary ? summary.total_cost_spent_usd.toFixed(4) : '0.0000'}</span>
              <span>Tolok Ukur: ${summary ? summary.total_cost_baseline_usd.toFixed(4) : '0.0000'}</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Latency Saved */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Latensi Ditekan</span>
            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-white tracking-tight">
              {summary ? `${summary.avg_latency_saved_ms} ms` : '0 ms'}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Pencarian cache lokal ~15ms vs panggilan jaringan provider eksternal ~1.200ms
            </p>
          </div>
        </div>
      </div>

      {/* Model Tiering Architectural Overview */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Arsitektur Tingkat Model Otomatis
            </h2>
          </div>
          <span className="text-xs text-slate-400">Routing Adaptif Tanpa Konfigurasi Manual</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  Tingkat 1: Ringan
                </span>
                <span className="text-[11px] text-slate-400 font-mono">$0.00008 / 1k</span>
              </div>
              <div className="text-sm font-semibold text-white">meta/llama-3.2-3b-instruct</div>
              <p className="text-xs text-slate-400 mt-1">
                Klasifikasi sentimen, ekstraksi intent kueri, dan verifikasi biner cepat.
              </p>
            </div>
            <div className="mt-3 text-[11px] text-slate-500">Konteks &lt; 100 token</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                  Tingkat 2: Seimbang
                </span>
                <span className="text-[11px] text-slate-400 font-mono">$0.00015 / 1k</span>
              </div>
              <div className="text-sm font-semibold text-white">meta/llama-3.2-11b-vision-instruct</div>
              <p className="text-xs text-slate-400 mt-1">
                Percakapan layanan pelanggan, perangkuman pesan, dan draf tanggapan harian.
              </p>
            </div>
            <div className="mt-3 text-[11px] text-slate-500">Konteks standar 100-800 token</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-purple-400 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                  Tingkat 3: Penalaran Tinggi
                </span>
                <span className="text-[11px] text-slate-400 font-mono">$0.00125 / 1k</span>
              </div>
              <div className="text-sm font-semibold text-white">meta/llama-3.3-70b-instruct</div>
              <p className="text-xs text-slate-400 mt-1">
                Analisis keuangan mendalam, perancangan arsitektur sistem, dan eksekusi strategi multi-langkah.
              </p>
            </div>
            <div className="mt-3 text-[11px] text-slate-500">Konteks &gt; 800 token atau kueri kompleks</div>
          </div>
        </div>
      </div>

      {/* Interactive Semantic Cache Tester */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Uji Coba Langsung Kesamaan Semantik
            </h2>
          </div>
          <span className="text-xs text-slate-400">Verifikasi respons instan saat cache hit</span>
        </div>

        <form onSubmit={handleTestInference} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-3">
              <label className="block text-xs text-slate-400 mb-1">Masukan Prompt</label>
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tipe Tugas</label>
              <select
                value={taskTypeInput}
                onChange={(e) => setTaskTypeInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="classification">classification (Tingkat 1)</option>
                <option value="text_generation">text_generation (Tingkat 2)</option>
                <option value="planning">planning (Tingkat 3)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={testLoading || !promptInput.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {testLoading ? 'Memproses Inferensi...' : 'Kirim Inferensi'}
            </button>
          </div>
        </form>

        {testResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">Status Cache:</span>
                {testResult.raw_response?.cached ? (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> CACHE HIT (Hemat 100% Token)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    CACHE MISS (Tersimpan ke pgvector)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>Model: <strong className="text-white">{testResult.model_id}</strong></span>
                <span>Latensi: <strong className="text-white">{testResult.latency_ms} ms</strong></span>
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 block mb-1">Keluaran Agen / Model:</span>
              <div className="p-3 rounded-lg bg-slate-900 text-sm text-slate-200 font-mono whitespace-pre-wrap">
                {testResult.content || '(Respons kosong)'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Audit Logs Table */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Log Audit Penghematan Token
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Riwayat audit transaksional seluruh panggilan inferensi pada tenant ini.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 self-start sm:self-auto">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                filterType === 'ALL'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({logs.length})
            </button>
            <button
              onClick={() => setFilterType('HITS')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                filterType === 'HITS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cache Hit
            </button>
            <button
              onClick={() => setFilterType('MISSES')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                filterType === 'MISSES'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cache Miss
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-800/40 border border-dashed border-slate-700">
            <Database className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-300">Belum Ada Catatan Log</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Jalankan kueri inferensi di atas untuk mulai mengumpulkan data penghematan token.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-700">
                <tr>
                  <th className="py-3 px-3">Waktu</th>
                  <th className="py-3 px-3">Status Cache</th>
                  <th className="py-3 px-3">Tipe Tugas</th>
                  <th className="py-3 px-3">Tingkat Model</th>
                  <th className="py-3 px-3 text-right">Token Hemat</th>
                  <th className="py-3 px-3 text-right">Biaya Awal</th>
                  <th className="py-3 px-3 text-right">Biaya Aktual</th>
                  <th className="py-3 px-3 text-right">Penghematan</th>
                  <th className="py-3 px-3 text-right">Latensi Hemat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLogs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3">
                      {item.cache_hit ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          HIT {item.similarity_score ? `(${(item.similarity_score * 100).toFixed(1)}%)` : ''}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-700 text-slate-300">
                          MISS
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                      {item.task_type}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {item.model_tier_selected.replace('TIER_', 'T')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-white">
                      {item.tokens_saved > 0 ? item.tokens_saved.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                      ${item.cost_without_cache_usd.toFixed(5)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                      ${item.cost_with_cache_usd.toFixed(5)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                      {item.cost_saved_usd > 0 ? `+$${item.cost_saved_usd.toFixed(5)}` : '$0.00000'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                      {item.latency_saved_ms > 0 ? `${item.latency_saved_ms} ms` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
