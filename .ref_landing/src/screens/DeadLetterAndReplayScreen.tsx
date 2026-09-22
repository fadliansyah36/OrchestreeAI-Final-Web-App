import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  Play,
  ShieldCheck,
  Zap,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  Code2,
  AlertOctagon,
  Layers,
  Terminal,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { DeadLetterRecord, WorkflowExecutionSummary, WorkflowReplayResult } from '../types';

export const DeadLetterAndReplayScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dlq' | 'replay'>('dlq');

  // DLQ state
  const [dlqItems, setDlqItems] = useState<DeadLetterRecord[]>([]);
  const [isLoadingDlq, setIsLoadingDlq] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [filterReprocessed, setFilterReprocessed] = useState<boolean>(true);
  const [selectedPayload, setSelectedPayload] = useState<{ id: string; payload: string } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Replay state
  const [executions, setExecutions] = useState<WorkflowExecutionSummary[]>([]);
  const [isLoadingExecutions, setIsLoadingExecutions] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<WorkflowReplayResult | null>(null);
  const [searchExecution, setSearchExecution] = useState('');

  // Manual Scheduler Job Trigger State
  const [selectedJob, setSelectedJob] = useState('DLQ_RECOVERY_DRAIN');
  const [isTriggeringJob, setIsTriggeringJob] = useState(false);

  useEffect(() => {
    if (activeTab === 'dlq') {
      loadDlq();
    } else {
      loadExecutions();
    }
  }, [activeTab, filterReprocessed]);

  const handleTriggerManualJob = async () => {
    setIsTriggeringJob(true);
    setActionMessage(null);
    try {
      const res = await api.triggerSchedulerJob(selectedJob, 'tenant-admin', {
        triggeredBy: 'ops-superadmin@orchestree.ai',
        source: 'DeadLetterAndReplayScreen',
      });
      setActionMessage({
        type: 'success',
        text: `Scheduler job "${selectedJob}" berhasil dipicu! Execution ID: ${res.executionId || res.jobId || 'Baru'}. Memuat riwayat workflow terbaru.`,
      });
      // Refresh executions and switch to replay tab to verify
      await loadExecutions();
      setActiveTab('replay');
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Gagal memicu job "${selectedJob}": ${err.message}`,
      });
    } finally {
      setIsTriggeringJob(false);
    }
  };

  const loadDlq = async () => {
    setIsLoadingDlq(true);
    try {
      const items = await api.getDeadLetterQueue(filterReprocessed);
      setDlqItems(items);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Gagal memuat DLQ: ${err.message}` });
    } finally {
      setIsLoadingDlq(false);
    }
  };

  const loadExecutions = async () => {
    setIsLoadingExecutions(true);
    try {
      const execs = await api.getWorkflowExecutions(30);
      setExecutions(execs);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Gagal memuat eksekusi: ${err.message}` });
    } finally {
      setIsLoadingExecutions(false);
    }
  };

  const handleReprocess = async (id: string) => {
    setReprocessingId(id);
    setActionMessage(null);
    try {
      const res = await api.reprocessDeadLetterItem(id);
      setActionMessage({
        type: 'success',
        text: `Item ${id} berhasil di-reprocess: ${res.summary}`,
      });
      await loadDlq();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Gagal reprocess item ${id}: ${err.message}`,
      });
    } finally {
      setReprocessingId(null);
    }
  };

  const handleReplay = async (executionId: string) => {
    setReplayingId(executionId);
    setActionMessage(null);
    try {
      const result = await api.replayWorkflowExecution(executionId);
      setReplayResult(result);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Gagal replay workflow ${executionId}: ${err.message}`,
      });
    } finally {
      setReplayingId(null);
    }
  };

  const pendingCount = dlqItems.filter((i) => !i.reprocessed).length;

  const filteredExecutions = executions.filter(
    (e) =>
      e.id.toLowerCase().includes(searchExecution.toLowerCase()) ||
      e.workflowDefId.toLowerCase().includes(searchExecution.toLowerCase()) ||
      e.tenantId.toLowerCase().includes(searchExecution.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Dead-Letter Queue & Replay Sandbox
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-mono">
              FASE 109
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Penanganan kegagalan otomatis scheduler job dan sandbox replay deterministik tanpa efek samping.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('dlq')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'dlq'
                ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertOctagon className="w-4 h-4 text-rose-400" />
            <span>Dead-Letter Queue</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded-full text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('replay')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'replay'
                ? 'bg-teal-950/80 text-teal-300 border border-teal-800/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <RotateCcw className="w-4 h-4 text-teal-400" />
            <span>Deterministic Replay</span>
          </button>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Ops Manual Job Trigger Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-400">
            <Play className="w-4 h-4 fill-current" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white">Manual Scheduler Job Dispatch (Ops Tooling)</h3>
            <p className="text-[11px] text-slate-400">Picu job scheduler langsung ke backend untuk verifikasi replay sandbox & pipeline.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
          >
            <option value="DLQ_RECOVERY_DRAIN">DLQ_RECOVERY_DRAIN</option>
            <option value="METRICS_AGGREGATOR">METRICS_AGGREGATOR</option>
            <option value="SWARM_HEALTH_SWEEP">SWARM_HEALTH_SWEEP</option>
            <option value="MEMORY_DECAY_CYCLE">MEMORY_DECAY_CYCLE</option>
            <option value="TENANT_CREDIT_RECONCILER">TENANT_CREDIT_RECONCILER</option>
          </select>
          <button
            onClick={handleTriggerManualJob}
            disabled={isTriggeringJob}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg border border-emerald-500 transition disabled:opacity-50"
          >
            {isTriggeringJob ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            <span>Trigger Job</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DEAD-LETTER QUEUE */}
      {activeTab === 'dlq' && (
        <div className="space-y-6">
          {/* Controls & Quick Test */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400 font-medium">Filter:</label>
              <button
                onClick={() => setFilterReprocessed(!filterReprocessed)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-all ${
                  filterReprocessed
                    ? 'bg-slate-800 text-slate-200 border-slate-700'
                    : 'bg-rose-950/60 text-rose-300 border-rose-800'
                }`}
              >
                {filterReprocessed ? 'Menampilkan Semua (Termasuk Reprocessed)' : 'Hanya Pending (Belum di-reprocess)'}
              </button>
              <button
                onClick={loadDlq}
                disabled={isLoadingDlq}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingDlq ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* DLQ Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Job Type</th>
                    <th className="py-3 px-4">Penyebab Kegagalan (Failure Reason)</th>
                    <th className="py-3 px-4">Payload Asli</th>
                    <th className="py-3 px-4">Waktu Gagal</th>
                    <th className="py-3 px-4">Status DLQ</th>
                    <th className="py-3 px-4 text-right">Aksi Super Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                  {dlqItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                        {isLoadingDlq
                          ? 'Memuat data dead-letter queue...'
                          : 'Tidak ada item di Dead-Letter Queue. Semua job asynchronous berjalan normal.'}
                      </td>
                    </tr>
                  ) : (
                    dlqItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded text-[11px] font-semibold ${
                              item.jobType.includes('PROACTIVE')
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : item.jobType.includes('CRAWL')
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-blue-950 text-blue-300 border border-blue-800'
                            }`}
                          >
                            {item.jobType}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-rose-300" title={item.failureReason}>
                          {item.failureReason || 'Exhausted 3 retry attempts'}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => setSelectedPayload({ id: item.id, payload: item.originalPayload })}
                            className="text-xs text-teal-400 hover:text-teal-300 underline flex items-center gap-1"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            Lihat Payload
                          </button>
                        </td>
                        <td className="py-3 px-4 text-slate-400 font-sans text-xs">
                          {new Date(item.failedAt).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4">
                          {item.reprocessed ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-sans">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Reprocessed
                              </span>
                              {item.reprocessResult && (
                                <p className="text-[10px] text-slate-400 truncate max-w-[180px]" title={item.reprocessResult}>
                                  {item.reprocessResult}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-sans">
                              <AlertOctagon className="w-3 h-3 text-rose-400" />
                              Pending Action
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleReprocess(item.id)}
                            disabled={item.reprocessed || reprocessingId === item.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium font-sans inline-flex items-center gap-1.5 transition ${
                              item.reprocessed
                                ? 'bg-slate-800/60 text-slate-500 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                            }`}
                          >
                            {reprocessingId === item.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-3.5 h-3.5" />
                                Reprocess Now
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DETERMINISTIC REPLAY SANDBOX */}
      {activeTab === 'replay' && (
        <div className="space-y-6">
          {/* Information Banner */}
          <div className="p-4 rounded-xl bg-teal-950/30 border border-teal-800/60 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-teal-300">Deterministic Replay Sandbox Mode:</span>{' '}
              Mengambil snapshot state (current_state_snapshot) dari eksekusi lama dan mengeksekusi ulang secara utuh
              di environment terisolasi. Seluruh side effects nyata (WhatsApp, Telegram, Slack broadcast, dan Payment
              Gateway) dicegah/disupresi secara otomatis sehingga aman digunakan untuk debugging & audit performa AI.
            </div>
          </div>

          {/* Search & Refresh */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari execution ID, workflow, tenant..."
                value={searchExecution}
                onChange={(e) => setSearchExecution(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
            <button
              onClick={loadExecutions}
              disabled={isLoadingExecutions}
              className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-slate-300 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingExecutions ? 'animate-spin' : ''}`} />
              Refresh Executions
            </button>
          </div>

          {/* Executions Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Execution ID</th>
                    <th className="py-3 px-4">Workflow Def</th>
                    <th className="py-3 px-4">Tenant</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Node</th>
                    <th className="py-3 px-4">Executed At</th>
                    <th className="py-3 px-4 text-right">Aksi Sandbox</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                  {filteredExecutions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                        {isLoadingExecutions ? 'Memuat eksekusi workflow...' : 'Tidak ada riwayat eksekusi.'}
                      </td>
                    </tr>
                  ) : (
                    filteredExecutions.map((exec) => (
                      <tr key={exec.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 text-teal-300 font-semibold">{exec.id}</td>
                        <td className="py-3 px-4 text-slate-300">{exec.workflowDefId}</td>
                        <td className="py-3 px-4 text-slate-400 font-sans">{exec.tenantId}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-sans ${
                              exec.executionStatus === 'completed'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {exec.executionStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400">{exec.lastCompletedNodeId || '-'}</td>
                        <td className="py-3 px-4 font-sans text-slate-400 text-xs">
                          {new Date(exec.executedAt).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleReplay(exec.id)}
                            disabled={replayingId === exec.id}
                            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-sans font-medium inline-flex items-center gap-1.5 shadow-sm transition"
                          >
                            {replayingId === exec.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Replaying...
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                Replay Sandbox
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPLAY RESULT MODAL */}
      {replayResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-950 flex items-center justify-center border border-teal-700 text-teal-400">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Hasil Deterministic Replay</h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Replay ID: {replayResult.replayExecutionId} (Original: {replayResult.originalExecutionId})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReplayResult(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Determinism Status Banner */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                replayResult.isDeterministicMatch
                  ? 'bg-emerald-950/50 border-emerald-700/80 text-emerald-200'
                  : 'bg-amber-950/50 border-amber-700/80 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">
                    {replayResult.isDeterministicMatch
                      ? 'DETERMINISTIC 100% MATCH: Output Replay Sama Persis dengan Eksekusi Asli'
                      : 'OUTPUT DIVERGENCE DETECTED'}
                  </h3>
                  <p className="text-xs opacity-80 mt-0.5">
                    Eksekusi snapshot menghasilkan perilaku deterministik tanpa perbedaan token sintetik. Durasi: {replayResult.durationMs}ms.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white font-mono">
                PASS
              </span>
            </div>

            {/* Sandbox Safeguards Report */}
            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                Sandbox Isolation & Side-Effects Prevention
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">WhatsApp</span>
                  <span className="text-teal-300 font-semibold">{replayResult.sandboxDetails.whatsapp_dispatch || 'SUPPRESSED'}</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Telegram</span>
                  <span className="text-teal-300 font-semibold">{replayResult.sandboxDetails.telegram_dispatch || 'SUPPRESSED'}</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Slack</span>
                  <span className="text-teal-300 font-semibold">{replayResult.sandboxDetails.slack_dispatch || 'SUPPRESSED'}</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Payment Gateway</span>
                  <span className="text-teal-300 font-semibold">{replayResult.sandboxDetails.payment_gateway || 'SUPPRESSED'}</span>
                </div>
              </div>
            </div>

            {/* Comparison: Original vs Replay Output */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Original Output (Eksekusi Lama)
                </span>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono h-48 overflow-y-auto whitespace-pre-wrap">
                  {replayResult.originalOutput}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-xs font-semibold text-teal-300 uppercase tracking-wider block">
                  Replay Output (Sandbox Terisolasi)
                </span>
                <div className="p-3 bg-slate-950 rounded-xl border border-teal-800/60 text-xs text-teal-200 font-mono h-48 overflow-y-auto whitespace-pre-wrap">
                  {replayResult.replayOutput}
                </div>
              </div>
            </div>

            {/* Replayed Nodes Execution Timeline */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                Node Execution Breakdown ({replayResult.nodeRuns.length} Node)
              </h4>
              <div className="space-y-2">
                {replayResult.nodeRuns.map((node, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex items-start justify-between gap-4 font-mono text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400 font-bold">{node.nodeId}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {node.nodeType}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {node.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] max-w-xl">
                        {node.output || node.errorMessage || 'Node completed'}
                      </p>
                    </div>
                    <span className="text-slate-500 text-[10px] shrink-0">{node.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => setReplayResult(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
              >
                Tutup Sandbox Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYLOAD INSPECTOR MODAL */}
      {selectedPayload && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-teal-400" />
                Original Payload (DLQ Item {selectedPayload.id.slice(0, 8)})
              </h3>
              <button
                onClick={() => setSelectedPayload(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-teal-300 font-mono overflow-x-auto max-h-72">
              {JSON.stringify(JSON.parse(selectedPayload.payload || '{}'), null, 2)}
            </pre>
            <div className="flex justify-end">
              <button
                onClick={() => setSelectedPayload(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
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
