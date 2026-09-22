import React, { useState, useEffect } from 'react';
import {
  Wrench,
  ShieldAlert,
  AlertOctagon,
  RefreshCw,
  Plus,
  Trash2,
  Lock,
  Code2,
  CheckCircle2,
  X,
  Pencil,
} from 'lucide-react';
import { api } from '../lib/api';
import { McpToolItem } from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const McpToolRegistryManagementScreen: React.FC = () => {
  const [tools, setTools] = useState<McpToolItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backendError, setBackendError] = useState<HonestErrorInfo | null>(null);

  // Create Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [operationMode, setOperationMode] = useState<string>('ANY_SANDBOX');
  const [requiredRole, setRequiredRole] = useState<string>('AGENT_ROLE');

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingTool, setEditingTool] = useState<McpToolItem | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editRiskLevel, setEditRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [editOperationMode, setEditOperationMode] = useState<string>('ANY_SANDBOX');
  const [editRequiredRole, setEditRequiredRole] = useState<string>('AGENT_ROLE');
  const [isEditSubmitting, setIsEditSubmitting] = useState<boolean>(false);

  const fetchTools = async () => {
    setIsLoading(true);
    setBackendError(null);
    try {
      const data = await api.getMcpTools();
      setTools(data);
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/mcp-tools',
        status: err?.status || 500,
        message: err?.message || 'Gagal memuat registry MCP Tool.',
        rawDetails: err?.rawDetails || err,
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memuat registry MCP Tool.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await api.createMcpTool({
        name: name.trim(),
        description: description.trim() || 'MCP Tool Sandbox Agent Service',
        riskLevel,
        restrictedToOperationMode: operationMode,
        requiredRole,
      });
      setMessage({ type: 'success', text: `Tool "${name}" berhasil didaftarkan.` });
      setIsModalOpen(false);
      setName('');
      setDescription('');
      fetchTools();
    } catch (err: any) {
      setBackendError({
        endpoint: '/admin/mcp-tools',
        status: err?.status || 500,
        message: err?.message || 'Gagal mendaftarkan MCP tool.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (tool: McpToolItem) => {
    setEditingTool(tool);
    setEditName(tool.name);
    setEditDescription(tool.description || '');
    const validRisk: 'LOW' | 'MEDIUM' | 'HIGH' =
      tool.riskLevel === 'HIGH' || tool.riskLevel === 'MEDIUM' ? tool.riskLevel : 'LOW';
    setEditRiskLevel(validRisk);
    setEditOperationMode(tool.restrictedToOperationMode || 'ANY_SANDBOX');
    setEditRequiredRole(tool.requiredRole || 'AGENT_ROLE');
    setIsEditModalOpen(true);
  };

  const handleUpdateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTool || !editName.trim()) return;
    setIsEditSubmitting(true);
    try {
      await api.updateMcpTool(editingTool.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        riskLevel: editRiskLevel,
        restrictedToOperationMode: editOperationMode,
        requiredRole: editRequiredRole,
      });
      setMessage({ type: 'success', text: `Tool "${editName}" berhasil diperbarui.` });
      setIsEditModalOpen(false);
      fetchTools();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/mcp-tools/${editingTool.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal memperbarui MCP tool.',
        rawDetails: err?.rawDetails || err,
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDeleteTool = async (tool: McpToolItem) => {
    if (!window.confirm(`Yakin ingin menghapus tool "${tool.name}"?`)) return;
    try {
      await api.deleteMcpTool(tool.id);
      setMessage({ type: 'success', text: `Tool "${tool.name}" berhasil dihapus.` });
      fetchTools();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/mcp-tools/${tool.id}`,
        status: err?.status || 500,
        message: err?.message || 'Gagal menghapus MCP tool.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  const handleToggleKillSwitch = async (tool: McpToolItem) => {
    const nextState = !tool.killSwitchActive;
    try {
      await api.toggleMcpToolKillSwitch(tool.id);
      setMessage({
        type: 'success',
        text: `Kill switch untuk "${tool.name}" ${nextState ? 'DIAKTIFKAN (Tool Diblokir)' : 'DINONAKTIFKAN (Tool Aktif)'}.`,
      });
      fetchTools();
    } catch (err: any) {
      setBackendError({
        endpoint: `/admin/mcp-tools/${tool.id}/kill-switch`,
        status: err?.status || 500,
        message: err?.message || 'Gagal mengubah status kill switch.',
        rawDetails: err?.rawDetails || err,
      });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-400" />
            <span>Model Context Protocol (MCP) Tool Registry</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Sandbox eksekusi tools autonomous AI agents, fail-closed guardrails, dan emergency global kill switches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTools}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition self-start sm:self-auto"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Daftarkan MCP Tool</span>
          </button>
        </div>
      </div>

      {/* Honest Backend Error Banner */}
      <HonestErrorBanner error={backendError} onRetry={fetchTools} isRetrying={isLoading} />

      {message && (
        <div
          className={`p-3 text-xs rounded-lg border ${
            message.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Grid of Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => {
          const isBlocked = tool.killSwitchActive;
          return (
            <div
              key={tool.id}
              className={`border rounded-xl p-5 space-y-4 transition ${
                isBlocked
                  ? 'bg-rose-950/20 border-rose-900/50'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <span>{tool.name}</span>
                    <span
                      className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                        tool.riskLevel === 'HIGH'
                          ? 'bg-rose-950 text-rose-400 border-rose-800'
                          : tool.riskLevel === 'MEDIUM'
                          ? 'bg-amber-950 text-amber-400 border-amber-800'
                          : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      }`}
                    >
                      Risk: {tool.riskLevel}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tool.description}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(tool)}
                    className="p-1 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition"
                    title="Edit MCP Tool"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTool(tool)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                    title="Hapus MCP Tool"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/60 pt-3">
                <div className="flex justify-between">
                  <span>Required Role:</span>
                  <span className="font-semibold text-slate-200">{tool.requiredRole || 'AGENT_ROLE'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Operation Mode:</span>
                  <span className="font-mono text-slate-300 text-[11px]">
                    {tool.restrictedToOperationMode || 'ANY_SANDBOX'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Invocations:</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {(tool.totalInvocations ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Kill switch button */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <button
                  onClick={() => handleToggleKillSwitch(tool)}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                    isBlocked
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800 text-rose-300'
                  }`}
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>{isBlocked ? 'Matikan Kill Switch (Aktifkan Tool)' : 'Emergency Kill Switch (Blokir Tool)'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Daftarkan MCP Tool Baru */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-400" />
                <span>Daftarkan MCP Tool Baru</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTool} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Tool / MCP Identifier</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: sap_connector_query, erp_inventory_sync"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Deskripsi Fungsional</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deskripsikan kapabilitas sandbox dan batasan akses tool"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Risk Level</label>
                  <select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Required Role</label>
                  <input
                    type="text"
                    value={requiredRole}
                    onChange={(e) => setRequiredRole(e.target.value)}
                    placeholder="AGENT_ROLE"
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Operation Mode Restriction</label>
                <input
                  type="text"
                  value={operationMode}
                  onChange={(e) => setOperationMode(e.target.value)}
                  placeholder="ANY_SANDBOX, STRICT_CONTAINER, READ_ONLY"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Mendaftarkan...' : 'Simpan MCP Tool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit MCP Tool */}
      {isEditModalOpen && editingTool && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-400" />
                <span>Edit MCP Tool: {editingTool.name}</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateTool} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Tool</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Deskripsi Kapabilitas</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Risk Level</label>
                  <select
                    value={editRiskLevel}
                    onChange={(e) => setEditRiskLevel(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Required Role</label>
                  <input
                    type="text"
                    value={editRequiredRole}
                    onChange={(e) => setEditRequiredRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Operation Mode Restriction</label>
                <input
                  type="text"
                  value={editOperationMode}
                  onChange={(e) => setEditOperationMode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition disabled:opacity-50"
                >
                  {isEditSubmitting ? 'Memperbarui...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
