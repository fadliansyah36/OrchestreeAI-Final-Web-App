import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  ArrowRight,
  UserCheck,
  FileSpreadsheet,
  Activity,
  Sliders,
  Play,
  Database,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { TenantRegistrationResponse } from '@/apps/client/types';
import { ExplainabilityPanel, DataAvailabilityState } from './ExplainabilityPanel';

interface DataQualityIssue {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  field_name: string;
  issue_type: string; // 'CONFLICTING_SOURCES' | 'STALE_DATA' | 'PARTIAL_DATA' | 'FALSE_AVAILABILITY_CLAIM'
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  availability_state: DataAvailabilityState;
  confidence_score: number;
  sources_involved: any[];
  conflict_details: Record<string, any>;
  ai_auto_selection_prevented: boolean;
  requires_human_resolution: boolean;
  resolution_status: 'UNRESOLVED' | 'HUMAN_RESOLVED' | 'DISMISSED';
  resolved_by?: string;
  resolved_at?: string;
  resolution_source_chosen?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

interface DataQualityCenterScreenProps {
  tenant: TenantRegistrationResponse | null;
  onBack?: () => void;
}

export const DataQualityCenterScreen: React.FC<DataQualityCenterScreenProps> = ({
  tenant,
  onBack,
}) => {
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<string>('UNRESOLVED');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'issues' | 'validator_lab'>('issues');

  // Resolusi Modal State
  const [selectedIssue, setSelectedIssue] = useState<DataQualityIssue | null>(null);
  const [resolutionSource, setResolutionSource] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [reconciledValue, setReconciledValue] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // Validator Lab State
  const [testClaimState, setTestClaimState] = useState<DataAvailabilityState>('AVAILABLE');
  const [testDataPayload, setTestDataPayload] = useState<string>('{}');
  const [testRequiredFields, setTestRequiredFields] = useState<string>('price, stock, sku');
  const [testSourcesJson, setTestSourcesJson] = useState<string>('[]');
  const [testTtlHours, setTestTtlHours] = useState<number>(24);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  const tenantId = tenant?.tenant_id || (typeof window !== 'undefined' ? localStorage.getItem('orchestree_active_tenant') || '' : '');

  // Load Issues & Summary
  const loadData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filterStatus !== 'ALL') queryParams.set('status', filterStatus);
      if (filterType !== 'ALL') queryParams.set('issue_type', filterType);

      const [resIssues, resSummary] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/intelligence/data-quality/issues?${queryParams.toString()}`),
        fetch(`/api/v1/tenants/${tenantId}/intelligence/data-quality/summary`),
      ]);

      if (resIssues.ok) {
        const d = await resIssues.json();
        setIssues(d.data || []);
      }
      if (resSummary.ok) {
        const s = await resSummary.json();
        setSummary(s.data || null);
      }
    } catch (err) {
      console.error('Gagal mengambil data kualitas data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId, filterStatus, filterType]);

  // Handle Resolusi Manusia
  const handleResolveIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || !resolutionSource) return;

    setIsResolving(true);
    setResolutionError(null);
    try {
      const res = await fetch(
        `/api/v1/tenants/${tenantId}/intelligence/data-quality/issues/${selectedIssue.id}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resolved_by: tenant?.owner_full_name || 'Operator Human-in-the-Loop',
            chosen_source: resolutionSource,
            resolution_notes: resolutionNotes || 'Disetujui dan disahkan secara manual oleh peninjau manusia.',
            reconciled_value: reconciledValue ? JSON.parse(reconciledValue) : undefined,
          }),
        }
      );

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || errJson.detail || 'Gagal menyimpan resolusi.');
      }

      setSelectedIssue(null);
      setResolutionSource('');
      setResolutionNotes('');
      setReconciledValue('');
      await loadData();
    } catch (err: any) {
      setResolutionError(err.message);
    } finally {
      setIsResolving(false);
    }
  };

  // Run Validator Test
  const handleRunValidation = async () => {
    setIsValidating(true);
    try {
      let parsedData: any = null;
      try {
        parsedData = JSON.parse(testDataPayload);
      } catch {
        parsedData = {};
      }

      let parsedSources: any[] = [];
      try {
        parsedSources = JSON.parse(testSourcesJson);
      } catch {
        parsedSources = [];
      }

      const fields = testRequiredFields
        .split(',')
        .map(f => f.trim())
        .filter(Boolean);

      const res = await fetch(`/api/v1/tenants/${tenantId}/intelligence/validate-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimed_state: testClaimState,
          actual_data: parsedData,
          required_fields: fields,
          sources: parsedSources,
          ttl_hours: testTtlHours,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setValidationResult(data.data);
        // Muat ulang daftar isu karena penolakan klaim otomatis mencatat isu baru
        if (data.data?.was_false_claim_rejected) {
          loadData();
        }
      }
    } catch (err) {
      console.error('Error saat menjalankan validasi:', err);
    } finally {
      setIsValidating(false);
    }
  };

  // Preset Pengujian Validator
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'empty_data':
        setTestClaimState('AVAILABLE');
        setTestDataPayload('{}');
        setTestRequiredFields('price, stock, sku');
        setTestSourcesJson('[]');
        setTestTtlHours(24);
        break;
      case 'conflicting':
        setTestClaimState('AVAILABLE');
        setTestDataPayload('{"sku": "PROD-101", "name": "Kemeja Oxford Pria"}');
        setTestRequiredFields('sku, name, price');
        setTestSourcesJson(
          JSON.stringify(
            [
              { source_name: 'Tokopedia', data: { price: 'Rp 150.000', stock: '10' } },
              { source_name: 'Shopee', data: { price: 'Rp 135.000', stock: '5' } },
            ],
            null,
            2
          )
        );
        setTestTtlHours(24);
        break;
      case 'stale':
        setTestClaimState('AVAILABLE');
        setTestDataPayload('{"sku": "PROD-101", "price": 150000, "stock": 20}');
        setTestRequiredFields('sku, price, stock');
        setTestSourcesJson('[{"source_name": "Gudang Utama", "data": {"price": 150000}}]');
        setTestTtlHours(0.1); // TTL sangat pendek sehingga langsung terdeteksi stale
        break;
      case 'partial':
        setTestClaimState('AVAILABLE');
        setTestDataPayload('{"sku": "PROD-101"}');
        setTestRequiredFields('sku, title, price, stock, category');
        setTestSourcesJson('[]');
        setTestTtlHours(24);
        break;
      case 'legitimate':
        setTestClaimState('AVAILABLE');
        setTestDataPayload('{"sku": "PROD-101", "title": "Kemeja Premium", "price": 250000, "stock": 45}');
        setTestRequiredFields('sku, title, price, stock');
        setTestSourcesJson('[{"source_name": "Official ERP", "data": {"sku": "PROD-101", "price": 250000}}]');
        setTestTtlHours(24);
        break;
      default:
        break;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-semibold border border-purple-500/20">
                Pusat Integritas Intelijen
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                AI Auto-Selection Nonaktif
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Pusat Kualitas Data & Kepercayaan AI
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Manajemen 5 status ketersediaan data, deteksi konflik sumber eksternal, penegakan keputusan manusia, dan pengujian Output Validator.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-500' : ''}`} />
              <span>Segarkan Data</span>
            </button>

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
              >
                Kembali
              </button>
            )}
          </div>
        </div>

        {/* Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
              Isu Menunggu Resolusi
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {summary?.total_unresolved_issues ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">kasus aktif</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-purple-500" />
              <span>Membutuhkan keputusan peninjau</span>
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
              Konflik Sumber Eksternal
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {summary?.issues_by_type?.CONFLICTING_SOURCES ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">kejadian</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-amber-500" />
              <span>AI dilarang memilih sepihak</span>
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
              Klaim Palsu Terdeteksi
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {summary?.issues_by_type?.FALSE_AVAILABILITY_CLAIM ?? 0}
              </span>
              <span className="text-[11px] text-slate-400">ditolak validator</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-purple-500" />
              <span>Penegakan Output Validator</span>
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
              Protokol Integritas
            </span>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                Aktif & Terkunci
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Human-in-the-Loop & verifikasi multi-faktor
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('issues')}
            className={`pb-3 font-semibold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === 'issues'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Daftar Isu & Konflik Data ({issues.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('validator_lab')}
            className={`pb-3 font-semibold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === 'validator_lab'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Laboratorium Pengujian Output Validator</span>
          </button>
        </div>

        {/* TAB 1: Issues List & Human Resolution */}
        {activeTab === 'issues' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500 font-medium">Filter Status:</span>
                {['UNRESOLVED', 'HUMAN_RESOLVED', 'ALL'].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    className={`px-3 py-1 rounded-lg border transition-colors ${
                      filterStatus === st
                        ? 'bg-purple-600 text-white border-purple-600 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {st === 'UNRESOLVED' ? 'Belum Selesai' : st === 'HUMAN_RESOLVED' ? 'Telah Disahkan' : 'Semua'}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500 font-medium">Tipe:</span>
                {['ALL', 'CONFLICTING_SOURCES', 'FALSE_AVAILABILITY_CLAIM', 'STALE_DATA', 'PARTIAL_DATA'].map(tp => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setFilterType(tp)}
                    className={`px-3 py-1 rounded-lg border transition-colors ${
                      filterType === tp
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {tp === 'ALL'
                      ? 'Semua Tipe'
                      : tp === 'CONFLICTING_SOURCES'
                      ? 'Konflik Sumber'
                      : tp === 'FALSE_AVAILABILITY_CLAIM'
                      ? 'Klaim Palsu'
                      : tp === 'STALE_DATA'
                      ? 'Data Usang'
                      : 'Data Sebagian'}
                  </button>
                ))}
              </div>
            </div>

            {/* Issues Feed */}
            {loading ? (
              <div className="p-12 text-center text-slate-500 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                <p className="text-xs">Memuat daftar audit kualitas data...</p>
              </div>
            ) : issues.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Tidak Ada Isu Kualitas Data yang Cocok
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Semua data intelijen terverifikasi dalam kondisi baik, atau seluruh konflik telah berhasil diselesaikan oleh peninjau manusia.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {issues.map(issue => {
                  const isConflict = issue.issue_type === 'CONFLICTING_SOURCES';
                  const isFalseClaim = issue.issue_type === 'FALSE_AVAILABILITY_CLAIM';
                  const isResolved = issue.resolution_status === 'HUMAN_RESOLVED';

                  return (
                    <div
                      key={issue.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        isResolved
                          ? 'bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-80'
                          : isConflict
                          ? 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-900/60 shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Issue Type Badge */}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${
                                isConflict
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                  : isFalseClaim
                                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                              }`}
                            >
                              {issue.issue_type.replace(/_/g, ' ')}
                            </span>

                            {/* State Badge */}
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-slate-200 dark:border-slate-700">
                              Status: {issue.availability_state}
                            </span>

                            {/* Severity Badge */}
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                issue.severity === 'CRITICAL' || issue.severity === 'HIGH'
                                  ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {issue.severity}
                            </span>

                            {/* Status Resolusi */}
                            {isResolved ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                Disahkan Manusia
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-medium border border-amber-500/20">
                                <Clock className="w-3 h-3" />
                                Menunggu Keputusan Manusia
                              </span>
                            )}
                          </div>

                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            Entitas: {issue.entity_type} ({issue.entity_id}) • Bidang: {issue.field_name}
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {issue.conflict_details?.rejection_reason ||
                              (isConflict
                                ? 'Sumber data eksternal memberikan nilai saling bertentangan. Sistem otomatisasi AI secara tegas dilarang memilih sumber sepihak.'
                                : 'Peringatan integritas kualitas data terdeteksi.')}
                          </p>

                          {/* Detail Sumber yang Konflik */}
                          {isConflict && issue.sources_involved && issue.sources_involved.length > 0 && (
                            <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                                Perbandingan Nilai Lintas Sumber:
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {issue.sources_involved.map((src, idx) => (
                                  <div
                                    key={idx}
                                    className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-1"
                                  >
                                    <div className="font-semibold text-purple-600 dark:text-purple-400">
                                      {src.source_name || src.source || `Sumber #${idx + 1}`}
                                    </div>
                                    <div className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                                      {JSON.stringify(src.data || src)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Jika Sudah Disahkan */}
                          {isResolved && (
                            <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                              <div className="font-semibold">
                                Disahkan oleh: {issue.resolved_by} ({new Date(issue.resolved_at || issue.updated_at).toLocaleString('id-ID')})
                              </div>
                              <div>Sumber Terpilih: <span className="font-mono font-bold">{issue.resolution_source_chosen}</span></div>
                              {issue.resolution_notes && <div>Catatan: {issue.resolution_notes}</div>}
                            </div>
                          )}
                        </div>

                        {/* Action Button */}
                        {!isResolved && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIssue(issue);
                              const firstSrc = issue.sources_involved?.[0]?.source_name || 'MANUAL_OVERRIDE';
                              setResolutionSource(firstSrc);
                              setResolutionNotes('');
                              setReconciledValue('');
                              setResolutionError(null);
                            }}
                            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors shadow-sm shrink-0 flex items-center gap-1.5 self-start"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Sahkah Keputusan</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Output Validator Test Bench */}
        {activeTab === 'validator_lab' && (
          <div className="space-y-6">
            {/* Workbench Notice */}
            <div className="p-4 rounded-2xl bg-purple-50/80 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 flex items-start gap-3">
              <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
              <div className="text-xs text-purple-900 dark:text-purple-200 space-y-1">
                <div className="font-bold text-sm">
                  Uji Coba Validasi Penolakan Klaim Ketersediaan Data
                </div>
                <p className="text-purple-700 dark:text-purple-300 leading-relaxed">
                  Output Validator memeriksa klaim status data yang dihasilkan oleh inferensi AI/LLM.
                  Bila LLM mengklaim status <code>AVAILABLE</code> pada kondisi data yang sengaja dikosongkan atau konflik,
                  klaim tersebut <strong>wajib ditolak seketika</strong> dan dikoreksi ke status fakta riil (<code>NOT_AVAILABLE</code>, <code>CONFLICTING</code>, atau <code>PARTIAL</code>).
                </p>
              </div>
            </div>

            {/* Test Scenarios Presets */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Pilih Skenario Pengujian Siap Pakai:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => applyPreset('empty_data')}
                  className="p-3 text-left rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 hover:border-rose-400 transition-colors"
                >
                  <div className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center justify-between">
                    <span>1. Data Sengaja Dikosongkan</span>
                    <span className="text-[10px] bg-rose-200 dark:bg-rose-900/60 px-1.5 py-0.5 rounded">Uji Utama</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    AI klaim AVAILABLE, fakta kosong <code>{'{}'}</code>. Validator wajib MENOLAK klaim palsu.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('conflicting')}
                  className="p-3 text-left rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 hover:border-amber-400 transition-colors"
                >
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    2. Konflik Dua Sumber Eksternal
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Tokopedia (150rb) vs Shopee (135rb). Evaluasi berstatus CONFLICTING, AI dicegah memilih otomatis.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('stale')}
                  className="p-3 text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 hover:border-purple-400 transition-colors"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    3. Data Usang (Expired TTL)
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Data berumur melampaui batas TTL kesegaran. Evaluasi berstatus STALE.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('partial')}
                  className="p-3 text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 hover:border-purple-400 transition-colors"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    4. Data Sebagian (Atribut Kurang)
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Hanya ada SKU, harga & stok kosong. Evaluasi berstatus PARTIAL.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('legitimate')}
                  className="p-3 text-left rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 hover:border-emerald-400 transition-colors"
                >
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    5. Data Sah & Lengkap
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Data segar, lengkap, dan tervalidasi. Validator mengesahkan AVAILABLE.
                  </p>
                </button>
              </div>
            </div>

            {/* Test Execution Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Parameter Form */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-500" />
                  <span>Parameter Pengujian Validasi</span>
                </h3>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Klaim Ketersediaan oleh Model/Agen:
                  </label>
                  <select
                    value={testClaimState}
                    onChange={e => setTestClaimState(e.target.value as DataAvailabilityState)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="AVAILABLE">AVAILABLE (Klaim Tersedia Penuh)</option>
                    <option value="STALE">STALE (Klaim Usang)</option>
                    <option value="CONFLICTING">CONFLICTING (Klaim Konflik)</option>
                    <option value="PARTIAL">PARTIAL (Klaim Sebagian)</option>
                    <option value="NOT_AVAILABLE">NOT_AVAILABLE (Klaim Tidak Ada)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Data Aktual (JSON Payload):
                  </label>
                  <textarea
                    rows={4}
                    value={testDataPayload}
                    onChange={e => setTestDataPayload(e.target.value)}
                    className="w-full p-2.5 font-mono text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    aria-label="Data Aktual JSON"
                  />
                  <span className="text-[11px] text-slate-400">
                    Kosongkan <code>{'{}'}</code> untuk menguji penolakan klaim palsu.
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Atribut Wajib (Koma Dipisahkan):
                  </label>
                  <input
                    type="text"
                    value={testRequiredFields}
                    onChange={e => setTestRequiredFields(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    aria-label="Atribut Wajib"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Sumber Data Terlibat (JSON Array):
                  </label>
                  <textarea
                    rows={3}
                    value={testSourcesJson}
                    onChange={e => setTestSourcesJson(e.target.value)}
                    className="w-full p-2.5 font-mono text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    aria-label="Sumber Data JSON"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRunValidation}
                  disabled={isValidating}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <Play className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                  <span>{isValidating ? 'Menjalankan Validator...' : 'Jalankan Uji Validasi Output'}</span>
                </button>
              </div>

              {/* Validation Result & Explainability */}
              <div className="space-y-4">
                {validationResult ? (
                  <ExplainabilityPanel
                    availabilityState={validationResult.validated_state}
                    confidenceScore={validationResult.confidence_score}
                    breakdown={validationResult.breakdown}
                    wasFalseClaimRejected={validationResult.was_false_claim_rejected}
                    rejectionReason={validationResult.rejection_reason}
                    sources={
                      validationResult.breakdown?.sources || [
                        { source_name: 'Evaluator Mesin Intelijen OrchestreeAI' },
                      ]
                    }
                    onRefreshValidation={handleRunValidation}
                  />
                ) : (
                  <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 space-y-2">
                    <Activity className="w-8 h-8 mx-auto text-slate-400" />
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Panel Explainability Siap
                    </h4>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Pilih preset skenario di atas dan klik tombol Jalankan Uji Validasi untuk melihat audit integritas dan verifikasi Output Validator secara langsung.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Pengesahan Resolusi Manusia */}
        {selectedIssue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                    Human-in-the-Loop Override
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    Pengesahan Resolusi Konflik Data
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedIssue(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div><strong>Entitas:</strong> {selectedIssue.entity_type} ({selectedIssue.entity_id})</div>
                <div><strong>Bidang:</strong> {selectedIssue.field_name}</div>
                <div><strong>Tipe Isu:</strong> {selectedIssue.issue_type}</div>
              </div>

              {/* Notice AI Auto-Selection Strict Ban */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-200">
                <strong>Ketentuan Mutlak:</strong> Sistem AI tidak berwenang memutuskan atau memilih sendiri data yang berkonflik. Keputusan ini wajib disahkan oleh operator manusia yang bertanggung jawab.
              </div>

              {resolutionError && (
                <div className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs border border-rose-200">
                  {resolutionError}
                </div>
              )}

              <form onSubmit={handleResolveIssue} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Pilih Sumber yang Disahkan:
                  </label>
                  <select
                    value={resolutionSource}
                    onChange={e => setResolutionSource(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {selectedIssue.sources_involved?.map((s, idx) => {
                      const name = s.source_name || s.source || `Sumber #${idx + 1}`;
                      return (
                        <option key={idx} value={name}>
                          {name} ({JSON.stringify(s.data || s)})
                        </option>
                      );
                    })}
                    <option value="MANUAL_OVERRIDE">Nilai Penyesuaian Manual (Custom Override)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Catatan Justifikasi Peninjau:
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={resolutionNotes}
                    onChange={e => setResolutionNotes(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    aria-label="Catatan Justifikasi"
                  />
                  <span className="text-[10px] text-slate-400">
                    Wajib mencantumkan alasan pengesahan sumber data untuk pencatatan audit PDP.
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Nilai Rekonsiliasi Final (Opsional - JSON/Teks):
                  </label>
                  <input
                    type="text"
                    value={reconciledValue}
                    onChange={e => setReconciledValue(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    aria-label="Nilai Rekonsiliasi"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedIssue(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isResolving}
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isResolving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Sahkan Resolusi</span>
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
