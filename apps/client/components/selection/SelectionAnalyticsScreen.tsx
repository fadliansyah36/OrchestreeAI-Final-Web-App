'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  Sliders,
  Activity,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Filter,
  X,
  Search,
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Hash,
  Sparkles,
  Award,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { SelectionInsightPanel, SelectionInsightItem } from './SelectionInsightPanel';

export interface SelectionAnalyticsScreenProps {
  jobId: string;
  tenantId: string;
  jobTitle?: string;
  scoringResults?: any[];
  analytics?: any;
  visualizations?: any[];
  insights?: SelectionInsightItem[];
  onBack?: () => void;
  onSelectEntityForReview?: (entity: any) => void;
}

export function SelectionAnalyticsScreen({
  jobId,
  tenantId,
  jobTitle,
  scoringResults = [],
  analytics = {},
  visualizations = [],
  insights = [],
  onBack,
  onSelectEntityForReview,
}: SelectionAnalyticsScreenProps) {
  // Active interactive filter state
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [filterRecommendation, setFilterRecommendation] = useState<string | null>(null);
  const [filterScoreRange, setFilterScoreRange] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'analytics' | 'insights'>('analytics');
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);

  // KPIs
  const kpis = analytics?.kpi || {
    total_evaluated: scoringResults.length,
    average_score:
      scoringResults.length > 0
        ? Math.round(
            (scoringResults.reduce(
              (acc, s) => acc + Number(s.total_score || s.overall_score || 0),
              0
            ) /
              scoringResults.length) *
              10
          ) / 10
        : 0,
    pass_rate_pct:
      scoringResults.length > 0
        ? Math.round(
            (scoringResults.filter(
              (s) => Number(s.total_score || s.overall_score || 0) >= 70
            ).length /
              scoringResults.length) *
              1000
          ) / 10
        : 0,
    median_score: 0,
    max_score: 0,
    min_score: 0,
    top_candidates_count: scoringResults.filter(
      (s) => Number(s.total_score || s.overall_score || 0) >= 80
    ).length,
  };

  const distributionRanges = analytics?.distribution?.score_ranges || [
    {
      range: '86-100',
      label: 'Sangat Unggul',
      count: scoringResults.filter(
        (s) => Number(s.total_score || s.overall_score || 0) >= 86
      ).length,
      percentage: scoringResults.length
        ? Math.round(
            (scoringResults.filter(
              (s) => Number(s.total_score || s.overall_score || 0) >= 86
            ).length /
              scoringResults.length) *
              100
          )
        : 0,
      color: '#10b981',
      min: 86,
      max: 100,
    },
    {
      range: '71-85',
      label: 'Memenuhi Kualifikasi',
      count: scoringResults.filter((s) => {
        const val = Number(s.total_score || s.overall_score || 0);
        return val >= 71 && val < 86;
      }).length,
      percentage: scoringResults.length
        ? Math.round(
            (scoringResults.filter((s) => {
              const val = Number(s.total_score || s.overall_score || 0);
              return val >= 71 && val < 86;
            }).length /
              scoringResults.length) *
              100
          )
        : 0,
      color: '#38bdf8',
      min: 71,
      max: 85.99,
    },
    {
      range: '56-70',
      label: 'Perlu Pertimbangan',
      count: scoringResults.filter((s) => {
        const val = Number(s.total_score || s.overall_score || 0);
        return val >= 56 && val < 71;
      }).length,
      percentage: scoringResults.length
        ? Math.round(
            (scoringResults.filter((s) => {
              const val = Number(s.total_score || s.overall_score || 0);
              return val >= 56 && val < 71;
            }).length /
              scoringResults.length) *
              100
          )
        : 0,
      color: '#fbbf24',
      min: 56,
      max: 70.99,
    },
    {
      range: '0-55',
      label: 'Di Bawah Ambang',
      count: scoringResults.filter(
        (s) => Number(s.total_score || s.overall_score || 0) < 56
      ).length,
      percentage: scoringResults.length
        ? Math.round(
            (scoringResults.filter(
              (s) => Number(s.total_score || s.overall_score || 0) < 56
            ).length /
              scoringResults.length) *
              100
          )
        : 0,
      color: '#f87171',
      min: 0,
      max: 55.99,
    },
  ];

  const stats = analytics?.statistic || analytics?.performance || {};
  const anomalyInfo = analytics?.anomaly_detection || { anomalies: [] };

  // Filtered table rows based on active interactive selections
  const filteredResults = useMemo(() => {
    return scoringResults.filter((item) => {
      // 1. By search term
      const label = (item.entity_label || item.candidate_name || '').toLowerCase();
      if (searchTerm && !label.includes(searchTerm.toLowerCase())) {
        return false;
      }

      // 2. By selected entity id
      if (selectedEntityId && item.id !== selectedEntityId) {
        return false;
      }

      // 3. By recommendation class
      if (filterRecommendation) {
        const rec = (
          item.recommendation_classification ||
          item.recommendation ||
          ''
        ).toLowerCase();
        if (filterRecommendation === 'select' && !rec.includes('select') && !rec.includes('recommended')) {
          return false;
        }
        if (filterRecommendation === 'review' && !rec.includes('review') && !rec.includes('consider')) {
          return false;
        }
        if (filterRecommendation === 'reject' && !rec.includes('reject')) {
          return false;
        }
      }

      // 4. By score range
      if (filterScoreRange) {
        const score = Number(item.total_score || item.overall_score || 0);
        if (filterScoreRange === '86-100' && (score < 86 || score > 100)) return false;
        if (filterScoreRange === '71-85' && (score < 71 || score >= 86)) return false;
        if (filterScoreRange === '56-70' && (score < 56 || score >= 71)) return false;
        if (filterScoreRange === '0-55' && score >= 56) return false;
      }

      return true;
    });
  }, [scoringResults, selectedEntityId, filterRecommendation, filterScoreRange, searchTerm]);

  const hasActiveFilter = Boolean(selectedEntityId || filterRecommendation || filterScoreRange || searchTerm);

  const resetFilters = () => {
    setSelectedEntityId(null);
    setFilterRecommendation(null);
    setFilterScoreRange(null);
    setSearchTerm('');
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Pusat Analitik Dinamis & Visualisasi Data
            </h2>
            {jobTitle && (
              <span className="text-xs text-slate-400 font-mono hidden md:inline">
                • {jobTitle}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Eksplorasi visual interaktif dengan kemampuan drill-down per segmen data dan deteksi outlier statistik nyata.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex">
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'analytics'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Visualisasi & Statistik
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('insights')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'insights'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Rekomendasi Tindakan ({insights.length})
            </button>
          </div>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            >
              Kembali
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] text-slate-400 block font-medium">Total Terkualifikasi</span>
          <div className="text-xl font-bold text-white mt-1">
            {kpis.total_evaluated || scoringResults.length}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">Entitas Teruji</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] text-slate-400 block font-medium">Rerata Skor Kelompok</span>
          <div className="text-xl font-bold text-sky-400 mt-1">
            {kpis.average_score ?? 0}
            <span className="text-xs text-slate-500 font-normal"> /100</span>
          </div>
          <span className="text-[10px] text-sky-500/80 mt-0.5 block font-mono">Nilai Terbobot</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] text-slate-400 block font-medium">Tingkat Kelulusan</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {kpis.pass_rate_pct ?? 0}%
          </div>
          <span className="text-[10px] text-emerald-500/80 mt-0.5 block font-mono">Ambang &ge; 70.0</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[11px] text-slate-400 block font-medium">Nilai Median</span>
          <div className="text-xl font-bold text-indigo-400 mt-1">
            {kpis.median_score ?? '-'}
          </div>
          <span className="text-[10px] text-indigo-500/80 mt-0.5 block font-mono">Titik Tengah Sebaran</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 col-span-2 sm:col-span-1">
          <span className="text-[11px] text-slate-400 block font-medium">Kandidat Unggul</span>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {kpis.top_candidates_count ?? 0}
          </div>
          <span className="text-[10px] text-amber-500/80 mt-0.5 block font-mono">Skor Prima &ge; 80.0</span>
        </div>
      </div>

      {activeTab === 'insights' ? (
        <SelectionInsightPanel
          insights={insights}
          selectedEntityId={selectedEntityId}
          onSelectEntity={(entityId) => {
            setSelectedEntityId(entityId);
            setActiveTab('analytics');
          }}
        />
      ) : (
        <>
          {/* Active Filter Notification Banner */}
          {hasActiveFilter && (
            <div className="bg-sky-950/40 border border-sky-800/60 rounded-xl p-3 flex items-center justify-between gap-3 text-xs text-sky-200">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  Filter Aktif:{' '}
                  {selectedEntityId && (
                    <strong className="text-white mr-2">
                      Entitas Terpilih ({filteredResults[0]?.entity_label || selectedEntityId})
                    </strong>
                  )}
                  {filterRecommendation && (
                    <strong className="text-white mr-2">
                      Rekomendasi ({filterRecommendation.toUpperCase()})
                    </strong>
                  )}
                  {filterScoreRange && (
                    <strong className="text-white mr-2">
                      Rentang Skor ({filterScoreRange})
                    </strong>
                  )}
                  {searchTerm && (
                    <strong className="text-white">
                      Kata Kunci (&quot;{searchTerm}&quot;)
                    </strong>
                  )}
                  — Menampilkan {filteredResults.length} dari {scoringResults.length} hasil
                </span>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="px-2 py-1 rounded bg-sky-900 hover:bg-sky-800 text-sky-100 text-[11px] font-medium transition cursor-pointer flex items-center gap-1 shrink-0"
              >
                <X className="w-3 h-3" /> Reset Filter
              </button>
            </div>
          )}

          {/* Dynamic Recharts Visualizations Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-sky-400" />
                  Diagram Pemetaan Berbasis Karakteristik Bentuk Data
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Klik pada segmen batang, lingkaran, atau titik chart untuk memfilter tabel hasil secara langsung.
                </p>
              </div>
            </div>

            {visualizations && visualizations.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {visualizations.map((viz, vIdx) => {
                  const chartCfg = viz.chart_config || {};
                  const chartData = chartCfg.data || [];
                  const chartType = viz.chart_type;

                  return (
                    <div
                      key={vIdx}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            {chartCfg.title || `Visualisasi #${vIdx + 1}`}
                          </h4>
                          <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-sky-400 uppercase">
                            {chartType}
                          </span>
                        </div>

                        {/* Metodologi Alasan Pemilihan Bagan */}
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2">
                          <HelpCircle className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
                          <span>
                            <strong className="text-white">Alasan Pemilihan Bagan: </strong>
                            {viz.selection_reason}
                          </span>
                        </div>
                      </div>

                      {/* Recharts Canvas */}
                      <div className="h-64 w-full bg-slate-950/40 rounded-lg p-2 flex items-center justify-center">
                        {chartData.length === 0 ? (
                          <div className="text-xs text-slate-500">Tidak ada data untuk dirender</div>
                        ) : chartType === 'ranking_chart' ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={chartData}
                              margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                              onClick={(state: any) => {
                                if (state && state.activePayload && state.activePayload.length > 0) {
                                  const clicked = state.activePayload[0].payload;
                                  const target = scoringResults.find(
                                    (r) =>
                                      r.entity_label === clicked.entity_label ||
                                      r.candidate_name === clicked.entity_label
                                  );
                                  if (target) {
                                    setSelectedEntityId(
                                      selectedEntityId === target.id ? null : target.id
                                    );
                                  }
                                }
                              }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis
                                dataKey="entity_label"
                                stroke="#64748b"
                                tick={{ fontSize: 10 }}
                                interval={0}
                                angle={-15}
                                textAnchor="end"
                              />
                              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  borderColor: '#334155',
                                  fontSize: '11px',
                                  color: '#fff',
                                }}
                              />
                              <Bar
                                dataKey="total_score"
                                radius={[4, 4, 0, 0]}
                                cursor="pointer"
                              >
                                {chartData.map((entry: any, index: number) => {
                                  const isSelected =
                                    scoringResults.find(
                                      (r) =>
                                        (r.entity_label === entry.entity_label ||
                                          r.candidate_name === entry.entity_label) &&
                                        r.id === selectedEntityId
                                    );
                                  const colors = ['#10b981', '#38bdf8', '#818cf8', '#fbbf24', '#f87171'];
                                  return (
                                    <Cell
                                      key={`cell-rank-${index}`}
                                      fill={isSelected ? '#38bdf8' : colors[index % colors.length]}
                                      stroke={isSelected ? '#ffffff' : undefined}
                                      strokeWidth={isSelected ? 2 : 0}
                                    />
                                  );
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : chartType === 'donut' || chartType === 'pie' ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={chartData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={chartType === 'donut' ? 45 : 0}
                                outerRadius={75}
                                paddingAngle={3}
                                cursor="pointer"
                                onClick={(entry) => {
                                  const label = (entry.name || '').toLowerCase();
                                  if (label.includes('select') || label.includes('lolos')) {
                                    setFilterRecommendation(
                                      filterRecommendation === 'select' ? null : 'select'
                                    );
                                  } else if (label.includes('review') || label.includes('pertimbangan')) {
                                    setFilterRecommendation(
                                      filterRecommendation === 'review' ? null : 'review'
                                    );
                                  } else if (label.includes('reject') || label.includes('tidak')) {
                                    setFilterRecommendation(
                                      filterRecommendation === 'reject' ? null : 'reject'
                                    );
                                  }
                                }}
                              >
                                {chartData.map((entry: any, index: number) => {
                                  return (
                                    <Cell
                                      key={`cell-pie-${index}`}
                                      fill={entry.color || '#38bdf8'}
                                    />
                                  );
                                })}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  borderColor: '#334155',
                                  fontSize: '11px',
                                  color: '#fff',
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: '10px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : chartType === 'bar' ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={chartData}
                              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis
                                dataKey="criterion"
                                stroke="#64748b"
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  borderColor: '#334155',
                                  fontSize: '11px',
                                  color: '#fff',
                                }}
                              />
                              <Bar
                                dataKey="average_score"
                                fill="#38bdf8"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : chartType === 'line' || chartType === 'area' ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={chartData}
                              margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  borderColor: '#334155',
                                  fontSize: '11px',
                                  color: '#fff',
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="average_score"
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={{ r: 4, fill: '#10b981' }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : chartType === 'scatter' ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis
                                type="number"
                                dataKey="total_score"
                                name="Total Skor"
                                domain={[0, 100]}
                                stroke="#64748b"
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis
                                type="number"
                                dataKey="risk_score"
                                name="Indeks Risiko"
                                domain={[0, 100]}
                                stroke="#64748b"
                                tick={{ fontSize: 10 }}
                              />
                              <ZAxis range={[60, 60]} />
                              <Tooltip
                                cursor={{ strokeDasharray: '3 3' }}
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  borderColor: '#334155',
                                  fontSize: '11px',
                                  color: '#fff',
                                }}
                              />
                              <Scatter
                                name="Entitas"
                                data={chartData}
                                fill="#a855f7"
                                cursor="pointer"
                                onClick={(state: any) => {
                                  const label = state?.payload?.entity_label || state?.entity_label;
                                  if (label) {
                                    const match = scoringResults.find(
                                      (r) =>
                                        r.entity_label === label ||
                                        r.candidate_name === label
                                    );
                                    if (match) setSelectedEntityId(match.id);
                                  }
                                }}
                              />
                            </ScatterChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="w-full h-full flex flex-col justify-center space-y-2 px-4">
                            {chartData.map((item: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300">{item.stage || item.name}</span>
                                <span className="font-mono text-emerald-400 font-bold">
                                  {item.count ?? item.value} ({item.pct ?? item.percentage ?? '-'}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-900 rounded-xl border border-slate-800">
                Visualisasi diagram belum digenerasi. Jalankan scoring seleksi untuk mengaktifkan pemetaan heuristik bentuk data.
              </div>
            )}
          </div>

          {/* Statistical Dispersion & Anomaly Detection Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Score Distribution Breakdown with Click-to-filter */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  Distribusi Kualifikasi Skor (Klik untuk Filter)
                </h4>
                {filterScoreRange && (
                  <button
                    type="button"
                    onClick={() => setFilterScoreRange(null)}
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    Reset Rentang
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Frekuensi entitas dalam rentang kualifikasi performa deterministik.
              </p>

              <div className="space-y-2.5 pt-1">
                {distributionRanges.map((rangeItem: any, rIdx: number) => {
                  const isRangeActive = filterScoreRange === rangeItem.range;
                  return (
                    <div
                      key={rIdx}
                      onClick={() =>
                        setFilterScoreRange(isRangeActive ? null : rangeItem.range)
                      }
                      className={`space-y-1 p-2 rounded-lg transition cursor-pointer border ${
                        isRangeActive
                          ? 'bg-slate-800/80 border-sky-500'
                          : 'hover:bg-slate-950/60 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">
                          {rangeItem.label} ({rangeItem.range})
                        </span>
                        <span className="font-mono text-slate-400 text-[11px]">
                          {rangeItem.count} ({rangeItem.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${rangeItem.percentage}%`,
                            backgroundColor: rangeItem.color || '#38bdf8',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dispersion and Outlier Detection */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-purple-400" />
                Sebaran Statistik & Deteksi Anomali
              </h4>
              <p className="text-xs text-slate-400">
                Uji deviasi standar, Pagar Tukey IQR, dan deteksi outlier Z-Score matematis nyata.
              </p>

              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs">
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Kuartil 1 (Q1)</span>
                  <span className="text-slate-200 font-bold">{stats?.q1 ?? '-'}</span>
                </div>
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Kuartil 3 (Q3)</span>
                  <span className="text-slate-200 font-bold">{stats?.q3 ?? '-'}</span>
                </div>
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Rentang IQR</span>
                  <span className="text-slate-200 font-bold">{stats?.iqr ?? '-'}</span>
                </div>
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Std Deviasi (σ)</span>
                  <span className="text-slate-200 font-bold">{stats?.std_dev ?? '-'}</span>
                </div>
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Varians</span>
                  <span className="text-slate-200 font-bold">{stats?.variance ?? '-'}</span>
                </div>
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Pagar Bawah IQR</span>
                  <span className="text-slate-200 font-bold">{stats?.min_fence ?? '-'}</span>
                </div>
              </div>

              {/* Anomaly Detection Status Box */}
              <div className="space-y-2 pt-1">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {anomalyInfo?.anomalies?.length > 0 ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span className="text-slate-300 font-medium">
                      {anomalyInfo?.anomalies?.length > 0
                        ? `${anomalyInfo.anomalies.length} Outlier Statistik Terdeteksi`
                        : 'Data Terdistribusi Normal (Tanpa Outlier Ekstrem)'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Tukey &amp; Z-Score</span>
                </div>

                {anomalyInfo?.anomalies && anomalyInfo.anomalies.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {anomalyInfo.anomalies.map((anom: any, aIdx: number) => (
                      <div
                        key={aIdx}
                        onClick={() => {
                          if (anom.entity_id) {
                            setSelectedEntityId(
                              selectedEntityId === anom.entity_id ? null : anom.entity_id
                            );
                          }
                        }}
                        className="p-2 rounded bg-slate-950/80 border border-amber-900/40 text-[11px] text-slate-300 flex items-start justify-between gap-2 hover:border-amber-600 transition cursor-pointer"
                      >
                        <div>
                          <strong className="text-amber-300">{anom.entity_label}</strong>
                          <p className="text-[10px] text-slate-400 mt-0.5">{anom.explanation}</p>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-950 text-amber-400 border border-amber-800 shrink-0">
                          Z: {anom.z_score ?? '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Results Table (Drill-Down Destination) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  Tabel Hasil Evaluasi &amp; Peringkat Kelayakan ({filteredResults.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Klik entitas untuk melihat rincian kriteria penilaian berbobot atau tinjau keputusan.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  aria-label="Cari kandidat atau vendor..."
                  title="Cari nama entitas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] uppercase font-mono text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Peringkat</th>
                    <th className="py-2.5 px-3">Entitas / Pelamar</th>
                    <th className="py-2.5 px-3 text-right">Total Skor</th>
                    <th className="py-2.5 px-3">Rekomendasi</th>
                    <th className="py-2.5 px-3">Prioritas</th>
                    <th className="py-2.5 px-3 text-center">Risiko</th>
                    <th className="py-2.5 px-3 text-center">Tinjauan</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                        Tidak ada entitas yang sesuai dengan filter atau kata kunci pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((item, idx) => {
                      const rank = item.rank_position || idx + 1;
                      const score = Number(item.total_score || item.overall_score || 0);
                      const label = item.entity_label || item.candidate_name || `Kandidat #${rank}`;
                      const rec = (
                        item.recommendation_classification ||
                        item.recommendation ||
                        'review'
                      ).toLowerCase();
                      const priority = (item.priority_level || 'medium').toLowerCase();
                      const risk = Number(item.risk_score || 15);
                      const isExpanded = expandedEntityId === item.id;
                      const isSelected = selectedEntityId === item.id;

                      const breakdown = item.score_breakdown || item.criterion_breakdown || {};

                      return (
                        <React.Fragment key={item.id || idx}>
                          <tr
                            className={`transition hover:bg-slate-800/40 cursor-pointer ${
                              isSelected ? 'bg-sky-950/30 font-semibold' : ''
                            }`}
                            onClick={() =>
                              setExpandedEntityId(isExpanded ? null : item.id)
                            }
                          >
                            <td className="py-3 px-3 font-mono font-bold text-white">
                              #{rank}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{label}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-slate-500" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-slate-500" />
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                              {score.toFixed(1)}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${
                                  rec.includes('select') || rec.includes('recommended')
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                    : rec.includes('review') || rec.includes('consider')
                                    ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                    : 'bg-rose-950/80 text-rose-300 border-rose-800'
                                }`}
                              >
                                {rec}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-[11px] text-slate-400 capitalize">
                                {priority}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-[11px]">
                              <span
                                className={`${
                                  risk > 50
                                    ? 'text-rose-400 font-bold'
                                    : risk > 25
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {risk}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="text-[11px] text-slate-400 capitalize">
                                {item.decision_status || item.human_review_status || 'Menunggu'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              {onSelectEntityForReview && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectEntityForReview(item);
                                  }}
                                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-[10px] font-medium transition cursor-pointer border border-slate-700"
                                >
                                  Tinjau
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Breakdown Accordion Row */}
                          {isExpanded && (
                            <tr className="bg-slate-950/60 border-b border-slate-800/80">
                              <td colSpan={8} className="p-4 space-y-2">
                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                  Rincian Nilai Skor per Kriteria:
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                                  {Object.keys(breakdown).length > 0 ? (
                                    Object.entries(breakdown).map(([k, val]: [string, any]) => {
                                      const rawVal =
                                        typeof val === 'object' && val !== null
                                          ? val.score ?? val.weighted ?? 0
                                          : Number(val);
                                      return (
                                        <div
                                          key={k}
                                          className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs space-y-1"
                                        >
                                          <span className="text-[10px] text-slate-400 block truncate">
                                            {k}
                                          </span>
                                          <div className="flex items-center justify-between font-mono">
                                            <span className="font-bold text-white">
                                              {Number(rawVal).toFixed(1)}
                                            </span>
                                            <span className="text-[10px] text-slate-500">/100</span>
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="text-xs text-slate-500 col-span-4">
                                      Tidak ada data rincian kriteria tersimpan.
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
