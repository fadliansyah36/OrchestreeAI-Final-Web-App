import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Plus,
  RefreshCw,
  Zap,
  Power,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Activity,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  ShieldCheck,
  AlertOctagon,
  Award,
  Pencil,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { LlmProviderItem, ImageProviderItem, LlmProviderModelItem } from '../types';
import { HonestErrorBanner, HonestErrorInfo } from '../components/HonestErrorBanner';

export const LlmProviderManagementScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'llm' | 'image'>('llm');
  const [llmProviders, setLlmProviders] = useState<LlmProviderItem[]>([]);
  const [imageProviders, setImageProviders] = useState<ImageProviderItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rawBackendError, setRawBackendError] = useState<HonestErrorInfo | null>(null);

  // Live Model Catalog State (Fase 133/134)
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<Record<string, LlmProviderModelItem[]>>({});
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  // New Provider Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [providerType, setProviderType] = useState('nvidia_nim');
  const [baseUrl, setBaseUrl] = useState('https://integrate.api.nvidia.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [modelsInput, setModelsInput] = useState('');
  const [priorityInput, setPriorityInput] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Provider Modal (Full CRUD)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<'llm' | 'image'>('llm');
  const [editingId, setEditingId] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editBaseUrl, setEditBaseUrl] = useState<string>('');
  const [editPriority, setEditPriority] = useState<number>(1);
  const [editModelsInput, setEditModelsInput] = useState<string>('');
  const [editEnabled, setEditEnabled] = useState<boolean>(true);
  const [isEditSubmitting, setIsEditSubmitting] = useState<boolean>(false);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    setRawBackendError(null);
    try {
      const [llmData, imgData] = await Promise.all([
        api.getLlmProviders(),
        api.getImageProviders(),
      ]);

      // Filter out any legacy cache containing eliminated providers (OpenAI, Gemini)
      const cleanLlm = (llmData || []).filter(
        (p) =>
          !p.providerType?.toLowerCase().includes('openai') &&
          !p.providerType?.toLowerCase().includes('gemini') &&
          !p.name?.toLowerCase().includes('openai') &&
          !p.name?.toLowerCase().includes('gemini')
      );

      const cleanImg = (imgData || []).filter(
        (p) =>
          !p.providerType?.toLowerCase().includes('dalle') &&
          !p.providerType?.toLowerCase().includes('openai') &&
          !p.providerType?.toLowerCase().includes('gemini') &&
          !p.name?.toLowerCase().includes('dall-e') &&
          !p.name?.toLowerCase().includes('gemini')
      );

      setLlmProviders(cleanLlm);
      setImageProviders(cleanImg);
    } catch (err: any) {
      console.error('[LlmProvider] Failed fetching providers:', err);
      setRawBackendError({
        endpoint: activeTab === 'llm' ? '/admin/llm-providers' : '/admin/image-providers',
        status: err?.status || err?.statusCode || 'BACKEND_ERROR',
        message:
          err?.message ||
          'Gagal mengambil konfigurasi provider LLM/Image dari backend server.',
        rawDetails: err?.rawDetails || err?.stack || err?.toString(),
        timestamp: new Date().toLocaleTimeString(),
      });
      setMessage({ type: 'error', text: err?.message || 'Gagal memuat data provider dari backend.' });
      // Provide fallback configuration with updated priority chain so UI remains inspectable
      setLlmProviders(api.getDefaultLlmProviders());
      setImageProviders(api.getDefaultImageProviders());
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleToggleLlm = async (id: string, currentEnabled: boolean) => {
    try {
      await api.toggleLlmProviderStatus(id);
      setMessage({ type: 'success', text: `Status provider berhasil diperbarui.` });
      fetchProviders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal mengubah status provider.' });
    }
  };

  const handleDeleteLlm = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus provider ini?')) return;
    try {
      await api.deleteLlmProvider(id);
      setMessage({ type: 'success', text: 'Provider berhasil dihapus.' });
      fetchProviders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menghapus provider.' });
    }
  };

  const handleDeleteImage = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus image provider ini?')) return;
    try {
      await api.deleteImageProvider(id);
      setMessage({ type: 'success', text: 'Image provider berhasil dihapus.' });
      fetchProviders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal menghapus image provider.' });
    }
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanModels = modelsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (cleanModels.length === 0) {
      setMessage({
        type: 'error',
        text: 'Validasi Gagal: Field "models" tidak boleh kosong! Wajib mengisi minimal 1 model ID untuk mencegah bug "model field is required" pada backend.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (activeTab === 'llm') {
        await api.createLlmProvider({
          name: providerName,
          providerType,
          baseUrl: baseUrl || undefined,
          apiKey: apiKey || undefined,
          fallbackPriority: priorityInput,
          enabled: true,
          models: cleanModels,
        });
      } else {
        await api.createImageProvider({
          name: providerName,
          providerType,
          models: cleanModels,
          priority: priorityInput,
          apiKey: apiKey || undefined,
        });
      }

      setMessage({ type: 'success', text: `Provider "${providerName}" berhasil didaftarkan.` });
      setIsModalOpen(false);
      setProviderName('');
      setBaseUrl('');
      setApiKey('');
      setModelsInput('');
      fetchProviders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal mendaftarkan provider.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditLlmModal = (provider: LlmProviderItem) => {
    setEditingType('llm');
    setEditingId(provider.id);
    setEditName(provider.name);
    setEditBaseUrl(provider.baseUrl || '');
    setEditPriority(provider.fallbackPriority ?? 1);
    setEditModelsInput(provider.models ? provider.models.join(', ') : '');
    setEditEnabled(provider.enabled);
    setIsEditModalOpen(true);
  };

  const openEditImageModal = (provider: ImageProviderItem) => {
    setEditingType('image');
    setEditingId(provider.id);
    setEditName(provider.name);
    setEditBaseUrl('');
    setEditPriority(provider.priority ?? 1);
    setEditModelsInput(provider.models ? provider.models.join(', ') : '');
    setEditEnabled(true);
    setIsEditModalOpen(true);
  };

  const handleUpdateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanModels = editModelsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (cleanModels.length === 0) {
      setMessage({
        type: 'error',
        text: 'Validasi Gagal: Field "models" tidak boleh kosong saat memperbarui provider!',
      });
      return;
    }

    setIsEditSubmitting(true);
    try {
      if (editingType === 'llm') {
        await api.updateLlmProvider(editingId, {
          name: editName,
          baseUrl: editBaseUrl || undefined,
          fallbackPriority: editPriority,
          enabled: editEnabled,
          models: cleanModels,
        });
      } else {
        await api.updateImageProvider(editingId, {
          name: editName,
          priority: editPriority,
          models: cleanModels,
        });
      }

      setMessage({ type: 'success', text: `Provider "${editName}" berhasil diperbarui.` });
      setIsEditModalOpen(false);
      fetchProviders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Gagal memperbarui provider.' });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const toggleExpandProvider = async (providerId: string) => {
    if (expandedProviderId === providerId) {
      setExpandedProviderId(null);
      return;
    }
    setExpandedProviderId(providerId);
    if (!providerModels[providerId]) {
      setIsLoadingModels(true);
      try {
        const models = await api.getLlmProviderModels(providerId);
        setProviderModels((prev) => ({ ...prev, [providerId]: models }));
      } catch (_e) {
        console.error('Failed fetching live models:', _e);
      } finally {
        setIsLoadingModels(false);
      }
    }
  };

  const getPriorityBadge = (priority: number = 1, type: 'llm' | 'image') => {
    if (type === 'llm') {
      if (priority === 1) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
            <Award className="w-3 h-3 text-emerald-400" />
            <span>Prioritas 1 • Primary Reasoning</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-700">
          <span>Prioritas 2 • Secondary Fallback</span>
        </span>
      );
    } else {
      if (priority === 1) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-700">
            <Award className="w-3 h-3 text-fuchsia-400" />
            <span>Prioritas 1 • Primary Image (Apimart)</span>
          </span>
        );
      }
      if (priority === 2) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-700">
            <span>Prioritas 2 • Secondary Image Fallback</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
          <span>Prioritas 3 • Tertiary NIM Image</span>
        </span>
      );
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-[10px] font-semibold mb-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Endpoints: /admin/llm-providers & /admin/image-providers</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <span>Multi-LLM & Image Model Routing Registry</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manajemen model foundation AI, failover prioritization, live circuit breaker, dan routing credentials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProviders}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Segarkan Registry"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              if (activeTab === 'image') {
                setProviderType('gpt_image_2');
                setProviderName('GPT-Image-2 (Apimart)');
                setBaseUrl('https://api.apimart.id/v1');
                setPriorityInput(1);
              } else {
                setProviderType('nvidia_nim');
                setProviderName('');
                setBaseUrl('https://integrate.api.nvidia.com/v1');
                setPriorityInput(1);
              }
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{activeTab === 'llm' ? 'Tambah LLM Provider' : 'Tambah Image Provider'}</span>
          </button>
        </div>
      </div>

      {/* Honest Error Banner if backend fails */}
      {rawBackendError && (
        <HonestErrorBanner
          error={rawBackendError}
          onRetry={fetchProviders}
          isRetrying={isLoading}
          title="Kegagalan Koneksi Registry Provider Backend"
        />
      )}

      {/* Exclusion & Priority Notice Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 shrink-0">
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <span className="font-bold text-white">Status Eliminasi Provider:</span>{' '}
            <span className="text-slate-300">
              OpenAI DALL-E dan Google Gemini telah dieliminasi permanen dari konfigurasi backend.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="font-mono text-emerald-400 font-semibold">
            Reasoning: NVIDIA NIM → OpenRouter
          </span>
          <span>•</span>
          <span className="font-mono text-fuchsia-400 font-semibold">
            Image: GPT-Image-2 → OpenRouter → NVIDIA NIM
          </span>
        </div>
      </div>

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

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('llm')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'llm'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>LLM Reasoning & Chat ({llmProviders.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('image')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'image'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Image Generation Providers ({imageProviders.length})</span>
        </button>
      </div>

      {/* Content */}
      {activeTab === 'llm' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {llmProviders.map((provider) => (
            <div key={provider.id} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <span>{provider.name}</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {provider.providerType}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 truncate max-w-[200px]">
                    {provider.baseUrl || 'Official Cloud Endpoint'}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleLlm(provider.id, provider.enabled)}
                  className={`p-1.5 rounded-lg border transition shrink-0 ${
                    provider.enabled
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/40'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                  title={provider.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>

              {/* Priority Badge */}
              <div>{getPriorityBadge(provider.fallbackPriority, 'llm')}</div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-t border-slate-800/60 text-slate-400">
                  <span>Prioritas Failover:</span>
                  <span className="font-semibold text-slate-200">#{provider.fallbackPriority ?? 1}</span>
                </div>
                <div className="flex justify-between py-1 border-t border-slate-800/60 text-slate-400">
                  <span>Spesialisasi Task:</span>
                  <span className="font-semibold text-emerald-400">
                    {provider.taskSpecialization || 'High-Throughput Reasoning'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-t border-slate-800/60 text-slate-400">
                  <span>Status Sirkuit:</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Activity className="w-3 h-3" />
                    <span>{provider.status || 'ONLINE'}</span>
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleExpandProvider(provider.id)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>
                      {expandedProviderId === provider.id
                        ? 'Tutup Model Catalog'
                        : `Lihat Live Models (${provider.models?.length ?? 0})`}
                    </span>
                    {expandedProviderId === provider.id ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditLlmModal(provider)}
                      className="p-1 text-slate-500 hover:text-emerald-400 transition"
                      title="Edit Provider"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteLlm(provider.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                      title="Hapus Provider"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Live Models from llm_provider_models */}
                {expandedProviderId === provider.id && (
                  <div className="bg-slate-950/90 rounded-lg p-3 border border-slate-800/80 space-y-2 text-xs animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5 font-medium">
                      <span>Live Catalog (llm_provider_models):</span>
                      {isLoadingModels && <span className="text-emerald-400 animate-pulse">Memuat...</span>}
                    </div>
                    {providerModels[provider.id] && providerModels[provider.id].length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {providerModels[provider.id].map((mod) => (
                          <div
                            key={mod.id}
                            className="p-2 rounded bg-slate-900/90 border border-slate-800/60 hover:border-emerald-700/50 transition"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white font-mono text-[11px]">{mod.modelId}</span>
                              {mod.isDefault && (
                                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                                  Default
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                              <span>Ctx: {(mod.contextWindow || 128000).toLocaleString()} tok</span>
                              <span className="text-emerald-400 font-mono">
                                In: ${mod.inputCostPerMillion ?? 0.7}/M • Out: ${mod.outputCostPerMillion ?? 0.9}/M
                              </span>
                            </div>
                            {mod.capabilities && mod.capabilities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {mod.capabilities.map((cap, cIdx) => (
                                  <span key={cIdx} className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                                    {cap}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 py-1">
                        {isLoadingModels ? 'Mengambil model dari registry...' : 'Model default aktif terpasang.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {imageProviders.map((provider) => (
            <div key={provider.id} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">{provider.name}</h3>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {provider.providerType}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditImageModal(provider)}
                    className="p-1 text-slate-500 hover:text-emerald-400 transition"
                    title="Edit Image Provider"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteImage(provider.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                    title="Hapus Image Provider"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>{getPriorityBadge(provider.priority, 'image')}</div>

              <div className="text-xs text-slate-400 space-y-1 border-t border-slate-800/60 pt-3">
                <p className="font-semibold text-slate-300 mb-1">Model Image Terdaftar:</p>
                <div className="flex flex-wrap gap-1">
                  {provider.models?.map((m, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add Provider - STRICTLY NO OpenAI or Google Gemini */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400" />
              <span>
                {activeTab === 'llm'
                  ? 'Registrasi LLM Reasoning Provider'
                  : 'Registrasi Image Generation Provider'}
              </span>
            </h3>

            <form onSubmit={handleCreateProvider} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Provider</label>
                <input
                  type="text"
                  required
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder={
                    activeTab === 'llm'
                      ? 'Contoh: NVIDIA NIM Production Cluster'
                      : 'Contoh: GPT-Image-2 Apimart Cluster'
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tipe Provider</label>
                {activeTab === 'llm' ? (
                  <select
                    value={providerType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProviderType(val);
                      if (val === 'nvidia_nim') {
                        setBaseUrl('https://integrate.api.nvidia.com/v1');
                        setPriorityInput(1);
                      } else if (val === 'openrouter') {
                        setBaseUrl('https://openrouter.ai/api/v1');
                        setPriorityInput(2);
                      } else {
                        setBaseUrl('');
                        setPriorityInput(3);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="nvidia_nim">
                      NVIDIA NIM (Prioritas 1: meta/llama-3.1-70b-instruct, mistralai/mixtral-8x22b)
                    </option>
                    <option value="openrouter">
                      OpenRouter (Prioritas 2: Anthropic Claude 3.5, DeepSeek Chat, Meta 405B)
                    </option>
                    <option value="groq">Groq LPU (Ultra-Low Latency Inference)</option>
                    <option value="custom_ollama">Self-Hosted Ollama / vLLM (Private GPU)</option>
                  </select>
                ) : (
                  <select
                    value={providerType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProviderType(val);
                      if (val === 'gpt_image_2') {
                        setBaseUrl('https://api.apimart.id/v1');
                        setPriorityInput(1);
                      } else if (val === 'openrouter') {
                        setBaseUrl('https://openrouter.ai/api/v1');
                        setPriorityInput(2);
                      } else {
                        setBaseUrl('https://integrate.api.nvidia.com/v1');
                        setPriorityInput(3);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="gpt_image_2">GPT-Image-2 (Apimart - Prioritas 1 Primary)</option>
                    <option value="openrouter">OpenRouter Image Gateway (Prioritas 2 Fallback)</option>
                    <option value="nvidia_nim">NVIDIA NIM Visual AI (Prioritas 3 Fallback)</option>
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Urutan Prioritas Fallback
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={priorityInput}
                    onChange={(e) => setPriorityInput(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Model IDs (koma terpisah) <span className="text-rose-400 font-bold">*Wajib</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={modelsInput}
                    onChange={(e) => setModelsInput(e.target.value)}
                    placeholder="Contoh: meta/llama-3.3-70b-instruct, mistralai/mixtral-8x22b-instruct"
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Wajib diisi minimal 1 ID model untuk mencegah error <span className="text-rose-400 font-mono">model field is required</span> pada backend.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Base URL (Opsional jika standard)
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://integrate.api.nvidia.com/v1"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  API Key (Enkripsi Kriptografis)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="nvapi-..."
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
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
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Provider Modal (Full CRUD) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-emerald-400" />
                <span>
                  {editingType === 'llm'
                    ? 'Edit LLM Provider'
                    : 'Edit Image Generation Provider'}
                </span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateProvider} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Provider</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Urutan Prioritas Fallback
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editPriority}
                    onChange={(e) => setEditPriority(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Status Operasional
                  </label>
                  <select
                    value={editEnabled ? 'true' : 'false'}
                    onChange={(e) => setEditEnabled(e.target.value === 'true')}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="true">Aktif (Enabled)</option>
                    <option value="false">Nonaktif (Disabled)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Model IDs (koma terpisah) <span className="text-rose-400 font-bold">*Wajib</span>
                </label>
                <input
                  type="text"
                  required
                  value={editModelsInput}
                  onChange={(e) => setEditModelsInput(e.target.value)}
                  placeholder="Contoh: meta/llama-3.3-70b-instruct, mistralai/mixtral-8x22b-instruct"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Wajib mengisi minimal 1 model ID untuk mencegah bug &quot;model field is required&quot;.
                </p>
              </div>

              {editingType === 'llm' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Base URL (Opsional)
                  </label>
                  <input
                    type="text"
                    value={editBaseUrl}
                    onChange={(e) => setEditBaseUrl(e.target.value)}
                    placeholder="https://integrate.api.nvidia.com/v1"
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

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
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition disabled:opacity-50"
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
export default LlmProviderManagementScreen;
