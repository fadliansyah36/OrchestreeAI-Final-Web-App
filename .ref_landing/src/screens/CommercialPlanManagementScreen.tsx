import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  AlertCircle,
  Save,
  RefreshCw,
  Building2,
  FileCode,
  ShieldAlert,
  Info,
  Database,
} from 'lucide-react';
import { api, PricingSyncMetadata } from '../lib/api';
import {
  CommercialPlanItem,
  CommercialPlanUpsertRequest,
  PlanFeatureEntitlementsMatrix,
} from '../types';

export const CommercialPlanManagementScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'plans' | 'entitlements' | 'overrides'>('plans');
  const [plans, setPlans] = useState<CommercialPlanItem[]>([]);
  const [matrix, setMatrix] = useState<PlanFeatureEntitlementsMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState<boolean>(false);
  const [syncMetadata, setSyncMetadata] = useState<PricingSyncMetadata | null>(null);

  // Plan Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CommercialPlanItem | null>(null);
  const [formData, setFormData] = useState<CommercialPlanUpsertRequest>({
    planCode: '',
    planName: '',
    billingInterval: 'monthly',
    price: 0,
    currency: 'IDR',
    creditAllocation: 1000,
    humanSeatLimit: 5,
    aiAgentLimit: 2,
    isPriceVisible: true,
    isActive: true,
    sortOrder: 1,
  });

  // Entitlements Matrix Editing State
  const [editingEntitlements, setEditingEntitlements] = useState<Record<string, Record<string, string>>>({});
  const [savingEntitlement, setSavingEntitlement] = useState<string | null>(null);

  // Tenant Custom Override State
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [overrideJson, setOverrideJson] = useState('{\n  "custom_agent_limit": 50,\n  "byok_allowed": true,\n  "dedicated_vpc": true\n}');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const fetchPlans = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getCommercialPlans();
      setPlans(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat commercial plans dari backend server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchMatrix = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPlanFeatureEntitlementsMatrix();
      setMatrix(data);
      setEditingEntitlements(data.matrix);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat entitlements matrix dari backend server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTenantOverride = useCallback(async (tId: string) => {
    try {
      const res = await api.getTenantCustomOverride(tId);
      if (res.customEntitlementOverride) {
        setOverrideJson(res.customEntitlementOverride);
      } else {
        setOverrideJson('{\n  \n}');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat override tenant');
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'plans') {
      fetchPlans();
    } else if (activeTab === 'entitlements') {
      fetchMatrix();
    } else if (activeTab === 'overrides') {
      if (selectedTenantId) {
        fetchTenantOverride(selectedTenantId);
      }
    }
  }, [activeTab, fetchPlans, fetchMatrix, fetchTenantOverride, selectedTenantId]);

  const handleOpenCreateModal = () => {
    setEditingPlan(null);
    setFormData({
      planCode: '',
      planName: '',
      billingInterval: 'monthly',
      price: 1500000,
      currency: 'IDR',
      creditAllocation: 5000,
      humanSeatLimit: 10,
      aiAgentLimit: 5,
      isPriceVisible: true,
      isActive: true,
      sortOrder: plans.length + 1,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (plan: CommercialPlanItem) => {
    setEditingPlan(plan);
    setFormData({
      id: plan.id,
      planCode: plan.planCode,
      planName: plan.planName,
      billingInterval: plan.billingInterval,
      price: plan.price,
      currency: plan.currency,
      creditAllocation: plan.creditAllocation,
      humanSeatLimit: plan.humanSeatLimit,
      aiAgentLimit: plan.aiAgentLimit,
      isPriceVisible: plan.isPriceVisible,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    });
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const payload: CommercialPlanUpsertRequest = {
        ...formData,
        price: formData.planCode.toLowerCase() === 'custom' ? null : Number(formData.price),
        creditAllocation: Number(formData.creditAllocation),
        humanSeatLimit: Number(formData.humanSeatLimit),
        aiAgentLimit: Number(formData.aiAgentLimit),
        sortOrder: Number(formData.sortOrder),
      };
      await api.upsertCommercialPlan(payload);
      setSuccessMessage(`Commercial plan ${formData.planCode} berhasil disimpan ke PostgreSQL`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setIsModalOpen(false);
      await fetchPlans();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan commercial plan');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePlan = async (id: string, planCode: string) => {
    if (!confirm(`Konfirmasi hapus commercial plan: ${planCode}?`)) return;
    setIsLoading(true);
    try {
      await api.deleteCommercialPlan(id);
      setSuccessMessage(`Plan ${planCode} berhasil dihapus.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchPlans();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus plan');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateEntitlement = async (planCode: string, featureKey: string, value: string) => {
    const key = `${planCode}_${featureKey}`;
    setSavingEntitlement(key);
    try {
      await api.updatePlanFeatureEntitlement({ planCode, featureKey, value });
      setEditingEntitlements((prev) => ({
        ...prev,
        [planCode]: {
          ...(prev[planCode] || {}),
          [featureKey]: value,
        },
      }));
      setSuccessMessage(`Entitlement [${planCode} -> ${featureKey}] diperbarui ke "${value}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui entitlement');
    } finally {
      setSavingEntitlement(null);
    }
  };

  const handleSaveTenantOverride = async () => {
    setIsSavingOverride(true);
    setError(null);
    try {
      // Validate JSON syntax
      JSON.parse(overrideJson);
      await api.setTenantCustomOverride(selectedTenantId, overrideJson);
      setSuccessMessage(`Custom entitlement override untuk tenant ${selectedTenantId} berhasil disimpan ke PostgreSQL`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(`Format JSON tidak valid atau gagal simpan: ${err.message}`);
    } finally {
      setIsSavingOverride(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Notice */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Commercial Plans & Entitlements Hub</h2>
            <p className="text-xs text-slate-400">
              Single Source of Truth: Seluruh harga, alokasi kredit, dan batasan seat disinkronkan langsung ke Cloud Database.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setSyncMetadata(api.getPricingSyncMetadata());
              setShowDiagnosticModal(true);
            }}
            className="flex items-center space-x-1.5 text-[11px] font-medium bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 px-2.5 py-1 rounded transition-colors cursor-pointer"
            title="Lihat status integrasi database internal (Super Admin)"
          >
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Info Integrasi DB</span>
          </button>
          <span className="text-[11px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-1 rounded">
            PostgreSQL Live Sync
          </span>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 flex items-center space-x-3 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-4 flex items-center space-x-3 text-emerald-300 text-sm">
          <Check className="w-5 h-5 shrink-0 text-emerald-400" />
          <span className="flex-1">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab Controls */}
      <div className="flex border-b border-slate-800 space-x-4">
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center space-x-2 ${
            activeTab === 'plans'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>1.1 Commercial Plans CRUD</span>
        </button>
        <button
          onClick={() => setActiveTab('entitlements')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center space-x-2 ${
            activeTab === 'entitlements'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>1.2 Plan Feature Entitlements Matrix</span>
        </button>
        <button
          onClick={() => setActiveTab('overrides')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center space-x-2 ${
            activeTab === 'overrides'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>1.3 Tenant Custom Entitlement Override</span>
        </button>
      </div>

      {/* TAB 1: Commercial Plans CRUD */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Daftar Paket Komersial Platform</h3>
              <p className="text-xs text-slate-400">
                KHUSUS plan_code="custom", harga otomatis disembunyikan dari publik (Contact Sales) dan hanya admin yang mengonfigurasi limit.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={fetchPlans}
                disabled={isLoading}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={handleOpenCreateModal}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-sm shadow-emerald-950"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Plan Baru</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Plan Code</th>
                  <th className="py-3 px-4">Plan Name</th>
                  <th className="py-3 px-4">Interval</th>
                  <th className="py-3 px-4">Harga</th>
                  <th className="py-3 px-4">Alokasi Kredit</th>
                  <th className="py-3 px-4">Seat Limit</th>
                  <th className="py-3 px-4">Agent Limit</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {plans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      {isLoading ? 'Memuat paket...' : 'Tidak ada data commercial plans di database.'}
                    </td>
                  </tr>
                ) : (
                  plans.map((p) => {
                    const isCustom = p.planCode.toLowerCase() === 'custom';
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400">{p.planCode}</td>
                        <td className="py-3 px-4 font-medium text-slate-100">{p.planName}</td>
                        <td className="py-3 px-4 capitalize">{p.billingInterval}</td>
                        <td className="py-3 px-4 font-mono">
                          {isCustom ? (
                            <span className="text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 text-[11px]">
                              Custom / Contact Sales
                            </span>
                          ) : p.price != null ? (
                            `${p.currency} ${p.price.toLocaleString('id-ID')}`
                          ) : (
                            'Gratis'
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-emerald-300">
                          {p.creditAllocation.toLocaleString()}
                        </td>
                        <td className="py-3 px-4">{p.humanSeatLimit} Seats</td>
                        <td className="py-3 px-4">{p.aiAgentLimit} Agents</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              p.isActive
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {p.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 rounded transition-colors"
                            title="Edit Plan"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePlan(p.id, p.planCode)}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors"
                            title="Hapus Plan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Plan Feature Entitlements Matrix */}
      {activeTab === 'entitlements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Plan Feature Entitlements Matrix</h3>
              <p className="text-xs text-slate-400">
                Matriks hak akses fitur per tingkatan paket. Perubahan langsung tersimpan ke tabel <code>plan_feature_entitlements</code>.
              </p>
            </div>
            <button
              onClick={fetchMatrix}
              disabled={isLoading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Matrix</span>
            </button>
          </div>

          {!matrix ? (
            <div className="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
              Memuat matriks entitlement...
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 w-1/4">Feature Key</th>
                    {matrix.planCodes.map((pc) => (
                      <th key={pc} className="py-3 px-4 font-mono font-bold text-emerald-400 uppercase text-center">
                        {pc}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {matrix.featureKeys.map((fk) => (
                    <tr key={fk} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-200">{fk}</td>
                      {matrix.planCodes.map((pc) => {
                        const val = editingEntitlements[pc]?.[fk] ?? '';
                        const isSaving = savingEntitlement === `${pc}_${fk}`;
                        const isBoolean = val === 'true' || val === 'false';

                        return (
                          <td key={pc} className="py-2 px-3 text-center">
                            {isBoolean ? (
                              <button
                                onClick={() => handleUpdateEntitlement(pc, fk, val === 'true' ? 'false' : 'true')}
                                disabled={isSaving}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                                  val === 'true'
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/60'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-750'
                                }`}
                              >
                                {isSaving ? '...' : val === 'true' ? 'Enabled' : 'Disabled'}
                              </button>
                            ) : (
                              <div className="inline-flex items-center space-x-1">
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) => {
                                    const nextVal = e.target.value;
                                    setEditingEntitlements((prev) => ({
                                      ...prev,
                                      [pc]: {
                                        ...(prev[pc] || {}),
                                        [fk]: nextVal,
                                      },
                                    }));
                                  }}
                                  className="w-24 bg-slate-950 border border-slate-800 text-center rounded px-2 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                                />
                                <button
                                  onClick={() => handleUpdateEntitlement(pc, fk, val)}
                                  disabled={isSaving}
                                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded"
                                  title="Simpan"
                                >
                                  <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                                </button>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Tenant Custom Entitlement Override */}
      {activeTab === 'overrides' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Tenant Custom Entitlement Override</h3>
              <p className="text-xs text-slate-400">
                Override khusus per tenant (terutama untuk paket Custom/Enterprise). Konfigurasi ini memiliki prioritas lebih tinggi daripada plan default.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-xs text-slate-400">Target Tenant:</label>
              <input
                type="text"
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                placeholder="tenant-id"
                className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none font-mono"
              />
              <button
                onClick={() => fetchTenantOverride(selectedTenantId)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
              >
                Muat
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 text-slate-400">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>JSON Editor (Format Key-Value Custom Overrides)</span>
              </div>
              <span className="text-slate-500 font-mono">Table: tenant_custom_entitlement_overrides</span>
            </div>

            <textarea
              rows={12}
              value={overrideJson}
              onChange={(e) => setOverrideJson(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-300 focus:border-emerald-500 focus:outline-none resize-none leading-relaxed"
              placeholder='{\n  "custom_feature": true\n}'
            />

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <Info className="w-4 h-4 text-sky-400" />
                <span>Format JSON diverifikasi sebelum disimpan ke database backend.</span>
              </div>
              <button
                onClick={handleSaveTenantOverride}
                disabled={isSavingOverride}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors shadow-sm"
              >
                <Save className={`w-3.5 h-3.5 ${isSavingOverride ? 'animate-spin' : ''}`} />
                <span>Simpan Override Tenant</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT PLAN MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-white">
                {editingPlan ? `Edit Commercial Plan: ${editingPlan.planCode}` : 'Tambah Commercial Plan Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Plan Code</label>
                  <input
                    type="text"
                    required
                    value={formData.planCode}
                    onChange={(e) => setFormData({ ...formData, planCode: e.target.value.toLowerCase() })}
                    placeholder="e.g. enterprise"
                    disabled={!!editingPlan}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Plan Name</label>
                  <input
                    type="text"
                    required
                    value={formData.planName}
                    onChange={(e) => setFormData({ ...formData, planName: e.target.value })}
                    placeholder="e.g. Enterprise Corporate"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Billing Interval</label>
                  <select
                    value={formData.billingInterval}
                    onChange={(e) => setFormData({ ...formData, billingInterval: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>

                {/* KHUSUS plan_code = 'custom': Field harga disembunyikan */}
                {formData.planCode.toLowerCase() === 'custom' ? (
                  <div className="flex flex-col justify-center">
                    <span className="text-slate-400 mb-1">Harga Publik</span>
                    <span className="text-amber-400 font-semibold bg-amber-950/40 border border-amber-800/40 px-2 py-1.5 rounded">
                      Hidden (Contact Sales)
                    </span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-400 mb-1">Harga ({formData.currency || 'IDR'})</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={formData.price ?? 0}
                      onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Alokasi Kredit</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formData.creditAllocation}
                    onChange={(e) => setFormData({ ...formData, creditAllocation: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Human Seat Limit</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.humanSeatLimit}
                    onChange={(e) => setFormData({ ...formData, humanSeatLimit: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">AI Agent Limit</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.aiAgentLimit}
                    onChange={(e) => setFormData({ ...formData, aiAgentLimit: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-6 pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-slate-800 text-emerald-500 focus:ring-0"
                  />
                  <span className="text-slate-300">Plan Aktif</span>
                </label>

                {formData.planCode.toLowerCase() !== 'custom' && (
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isPriceVisible}
                      onChange={(e) => setFormData({ ...formData, isPriceVisible: e.target.checked })}
                      className="rounded border-slate-800 text-emerald-500 focus:ring-0"
                    />
                    <span className="text-slate-300">Tampilkan Harga di Publik</span>
                  </label>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center space-x-1.5 transition-colors shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isLoading ? 'Menyimpan...' : 'Simpan Plan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Internal Super Admin Diagnostic Modal */}
      {showDiagnosticModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 text-slate-100 shadow-2xl relative">
            <button
              onClick={() => setShowDiagnosticModal(false)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Status Integrasi Server Database (Admin Internal)</h3>
                <p className="text-xs text-slate-400">Status sinkronisasi data commercial plans dan channel internal</p>
              </div>
            </div>

            {/* Connection Diagnostics */}
            <div className="space-y-2.5 text-xs font-mono bg-black/40 p-4 rounded-xl border border-slate-800 mb-5">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Backend API URL:</span>
                <span className="text-cyan-400 font-semibold">{syncMetadata?.backendUrl || 'https://api.orchestree.biz.id/api/v1'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Database Project URL:</span>
                <span className="text-blue-400 font-semibold">{syncMetadata?.supabaseUrl || 'https://db.orchestree.biz.id'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Database Table:</span>
                <span className="text-emerald-400 font-semibold">public.commercial_plans</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Realtime Channel:</span>
                <span className="text-emerald-300 font-semibold flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  <span>SUBSCRIBED (Active)</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Data Source Aktif:</span>
                <span className="text-yellow-300 font-semibold uppercase">{syncMetadata?.source || 'backend_api / database'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Update Terakhir:</span>
                <span className="text-white">{syncMetadata?.lastSyncedAt ? new Date(syncMetadata.lastSyncedAt).toLocaleString('id-ID') : 'Baru saja'}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
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
