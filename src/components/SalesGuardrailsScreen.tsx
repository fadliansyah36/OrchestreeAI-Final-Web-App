import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  Bot,
  Settings,
  ListFilter,
  RefreshCw,
  Sliders,
  FileText,
  DollarSign,
  ArrowRight,
  ExternalLink,
  Layers
} from 'lucide-react';

interface GuardrailRule {
  id: string;
  tenant_id: string;
  action_type: 'DISCOUNT' | 'REFUND' | 'CANCEL_ORDER' | 'CUSTOM_CONTRACT';
  risk_tier: 'low' | 'medium' | 'high' | 'critical';
  requires_human_approval: boolean;
  max_autonomous_discount_pct: number;
  max_autonomous_amount: number;
  is_active: boolean;
  description: string | null;
  updated_at: string;
}

interface GuardrailApproval {
  id: string;
  tenant_id: string;
  action_type: 'DISCOUNT' | 'REFUND' | 'CANCEL_ORDER' | 'CUSTOM_CONTRACT';
  risk_tier: 'high';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  requested_by_actor_type: 'ai_agent' | 'human_user' | 'system';
  requested_by_actor_id: string | null;
  requested_by_persona_type: string;
  target_resource_type: string;
  target_resource_id: string | null;
  request_payload: Record<string, any>;
  guardrail_violation_reason: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  approval_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_type: string;
  actor_id: string | null;
  persona_type: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload_after: any;
  created_at: string;
}

interface McpTool {
  id: string;
  tool_name: string;
  risk_tier: string;
  description: string;
  is_active: boolean;
  input_schema: any;
  output_schema: any;
}

export function SalesGuardrailsScreen({ tenantId }: { tenantId: string }) {
  const [activeTab, setActiveTab] = useState<'matrix' | 'approvals' | 'audit' | 'mcp'>('matrix');
  const [rules, setRules] = useState<GuardrailRule[]>([]);
  const [approvals, setApprovals] = useState<GuardrailApproval[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Simulator State
  const [simAction, setSimAction] = useState<'DISCOUNT' | 'REFUND' | 'CANCEL_ORDER' | 'CUSTOM_CONTRACT'>('DISCOUNT');
  const [simPersona, setSimPersona] = useState<string>('sales_specialist');
  const [simDiscountPct, setSimDiscountPct] = useState<number>(25);
  const [simAmount, setSimAmount] = useState<number>(1500000);
  const [simOrderId, setSimOrderId] = useState<string>('ORD-2026-8819');
  const [simTerms, setSimTerms] = useState<string>('Termin pembayaran khusus 90 hari');
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  // Review Modal State
  const [selectedApproval, setSelectedApproval] = useState<GuardrailApproval | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  // Edit Threshold State
  const [editingDiscountLimit, setEditingDiscountLimit] = useState<boolean>(false);
  const [newDiscountLimit, setNewDiscountLimit] = useState<number>(10);
  const [savingLimit, setSavingLimit] = useState<boolean>(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, approvalsRes, auditRes, mcpRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/sales/guardrails`),
        fetch(`/api/v1/tenants/${tenantId}/sales/guardrails/approvals`),
        fetch(`/api/v1/tenants/${tenantId}/sales/guardrails/audit-logs?limit=30`),
        fetch(`/api/v1/tenants/${tenantId}/sales/guardrails/mcp-tools`),
      ]);

      const [rulesJson, approvalsJson, auditJson, mcpJson] = await Promise.all([
        rulesRes.json(),
        approvalsRes.json(),
        auditRes.json(),
        mcpRes.json(),
      ]);

      if (rulesJson.status === 'ok') {
        setRules(rulesJson.data);
        const discRule = rulesJson.data.find((r: GuardrailRule) => r.action_type === 'DISCOUNT');
        if (discRule) setNewDiscountLimit(discRule.max_autonomous_discount_pct);
      }
      if (approvalsJson.status === 'ok') setApprovals(approvalsJson.data);
      if (auditJson.status === 'ok') setAuditLogs(auditJson.data);
      if (mcpJson.status === 'ok') setMcpTools(mcpJson.data);
    } catch (err) {
      console.error('Gagal memuat data guardrail sales:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const handleUpdateDiscountLimit = async () => {
    setSavingLimit(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/sales/guardrails/DISCOUNT`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_autonomous_discount_pct: Number(newDiscountLimit) }),
      });
      const json = await res.json();
      if (json.status === 'ok') {
        setRules((prev) =>
          prev.map((r) =>
            r.action_type === 'DISCOUNT'
              ? { ...r, max_autonomous_discount_pct: Number(newDiscountLimit) }
              : r
          )
        );
        setEditingDiscountLimit(false);
      }
    } catch (err) {
      console.error('Gagal memperbarui batas diskon:', err);
    } finally {
      setSavingLimit(false);
    }
  };

  const handleRunSimulator = async () => {
    setSimulating(true);
    setSimResult(null);

    let payload: Record<string, any> = {};
    let targetType = 'order';
    let targetId = simOrderId;

    if (simAction === 'DISCOUNT') {
      payload = { order_id: simOrderId, discount_pct: simDiscountPct, reason: 'Penawaran diskon khusus via negosiasi chat' };
    } else if (simAction === 'REFUND') {
      payload = { order_id: simOrderId, amount: simAmount, reason: 'Pengajuan retur barang tidak sesuai spesifikasi' };
    } else if (simAction === 'CANCEL_ORDER') {
      payload = { order_id: simOrderId, reason: 'Pelanggan membatalkan pemesanan sebelum pengiriman' };
    } else if (simAction === 'CUSTOM_CONTRACT') {
      targetType = 'customer';
      targetId = 'CUST-B2B-109';
      payload = { customer_id: 'CUST-B2B-109', terms: simTerms, estimated_value: 25000000 };
    }

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/sales/guardrails/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: simAction,
          actor_type: 'ai_agent',
          persona_type: simPersona,
          target_resource_type: targetType,
          target_resource_id: targetId,
          payload,
          request_id: `sim-${Date.now()}`,
        }),
      });
      const json = await res.json();
      if (json.status === 'ok') {
        setSimResult(json.data);
        // Refresh approvals and audit
        fetchData();
      }
    } catch (err) {
      console.error('Gagal menjalankan simulasi guardrail:', err);
    } finally {
      setSimulating(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedApproval) return;
    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/sales/guardrails/approvals/${selectedApproval.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: reviewDecision,
          approval_notes: reviewDecision === 'APPROVED' ? reviewNotes : undefined,
          rejection_reason: reviewDecision === 'REJECTED' ? reviewNotes : undefined,
        }),
      });
      const json = await res.json();
      if (json.status === 'ok') {
        setSelectedApproval(null);
        setReviewNotes('');
        fetchData();
      }
    } catch (err) {
      console.error('Gagal meninjau tiket:', err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const filteredApprovals = approvals.filter((a) => {
    if (statusFilter === 'ALL') return true;
    return a.status === statusFilter;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold tracking-wider uppercase mb-1">
              <ShieldAlert className="w-4 h-4" />
              Sistem Penegakan Guardrail & Persetujuan Manusia
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Matriks Guardrail Sales & Human-in-the-Loop
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Pengendalian aksi penjualan berisiko tinggi (diskon &gt; batas, refund, pembatalan, kontrak khusus) dengan eskalasi wajib persetujuan manusia.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-medium rounded-lg border border-slate-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
            <div className="px-3.5 py-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              Risk Tier: HIGH (Enforced)
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mt-6 overflow-x-auto pb-2 border-b border-slate-800/80">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition ${
              activeTab === 'matrix'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Matriks Guardrail &amp; Batas Otonom
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition relative ${
              activeTab === 'approvals'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Antrean Persetujuan Manusia
            {approvals.filter((a) => a.status === 'PENDING_APPROVAL').length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 text-xs font-bold rounded-full bg-rose-500 text-white">
                {approvals.filter((a) => a.status === 'PENDING_APPROVAL').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition ${
              activeTab === 'audit'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            Audit Ledger Aksi Berisiko AI
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition ${
              activeTab === 'mcp'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Registri Perkakas MCP
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* TAB 1: MATRIKS GUARDRAIL & SIMULATOR */}
        {activeTab === 'matrix' && (
          <div className="space-y-8">
            {/* Guardrail Matrix Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {rules.map((rule) => {
                const isDiscount = rule.action_type === 'DISCOUNT';
                const isRefund = rule.action_type === 'REFUND';
                const isCancel = rule.action_type === 'CANCEL_ORDER';
                const isContract = rule.action_type === 'CUSTOM_CONTRACT';

                let actionLabel = 'Aksi Penjualan';
                let policyText = 'Wajib persetujuan staf manusia';

                if (isDiscount) {
                  actionLabel = 'Diskon > Batas';
                  policyText = `Maksimal Otonom: ${rule.max_autonomous_discount_pct}%. Di atas itu wajib persetujuan manusia.`;
                } else if (isRefund) {
                  actionLabel = 'Pengembalian Dana (Refund)';
                  policyText = '100% wajib persetujuan manusia. AI dilarang mencairkan dana tanpa tanda tangan staf.';
                } else if (isCancel) {
                  actionLabel = 'Pembatalan Pesanan';
                  policyText = '100% wajib persetujuan manusia. Mencegah pembatalan sepihak tanpa tinjauan.';
                } else if (isContract) {
                  actionLabel = 'Kontrak / Perjanjian Khusus';
                  policyText = '100% wajib persetujuan manusia untuk klausul komersial non-standar.';
                }

                return (
                  <div
                    key={rule.id}
                    className="p-5 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-1 text-xs font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                          RISK TIER: HIGH
                        </span>
                        <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                          <UserCheck className="w-3.5 h-3.5" />
                          Human Signoff
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-white mb-1.5">{actionLabel}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">{policyText}</p>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                      {isDiscount ? (
                        <div>
                          {editingDiscountLimit ? (
                            <div className="space-y-2">
                              <label className="text-xs text-slate-300">Batas Toleransi Diskon AI (%)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={newDiscountLimit}
                                  onChange={(e) => setNewDiscountLimit(Number(e.target.value))}
                                  className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:border-rose-500"
                                />
                                <button
                                  onClick={handleUpdateDiscountLimit}
                                  disabled={savingLimit}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-xs font-semibold rounded text-white"
                                >
                                  {savingLimit ? '...' : 'Simpan'}
                                </button>
                                <button
                                  onClick={() => setEditingDiscountLimit(false)}
                                  className="px-2 py-1 bg-slate-800 text-xs rounded text-slate-400 hover:text-white"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-400">Toleransi Otonom:</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-amber-400">
                                  {rule.max_autonomous_discount_pct}%
                                </span>
                                <button
                                  onClick={() => setEditingDiscountLimit(true)}
                                  className="text-xs text-slate-400 hover:text-slate-200 underline ml-1"
                                >
                                  Ubah
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Toleransi Otonom:</span>
                          <span className="font-semibold text-rose-400">0% (Nol Otonom)</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interactive Live Guardrail Simulator */}
            <div className="p-6 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    <ShieldCheck className="w-4 h-4" />
                    Simulator Uji Coba Penegakan Guardrail
                  </div>
                  <h2 className="text-lg font-bold text-white">
                    Uji Penolakan Otonomi AI &amp; Pembuktian Definisi Selesai (DoD)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Simulasikan permintaan aksi berisiko tinggi oleh persona AI Agent. Sistem membuktikan bahwa permintaan diskon &gt; batas atau refund SELALU berhenti di antrean persetujuan manusia dan tidak tereksekusi otomatis.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-800">
                {/* Form Simulator */}
                <div className="md:col-span-1 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Tipe Aksi Berisiko:
                    </label>
                    <select
                      value={simAction}
                      onChange={(e) => setSimAction(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                    >
                      <option value="DISCOUNT">Diskon Penjualan (DISCOUNT)</option>
                      <option value="REFUND">Pengembalian Dana (REFUND)</option>
                      <option value="CANCEL_ORDER">Pembatalan Pesanan (CANCEL_ORDER)</option>
                      <option value="CUSTOM_CONTRACT">Kontrak Khusus (CUSTOM_CONTRACT)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Persona AI Pemohon:
                    </label>
                    <select
                      value={simPersona}
                      onChange={(e) => setSimPersona(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                    >
                      <option value="sales_specialist">sales_specialist (Spesialis Penjualan)</option>
                      <option value="outbound_agent">outbound_agent (Agen Prospek)</option>
                      <option value="customer_support">customer_support (Layanan Pelanggan)</option>
                    </select>
                  </div>

                  {simAction === 'DISCOUNT' && (
                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-300 mb-1.5">
                        <span>Permintaan Diskon AI (%):</span>
                        <span className="text-rose-400 font-bold">{simDiscountPct}%</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={50}
                        value={simDiscountPct}
                        onChange={(e) => setSimDiscountPct(Number(e.target.value))}
                        className="w-full accent-rose-500"
                      />
                      <span className="text-[11px] text-slate-500 block mt-1">
                        Batas otonom saat ini adalah 10%. Nilai di atas 10% wajib berhenti di approval.
                      </span>
                    </div>
                  )}

                  {simAction === 'REFUND' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Nominal Refund (IDR):
                      </label>
                      <input
                        type="number"
                        value={simAmount}
                        onChange={(e) => setSimAmount(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  )}

                  {simAction === 'CUSTOM_CONTRACT' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Klausul Kontrak Khusus:
                      </label>
                      <input
                        type="text"
                        value={simTerms}
                        onChange={(e) => setSimTerms(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  )}

                  <button
                    onClick={handleRunSimulator}
                    disabled={simulating}
                    className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <Bot className="w-4 h-4" />
                    {simulating ? 'Mengevaluasi Guardrail...' : 'Picu Aksi AI & Uji Guardrail'}
                  </button>
                </div>

                {/* Simulation Output Banner */}
                <div className="md:col-span-2 bg-slate-950 p-5 rounded-lg border border-slate-800 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Hasil Evaluasi Guardrail Real-Time:
                    </h3>
                    {simResult ? (
                      <div className="space-y-4">
                        <div
                          className={`p-4 rounded-lg border ${
                            simResult.requires_human_approval
                              ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                              : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold text-sm mb-1">
                            {simResult.requires_human_approval ? (
                              <>
                                <AlertTriangle className="w-4 h-4 text-rose-400" />
                                EKSEKUSI DIHENTIKAN — WAJIB PERSETUJUAN MANUSIA
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                OTONOM DIEKSEKUSI (Batas Aman)
                              </>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed text-slate-300">
                            {simResult.reason}
                          </p>

                          {simResult.approval_id && (
                            <div className="mt-3 pt-3 border-t border-rose-500/20 text-xs flex flex-wrap gap-4 text-slate-300">
                              <div>
                                <span className="text-slate-400">ID Tiket Approval:</span>{' '}
                                <span className="font-mono text-white">{simResult.approval_id}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">Status:</span>{' '}
                                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">
                                  {simResult.status}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="p-3 bg-slate-900 rounded-lg text-xs font-mono text-slate-400 overflow-x-auto">
                          <div className="text-slate-500 mb-1">// Bukti Audit Ledger &amp; Keputusan Terprogram</div>
                          {JSON.stringify(simResult, null, 2)}
                        </div>
                      </div>
                    ) : (
                      <div className="h-44 flex flex-col items-center justify-center text-slate-500 text-xs">
                        <Bot className="w-8 h-8 mb-2 opacity-50" />
                        Pilih parameter di sebelah kiri lalu klik &quot;Picu Aksi AI&quot; untuk menguji coba penegakan guardrail.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Penegakan Arsitektur PRD v2.2 Bagian 3.5 &amp; 11.2</span>
                    <span className="text-emerald-400 font-medium">PostgreSQL Persisten (Supabase)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ANTREAN PERSETUJUAN MANUSIA */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-300">Status Tiket:</span>
                <div className="flex gap-1.5">
                  {['ALL', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        statusFilter === st
                          ? 'bg-rose-500 text-white font-semibold'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st === 'ALL'
                        ? 'Semua'
                        : st === 'PENDING_APPROVAL'
                        ? 'Menunggu Persetujuan'
                        : st === 'APPROVED'
                        ? 'Disetujui'
                        : 'Ditolak'}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-xs text-slate-400">
                Total Tiket: <strong className="text-white">{filteredApprovals.length}</strong>
              </span>
            </div>

            {/* List Approvals */}
            {filteredApprovals.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/60 rounded-xl border border-slate-800">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-white">Tidak ada tiket persetujuan pending</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Seluruh aksi berisiko telah ditinjau atau belum ada permintaan eskalasi baru dari AI.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredApprovals.map((item) => {
                  const isPending = item.status === 'PENDING_APPROVAL';
                  const isApproved = item.status === 'APPROVED';
                  const isRejected = item.status === 'REJECTED';

                  return (
                    <div
                      key={item.id}
                      className="p-5 bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-4"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2.5 py-1 text-xs font-bold rounded ${
                              isPending
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : isApproved
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {item.status}
                          </span>
                          <span className="text-sm font-bold text-white tracking-wide">
                            {item.action_type}
                          </span>
                          <span className="text-xs text-slate-400">
                            Resource:{' '}
                            <span className="text-slate-200 font-mono">
                              {item.target_resource_type} ({item.target_resource_id || 'N/A'})
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(item.created_at).toLocaleString('id-ID')}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-slate-500 block mb-0.5">Pemohon:</span>
                          <span className="text-slate-300 font-medium flex items-center gap-1.5">
                            <Bot className="w-3.5 h-3.5 text-rose-400" />
                            {item.requested_by_persona_type} ({item.requested_by_actor_type})
                          </span>
                        </div>

                        <div className="md:col-span-2">
                          <span className="text-slate-500 block mb-0.5">Alasan Pelanggaran Guardrail:</span>
                          <span className="text-slate-200">{item.guardrail_violation_reason}</span>
                        </div>

                        <div>
                          <span className="text-slate-500 block mb-0.5">Argumen Permintaan:</span>
                          <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 p-1.5 rounded overflow-x-auto max-h-16">
                            {JSON.stringify(item.request_payload, null, 1)}
                          </pre>
                        </div>
                      </div>

                      {/* Action buttons if Pending */}
                      {isPending && (
                        <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                          <button
                            onClick={() => {
                              setSelectedApproval(item);
                              setReviewDecision('REJECTED');
                              setReviewNotes('');
                            }}
                            className="px-4 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded-lg text-xs font-semibold transition"
                          >
                            Tolak Permintaan
                          </button>
                          <button
                            onClick={() => {
                              setSelectedApproval(item);
                              setReviewDecision('APPROVED');
                              setReviewNotes('');
                            }}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Setujui Aksi
                          </button>
                        </div>
                      )}

                      {/* Reviewed Info if resolved */}
                      {!isPending && (
                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                          <div>
                            Catatan:{' '}
                            <span className="text-slate-200">
                              {item.approval_notes || item.rejection_reason || 'Tidak ada catatan khusus.'}
                            </span>
                          </div>
                          <div>Ditinjau pada: {new Date(item.reviewed_at || item.updated_at).toLocaleString('id-ID')}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AUDIT LEDGER AKSI BERISIKO */}
        {activeTab === 'audit' && (
          <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  Audit Ledger Aksi Berisiko (PRD v2.2 Bagian 16.1)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Rekaman permanen setiap aksi yang dipicu agen AI dengan pelaporan eksplisit actor_type=&apos;ai_agent&apos; dan persona_type.
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs rounded bg-slate-800 text-slate-300 border border-slate-700">
                Log Database Supabase
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3">Waktu</th>
                    <th className="py-3 px-3">Aktor</th>
                    <th className="py-3 px-3">Persona AI</th>
                    <th className="py-3 px-3">Aksi</th>
                    <th className="py-3 px-3">Target Resource</th>
                    <th className="py-3 px-3">Status Guardrail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-300">
                  {auditLogs.map((log) => {
                    const payload = typeof log.payload_after === 'string' ? JSON.parse(log.payload_after) : log.payload_after || {};
                    const isPending = payload.status === 'PENDING_APPROVAL';

                    return (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                          {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              log.actor_type === 'ai_agent'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {log.actor_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-200">
                          {log.persona_type || payload.persona_type || 'sales_specialist'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{log.action}</td>
                        <td className="py-2.5 px-3 text-slate-400">{log.resource_type}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              isPending
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            {payload.status || 'RECORDED'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: REGISTRI PERKAKAS MCP */}
        {activeTab === 'mcp' && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 rounded-xl border border-slate-800">
              <h2 className="text-base font-bold text-white mb-1">
                Registri Perkakas MCP Kategori Risiko Tinggi (Risk Tier: HIGH)
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Seluruh perkakas berikut telah dipetakan ke risk_tier=&apos;high&apos; di tabel mcp_tools dan dihubungkan ke Unified PDP untuk mencegah eksekusi tanpa otorisasi atau tanpa verifikasi manusia.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mcpTools.map((tool) => (
                  <div key={tool.id} className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-rose-400">{tool.tool_name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        RISK: {tool.risk_tier.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{tool.description}</p>
                    <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Status: <strong className="text-emerald-400">{tool.is_active ? 'AKTIF' : 'NONAKTIF'}</strong></span>
                      <span className="text-slate-500">Wajib Human Signoff</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-rose-400" />
                Tinjauan Persetujuan Staf Manusia
              </h3>
              <button
                onClick={() => setSelectedApproval(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div>
                <span className="text-slate-500 block">Tipe Aksi:</span>
                <span className="font-semibold text-white">{selectedApproval.action_type}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Alasan Eskalasi Guardrail:</span>
                <span className="text-rose-300 font-medium">{selectedApproval.guardrail_violation_reason}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Keputusan Anda:</span>
                <div className="flex gap-3 mt-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      checked={reviewDecision === 'APPROVED'}
                      onChange={() => setReviewDecision('APPROVED')}
                      className="accent-emerald-500"
                    />
                    <span className="text-emerald-400 font-semibold">Setujui (Approve)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="decision"
                      checked={reviewDecision === 'REJECTED'}
                      onChange={() => setReviewDecision('REJECTED')}
                      className="accent-rose-500"
                    />
                    <span className="text-rose-400 font-semibold">Tolak (Reject)</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Catatan Staf Reviewer:</label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  aria-label="Catatan alasan atau instruksi khusus peninjauan"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedApproval(null)}
                disabled={submittingReview}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className={`px-4 py-2 rounded-lg text-xs font-semibold text-white ${
                  reviewDecision === 'APPROVED'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {submittingReview ? 'Menyimpan...' : 'Kirim Keputusan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
