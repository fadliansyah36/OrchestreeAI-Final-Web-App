'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Play,
  ToggleLeft,
  ToggleRight,
  Clock,
  UploadCloud,
  Webhook,
  Workflow,
  Copy,
  Check,
  Bot,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Settings2,
  FileText,
  Sliders,
} from 'lucide-react';
import { EmptyState, SkeletonLoader } from '@orchestree/ui';

interface AutomationTrigger {
  id: string;
  trigger_name: string;
  trigger_type: 'new_file_upload' | 'scheduled' | 'webhook' | 'workflow_trigger' | string;
  trigger_config: Record<string, any>;
  target_agent_id?: string | null;
  target_agent_name?: string | null;
  target_agent_role?: string | null;
  criteria_template: Array<{ key: string; label: string; weight: number }>;
  is_active: boolean;
  created_at: string;
}

interface TriggerExecution {
  id: string;
  trigger_id: string;
  trigger_name: string;
  trigger_type: string;
  selection_job_id?: string | null;
  job_title?: string | null;
  status: 'success' | 'failed' | string;
  detail?: string | null;
  executed_at: string;
}

interface EligibleAgent {
  id: string;
  name: string;
  job_title_id: string;
  role: string;
  description?: string;
}

interface SelectionAutomationScreenProps {
  tenantId: string;
  onOpenJob?: (jobId: string) => void;
}

export function SelectionAutomationScreen({ tenantId, onOpenJob }: SelectionAutomationScreenProps) {
  const [triggers, setTriggers] = useState<AutomationTrigger[]>([]);
  const [executions, setExecutions] = useState<TriggerExecution[]>([]);
  const [eligibleAgents, setEligibleAgents] = useState<EligibleAgent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal create trigger
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTriggerName, setNewTriggerName] = useState<string>('');
  const [newTriggerType, setNewTriggerType] = useState<string>('scheduled');
  const [newAgentId, setNewAgentId] = useState<string>('');
  const [cronExpression, setCronExpression] = useState<string>('0 8 * * 1-5');
  const [folderPath, setFolderPath] = useState<string>('storage/documents/resumes');
  const [webhookSecret, setWebhookSecret] = useState<string>('orch_sec_' + Date.now().toString(36));

  // Form criteria template
  const [criteriaList, setCriteriaList] = useState<Array<{ key: string; label: string; weight: number }>>([
    { key: 'technical_skill', label: 'Kompetensi Teknis', weight: 0.4 },
    { key: 'experience_relevance', label: 'Kesesuaian Pengalaman', weight: 0.3 },
    { key: 'risk_compliance', label: 'Integritas & Kepatuhan', weight: 0.3 },
  ]);

  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message: msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [trigRes, execRes, agentRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/selection/triggers`),
        fetch(`/api/v1/tenants/${tenantId}/selection/triggers/executions`),
        fetch(`/api/v1/tenants/${tenantId}/selection/eligible-agents`),
      ]);

      if (trigRes.ok) {
        const j = await trigRes.json();
        setTriggers(j.data || []);
      }
      if (execRes.ok) {
        const j = await execRes.json();
        setExecutions(j.data || []);
      }
      if (agentRes.ok) {
        const j = await agentRes.json();
        setEligibleAgents(j.data || []);
      }
    } catch (err: any) {
      console.error('Gagal mengambil data otomasi:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const handleToggleTrigger = async (trigger: AutomationTrigger) => {
    try {
      const nextActive = !trigger.is_active;
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/triggers/${trigger.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive }),
      });

      if (!res.ok) throw new Error('Gagal memperbarui status pemicu.');
      setTriggers((prev) => prev.map((t) => (t.id === trigger.id ? { ...t, is_active: nextActive } : t)));
      showNotification(`Pemicu '${trigger.trigger_name}' sekarang ${nextActive ? 'AKTIF' : 'NONAKTIF'}`);
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleTestExecute = async (triggerId: string, triggerName: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/triggers/${triggerId}/execute`, {
        method: 'POST',
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.detail || 'Eksekusi pemicu gagal.');
      }
      const data = await res.json();
      showNotification(`Pemicu '${triggerName}' berhasil dieksekusi secara otomatis.`);
      fetchData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    if (!confirm('Hapus pemicu otomasi ini?')) return;
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/triggers/${triggerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showNotification('Pemicu otomasi berhasil dihapus.');
        fetchData();
      }
    } catch (err: any) {
      showNotification('Gagal menghapus pemicu.', 'error');
    }
  };

  const handleCopyWebhookUrl = (triggerId: string) => {
    const url = `${window.location.origin}/api/v1/selection/webhooks/triggers/${triggerId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(triggerId);
    setTimeout(() => setCopiedId(null), 3000);
    showNotification('Webhook URL disalin ke papan klip.');
  };

  const handleCreateTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTriggerName.trim()) {
      showNotification('Nama pemicu wajib diisi.', 'error');
      return;
    }

    const config: Record<string, any> = {};
    if (newTriggerType === 'scheduled') {
      config.cron = cronExpression;
    } else if (newTriggerType === 'new_file_upload') {
      config.folder_path = folderPath;
    } else if (newTriggerType === 'webhook') {
      config.webhook_secret = webhookSecret;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/tenants/${tenantId}/selection/triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_name: newTriggerName.trim(),
          trigger_type: newTriggerType,
          trigger_config: config,
          target_agent_id: newAgentId || undefined,
          criteria_template: criteriaList,
          is_active: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal membuat pemicu.');
      }

      showNotification('Pemicu seleksi otomatis baru berhasil didaftarkan.');
      setShowCreateModal(false);
      setNewTriggerName('');
      fetchData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const getTriggerIcon = (type: string) => {
    switch (type) {
      case 'new_file_upload':
        return <UploadCloud className="w-5 h-5 text-sky-500" />;
      case 'scheduled':
        return <Clock className="w-5 h-5 text-indigo-500" />;
      case 'webhook':
        return <Webhook className="w-5 h-5 text-emerald-500" />;
      default:
        return <Workflow className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm shadow-md animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs underline ml-4">
            Tutup
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-primary/10 text-primary">
                <Zap className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-foreground">Otomasi Seleksi Proaktif (Event Triggers)</h1>
                <p className="text-sm text-foreground-secondary mt-0.5">
                  Konfigurasikan pemicu berkas baru, jadwal berkala (cron), dan integrasi Webhook untuk mengeksekusi seleksi otomatis.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:bg-primary/90 transition"
          >
            <Plus className="w-4 h-4" />
            Tambah Pemicu Otomasi
          </button>
        </div>
      </div>

      {/* Active Triggers List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Pemicu Aktif Terdaftar ({triggers.length})</h2>
        </div>

        {isLoading ? (
          <SkeletonLoader count={3} />
        ) : triggers.length === 0 ? (
          <EmptyState
            title="Belum Ada Pemicu Otomasi"
            description="Daftarkan pemicu unggah berkas baru, jadwal cron, atau webhook untuk memicu pekerjaan seleksi otomatis."
            actionLabel="Buat Pemicu Baru"
            onAction={() => setShowCreateModal(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {triggers.map((trig) => (
              <div
                key={trig.id}
                className="bg-surface rounded-2xl border border-border p-5 shadow-sm space-y-4 hover:border-primary/40 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-surface-secondary border border-border">
                      {getTriggerIcon(trig.trigger_type)}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-foreground">{trig.trigger_name}</h3>
                      <p className="text-xs uppercase font-semibold text-primary mt-0.5 tracking-wider">
                        {trig.trigger_type.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleTrigger(trig)}
                      className="text-foreground-secondary hover:text-foreground transition"
                      title={trig.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      {trig.is_active ? (
                        <ToggleRight className="w-7 h-7 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-zinc-400" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteTrigger(trig.id)}
                      className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                      title="Hapus Pemicu"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Trigger Config & Assigned Agent */}
                <div className="bg-surface-secondary/50 rounded-xl p-3 text-xs space-y-1.5 border border-border/50">
                  {trig.trigger_type === 'scheduled' && (
                    <div className="flex items-center justify-between">
                      <span className="text-foreground-secondary">Jadwal Cron:</span>
                      <span className="font-mono font-semibold text-foreground">{trig.trigger_config?.cron || '0 8 * * *'}</span>
                    </div>
                  )}
                  {trig.trigger_type === 'new_file_upload' && (
                    <div className="flex items-center justify-between">
                      <span className="text-foreground-secondary">Folder Sumber:</span>
                      <span className="font-mono text-foreground">{trig.trigger_config?.folder_path || 'all_files'}</span>
                    </div>
                  )}
                  {trig.trigger_type === 'webhook' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground-secondary">Endpoint Webhook:</span>
                        <button
                          onClick={() => handleCopyWebhookUrl(trig.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline"
                        >
                          {copiedId === trig.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          Salin URL
                        </button>
                      </div>
                      <p className="font-mono text-[10px] text-foreground-secondary break-all truncate">
                        /api/v1/selection/webhooks/triggers/{trig.id}
                      </p>
                    </div>
                  )}
                  {trig.target_agent_name && (
                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                      <span className="text-foreground-secondary flex items-center gap-1">
                        <Bot className="w-3.5 h-3.5 text-primary" /> AI Agent:
                      </span>
                      <span className="font-semibold text-foreground">{trig.target_agent_name}</span>
                    </div>
                  )}
                </div>

                {/* Criteria preview & Test Button */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1 text-xs text-foreground-secondary">
                    <Sliders className="w-3.5 h-3.5" />
                    <span>{trig.criteria_template?.length || 0} Kriteria template</span>
                  </div>

                  <button
                    onClick={() => handleTestExecute(trig.id, trig.trigger_name)}
                    disabled={actionLoading || !trig.is_active}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-secondary text-foreground hover:bg-surface-secondary/80 border border-border disabled:opacity-50 transition"
                  >
                    <Play className="w-3 h-3 text-primary" />
                    Uji Eksekusi Sekarang
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Execution Logs Feed */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Riwayat Log Eksekusi Otomasi ({executions.length})</h2>
        {executions.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-6 text-center text-sm text-foreground-secondary">
            Belum ada eksekusi pemicu otomatis yang tercatat.
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-secondary/50 text-foreground-secondary text-xs uppercase font-semibold border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Waktu Eksekusi</th>
                    <th className="px-4 py-3">Nama Pemicu</th>
                    <th className="px-4 py-3">Tipe Pemicu</th>
                    <th className="px-4 py-3">Pekerjaan Seleksi</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Rincian Hasil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground">
                  {executions.map((exec) => (
                    <tr key={exec.id} className="hover:bg-surface-secondary/30 transition">
                      <td className="px-4 py-3 text-xs text-foreground-secondary">
                        {exec.executed_at ? new Date(exec.executed_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{exec.trigger_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs uppercase font-semibold text-primary">{exec.trigger_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        {exec.selection_job_id ? (
                          <button
                            onClick={() => onOpenJob && exec.selection_job_id && onOpenJob(exec.selection_job_id)}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            {exec.job_title || exec.selection_job_id.slice(0, 8)}
                          </button>
                        ) : (
                          <span className="text-xs text-foreground-secondary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                            exec.status === 'success'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {exec.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground-secondary max-w-sm truncate" title={exec.detail || ''}>
                        {exec.detail || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Tambah Pemicu */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface rounded-2xl border border-border max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Tambah Pemicu Seleksi Otomatis
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-foreground-secondary hover:text-foreground">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTrigger} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Nama Pemicu *</label>
                <input
                  type="text"
                  required
                  value={newTriggerName}
                  onChange={(e) => setNewTriggerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Contoh: Seleksi Resume Masuk Harian HR" // allowlist: standard UI input hint
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Tipe Pemicu (Trigger Type)</label>
                <select
                  value={newTriggerType}
                  onChange={(e) => setNewTriggerType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="scheduled">Jadwal Berkala (Scheduled / Cron)</option>
                  <option value="new_file_upload">Unggah Berkas Baru (New File Upload)</option>
                  <option value="webhook">Webhook Eksternal (API Trigger)</option>
                  <option value="workflow_trigger">Alur Kerja Otomatis (Workflow Trigger)</option>
                </select>
              </div>

              {/* Dynamic config inputs */}
              {newTriggerType === 'scheduled' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Cron Expression (Format Linux 5-Fields)</label>
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm font-mono"
                    placeholder="0 8 * * 1-5" // allowlist: standard UI input hint
                  />
                  <p className="text-[11px] text-foreground-secondary">
                    Contoh: `0 8 * * 1-5` (Setiap hari kerja jam 08:00 WIB), `0 0 * * *` (Tengah malam)
                  </p>
                </div>
              )}

              {newTriggerType === 'new_file_upload' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Target Direktori / Channel Berkas</label>
                  <input
                    type="text"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm font-mono"
                    placeholder="storage/documents/resumes" // allowlist: standard UI input hint
                  />
                </div>
              )}

              {newTriggerType === 'webhook' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Webhook Secret (HMAC-SHA256)</label>
                  <input
                    type="text"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm font-mono"
                  />
                </div>
              )}

              {/* Assigned Agent from 15 Principal Job Titles */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">AI Agent Penanggung Jawab</label>
                <select
                  value={newAgentId}
                  onChange={(e) => setNewAgentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- Tanpa AI Agent Spesifik (Sistem Utama) --</option>
                  {eligibleAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Criteria Template */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Template Kriteria & Bobot Awal</label>
                </div>
                <div className="space-y-1.5">
                  {criteriaList.map((crit, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={crit.label}
                        onChange={(e) => {
                          const n = [...criteriaList];
                          n[idx].label = e.target.value;
                          setCriteriaList(n);
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface text-xs"
                      />
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={crit.weight}
                        onChange={(e) => {
                          const n = [...criteriaList];
                          n[idx].weight = parseFloat(e.target.value) || 0;
                          setCriteriaList(n);
                        }}
                        className="w-20 px-2 py-1.5 rounded-lg border border-border bg-surface text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-surface-secondary text-foreground"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {actionLoading ? 'Mendaftarkan...' : 'Simpan Pemicu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
