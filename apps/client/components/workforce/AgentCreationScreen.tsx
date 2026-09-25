import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Sparkles,
  Shield,
  Bot,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Search,
  AlertCircle,
  Briefcase,
  Layers,
  Wrench,
  Target,
  BadgeCheck,
  Zap,
  Users,
  Boxes,
  Check
} from 'lucide-react';

export interface DepartmentItem {
  id: string;
  name: string;
  description?: string | null;
  color_tag?: string;
  active_staff_count?: number;
  manager_membership_id?: string | null;
}

export interface JobSubtitleItem {
  id: string;
  job_title_id: string;
  subtitle_code: string;
  subtitle_name: string;
  description: string;
  focus_areas: string[];
}

export interface StructuralRoleItem {
  id: string;
  role_code: string;
  name: string;
  description: string;
  hierarchy_rank: number;
}

export interface JobLevelItem {
  id: string;
  level_code: string;
  name: string;
  description: string;
  level_rank: number;
  min_complexity_multiplier: number;
}

export interface StandardizedJobTitleItem {
  id: string;
  title_code: string;
  title_name: string;
  category_tag: string;
  badge_stars: string;
  primary_duties: string;
  recommended_tools: string[];
  primary_deliverable: string;
  structural_role: StructuralRoleItem;
  job_level: JobLevelItem;
  subtitles: JobSubtitleItem[];
}

export interface TenantBlueprintItem {
  id: string;
  blueprint_code: string;
  display_name: string;
  description: string;
  industry_category: string;
  job_title_id: string;
  job_title_name?: string;
  structural_role_id?: string;
  structural_role_name?: string;
  default_skill_summary: string;
  recommended_tool_keys: string[];
  recommended_model_capability?: string;
  rollout_stage: string;
}

interface AgentCreationScreenProps {
  tenantId: string;
  userRole?: string;
  preselectedJobTitleId?: string;
  onSuccess: (newAgent: any) => void;
  onCancel: () => void;
}

export const AgentCreationScreen: React.FC<AgentCreationScreenProps> = ({
  tenantId,
  userRole = 'TENANT_OWNER',
  preselectedJobTitleId,
  onSuccess,
  onCancel,
}) => {
  // Stepper: 1 = Departemen, 2 = Katalog Jabatan, 3 = Peran Struktural, 4 = Mulai dari Blueprint (Opsional)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Data states
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [jobTitles, setJobTitles] = useState<StandardizedJobTitleItem[]>([]);
  const [blueprints, setBlueprints] = useState<TenantBlueprintItem[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form selections
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedJobTitleId, setSelectedJobTitleId] = useState<string | null>(preselectedJobTitleId || null);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [selectedStructuralRoleId, setSelectedStructuralRoleId] = useState<string | null>(null);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [customTools, setCustomTools] = useState<string[]>([]);
  const [skillSummary, setSkillSummary] = useState<string>('');

  // Step 2 Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Load departments & job titles
  useEffect(() => {
    let isMounted = true;
    async function loadInitialData() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [deptRes, jtRes] = await Promise.all([
          fetch(`/api/v1/tenants/${tenantId}/departments`),
          fetch(`/api/v1/tenants/${tenantId}/job-titles`),
        ]);

        if (deptRes.ok && jtRes.ok) {
          const deptData = await deptRes.json();
          const jtData = await jtRes.json();
          if (isMounted) {
            setDepartments(Array.isArray(deptData) ? deptData : []);
            setJobTitles(Array.isArray(jtData) ? jtData : []);
            if (preselectedJobTitleId) {
              setSelectedJobTitleId(preselectedJobTitleId);
            }
          }
        } else {
          throw new Error('Gagal memuat katalog referensi dan departemen.');
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err.message || 'Koneksi ke Supabase terganggu.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, [tenantId, preselectedJobTitleId]);

  // Selected entities lookup
  const selectedDepartment = useMemo(() => {
    if (!selectedDeptId) return null;
    return departments.find((d) => d.id === selectedDeptId) || null;
  }, [departments, selectedDeptId]);

  const selectedJobTitle = useMemo(() => {
    if (!selectedJobTitleId) return null;
    return jobTitles.find((jt) => jt.id === selectedJobTitleId) || null;
  }, [jobTitles, selectedJobTitleId]);

  const selectedBlueprint = useMemo(() => {
    if (!selectedBlueprintId) return null;
    return blueprints.find((b) => b.id === selectedBlueprintId) || null;
  }, [blueprints, selectedBlueprintId]);

  // Fetch blueprints for chosen Job Title on entering Step 4
  useEffect(() => {
    if (currentStep === 4 && selectedJobTitleId) {
      let isMounted = true;
      setLoadingBlueprints(true);
      const url = `/api/v1/tenants/${tenantId}/agent-blueprints?job_title_id=${selectedJobTitleId}${
        selectedStructuralRoleId ? `&structural_role_id=${selectedStructuralRoleId}` : ''
      }`;
      fetch(url)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (isMounted) {
            setBlueprints(Array.isArray(data) ? data : []);
          }
        })
        .catch(() => {
          if (isMounted) setBlueprints([]);
        })
        .finally(() => {
          if (isMounted) setLoadingBlueprints(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [currentStep, selectedJobTitleId, selectedStructuralRoleId, tenantId]);

  // Set default structural role & name suggestion when job title is selected
  useEffect(() => {
    if (selectedJobTitle) {
      if (!selectedStructuralRoleId && selectedJobTitle.structural_role?.id) {
        setSelectedStructuralRoleId(selectedJobTitle.structural_role.id);
      }
      if (!displayName.trim()) {
        const deptPrefix = selectedDepartment ? `${selectedDepartment.name} - ` : '';
        setDisplayName(`${deptPrefix}${selectedJobTitle.title_name}`);
      }
      if (customTools.length === 0 && selectedJobTitle.recommended_tools) {
        setCustomTools([...selectedJobTitle.recommended_tools]);
      }
    }
  }, [selectedJobTitle, selectedDepartment]);

  // When a blueprint is selected, prefill tools & skill summary while allowing edits
  const handleSelectBlueprint = (bp: TenantBlueprintItem | null) => {
    if (!bp) {
      setSelectedBlueprintId(null);
      if (selectedJobTitle) {
        setCustomTools([...(selectedJobTitle.recommended_tools || [])]);
      }
      setSkillSummary('');
    } else {
      setSelectedBlueprintId(bp.id);
      setCustomTools([...bp.recommended_tool_keys]);
      setSkillSummary(bp.default_skill_summary);
      // Pre-fill display name if tenant hasn't provided a custom one
      const deptPrefix = selectedDepartment ? `${selectedDepartment.name} - ` : '';
      setDisplayName(`${deptPrefix}${bp.display_name.replace('Blueprint: ', '')}`);
    }
  };

  const handleToggleTool = (toolKey: string) => {
    setCustomTools((prev) =>
      prev.includes(toolKey) ? prev.filter((t) => t !== toolKey) : [...prev, toolKey]
    );
  };

  // Filtered job titles for Step 2
  const filteredJobTitles = useMemo(() => {
    return jobTitles.filter((jt) => {
      const matchCat = categoryFilter === 'ALL' || jt.category_tag === categoryFilter;
      const q = searchFilter.toLowerCase();
      const matchSearch =
        !searchFilter ||
        jt.title_name.toLowerCase().includes(q) ||
        jt.title_code.toLowerCase().includes(q) ||
        jt.primary_duties.toLowerCase().includes(q) ||
        jt.primary_deliverable.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [jobTitles, categoryFilter, searchFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    jobTitles.forEach((jt) => set.add(jt.category_tag));
    return ['ALL', ...Array.from(set)];
  }, [jobTitles]);

  // Handle final agent registration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobTitleId) {
      setErrorMessage('Pemilihan Jabatan Utama dari 15 katalog resmi wajib dilakukan.');
      setCurrentStep(2);
      return;
    }

    if (!displayName.trim() || displayName.trim().length < 2) {
      setErrorMessage('Nama tampilan agen wajib diisi minimal 2 karakter.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        display_name: displayName.trim(),
        department_id: selectedDeptId || null,
        job_title_id: selectedJobTitleId, // MANDATORY: enforced by database NOT NULL constraint
        structural_role_id: selectedStructuralRoleId || null,
        job_subtitle_id: selectedSubtitleId || null,
        blueprint_id: selectedBlueprintId || null,
        default_skills: customTools,
        persona_type: selectedJobTitle?.title_code || 'custom_autonomous',
        status: 'active',
      };

      const res = await fetch(`/api/v1/tenants/${tenantId}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Role': userRole,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Pendaftaran agen ditolak oleh sistem.');
      }

      onSuccess(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan agen ke database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Registrasi Staf AI Otonom
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Penerbitan entitas kerja resmi dengan validasi constraint database NOT NULL katalog platform.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Batalkan
        </button>
      </div>

      {/* Stepper Progress Bar (4 Langkah) */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-3 text-xs font-medium">
          {/* Langkah 1 */}
          <div
            className={`flex items-center gap-2 cursor-pointer transition-colors ${
              currentStep === 1
                ? 'text-purple-600 dark:text-purple-400 font-bold'
                : currentStep > 1
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400'
            }`}
            onClick={() => setCurrentStep(1)}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                currentStep === 1
                  ? 'bg-purple-600 text-white'
                  : currentStep > 1
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {currentStep > 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : '1'}
            </div>
            <span>Departemen</span>
          </div>

          <div className="w-6 h-[1px] bg-slate-200 dark:bg-slate-700" />

          {/* Langkah 2 */}
          <div
            className={`flex items-center gap-2 cursor-pointer transition-colors ${
              currentStep === 2
                ? 'text-purple-600 dark:text-purple-400 font-bold'
                : currentStep > 2
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400'
            }`}
            onClick={() => {
              if (selectedDeptId !== undefined) setCurrentStep(2);
            }}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                currentStep === 2
                  ? 'bg-purple-600 text-white'
                  : currentStep > 2
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {currentStep > 2 ? <CheckCircle2 className="w-3.5 h-3.5" /> : '2'}
            </div>
            <span>Jabatan Utama (15 Standar)</span>
          </div>

          <div className="w-6 h-[1px] bg-slate-200 dark:bg-slate-700" />

          {/* Langkah 3 */}
          <div
            className={`flex items-center gap-2 cursor-pointer transition-colors ${
              currentStep === 3
                ? 'text-purple-600 dark:text-purple-400 font-bold'
                : currentStep > 3
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400'
            }`}
            onClick={() => {
              if (selectedJobTitleId) setCurrentStep(3);
            }}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                currentStep === 3
                  ? 'bg-purple-600 text-white'
                  : currentStep > 3
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {currentStep > 3 ? <CheckCircle2 className="w-3.5 h-3.5" /> : '3'}
            </div>
            <span>Peran Struktural</span>
          </div>

          <div className="w-6 h-[1px] bg-slate-200 dark:bg-slate-700" />

          {/* Langkah 4 */}
          <div
            className={`flex items-center gap-2 cursor-pointer transition-colors ${
              currentStep === 4
                ? 'text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-400'
            }`}
            onClick={() => {
              if (selectedJobTitleId) setCurrentStep(4);
            }}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                currentStep === 4
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}
            >
              4
            </div>
            <span className="flex items-center gap-1">
              <span>Mulai dari Blueprint</span>
              <span className="text-[10px] text-purple-500 font-semibold">(Opsional)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex items-center gap-3 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form Body */}
      <div className="p-6">
        {/* ========================================================================= */}
        {/* LANGKAH 1: PILIH DEPARTEMEN */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Langkah 1: Tentukan Departemen Penempatan Agen
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Agen AI akan bertugas di bawah hierarki manajemen departemen terpilih dan tunduk pada batas plafon kredit divisi.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Opsi Tanpa Departemen / Organisasi Utama */}
              <div
                onClick={() => setSelectedDeptId(null)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedDeptId === null
                    ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  {selectedDeptId === null && (
                    <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  )}
                </div>
                <div className="font-bold text-xs text-slate-900 dark:text-white">
                  Organisasi Utama
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Tingkat korporat langsung di bawah pengawasan pimpinan
                </div>
              </div>

              {/* Daftar Departemen Nyata */}
              {departments.map((dept) => {
                const isSelected = selectedDeptId === dept.id;
                return (
                  <div
                    key={dept.id}
                    onClick={() => setSelectedDeptId(dept.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: dept.color_tag || '#6C4CD9' }}
                      >
                        {dept.name.substring(0, 2).toUpperCase()}
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <div className="font-bold text-xs text-slate-900 dark:text-white">
                      {dept.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {dept.description || 'Departemen operasional aktif'}
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 font-mono">
                      Staf: {dept.active_staff_count || 0}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-md transition-colors"
              >
                <span>Lanjut ke Katalog Jabatan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LANGKAH 2: PILIH JABATAN UTAMA (15 KATALOG TERSTANDARISASI) */}
        {/* ========================================================================= */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Langkah 2: Pilih Jabatan Utama (15 Katalog Terstandarisasi)
                </h3>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold">
                  NOT NULL Constraint
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Setiap staf AI wajib memiliki satu jabatan resmi platform yang menetapkan wewenang SOP, level kompleksitas, dan deliverable inti.
              </p>
            </div>

            {/* Filter Kategori & Search */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Cari jabatan AI, kewajiban SOP, atau deliverable..." // allowlist: standard HTML input guidance
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      categoryFilter === cat
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid 15 Jabatan Terstandarisasi */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredJobTitles.map((jt) => {
                const isSelected = selectedJobTitleId === jt.id;
                return (
                  <div
                    key={jt.id}
                    onClick={() => {
                      setSelectedJobTitleId(jt.id);
                      if (jt.structural_role) {
                        setSelectedStructuralRoleId(jt.structural_role.id);
                      }
                      setSelectedSubtitleId(null);
                    }}
                    className={`p-4 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 shadow-sm ring-1 ring-purple-500'
                        : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-800/60 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-700 dark:text-purple-300 font-bold uppercase">
                          {jt.category_tag}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                          {jt.job_level?.level_code}
                        </span>
                      </div>

                      <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                        {jt.title_name}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {jt.primary_duties}
                      </p>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="text-[10px] text-slate-400">
                        Deliverable Utama:
                        <span className="font-medium text-slate-700 dark:text-slate-300 block truncate">
                          {jt.primary_deliverable}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>

              <button
                type="button"
                disabled={!selectedJobTitleId}
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
              >
                <span>Lanjut ke Peran Struktural</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LANGKAH 3: PILIH PERAN STRUKTURAL & SUB-BIDANG (OPSIONAL) */}
        {/* ========================================================================= */}
        {currentStep === 3 && selectedJobTitle && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Langkah 3: Peran Struktural & Penajaman Spesialisasi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Katalog default menetapkan peran struktural <strong>{selectedJobTitle.structural_role?.name}</strong>. Anda dapat memilih sub-bidang spesialisasi untuk memperjelas konteks kerja agen.
              </p>
            </div>

            {/* Card Info Peran Struktural Terpilih */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold uppercase">
                  Peran Struktural Terpilih
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Hierarki Peringkat {selectedJobTitle.structural_role?.hierarchy_rank}
                </span>
              </div>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                {selectedJobTitle.structural_role?.name} ({selectedJobTitle.structural_role?.role_code})
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {selectedJobTitle.structural_role?.description}
              </p>
            </div>

            {/* Sub-bidang Spesialisasi Jika Tersedia */}
            {selectedJobTitle.subtitles && selectedJobTitle.subtitles.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Pilih Sub-bidang Spesialisasi (Opsional)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setSelectedSubtitleId(null)}
                    className={`p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                      selectedSubtitleId === null
                        ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 font-bold text-purple-700 dark:text-purple-300'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>Standar Jabatan Utama</span>
                    <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                      Fokus pada kewajiban operasional umum tanpa sub-kualifikasi khusus
                    </span>
                  </div>

                  {selectedJobTitle.subtitles.map((sub) => {
                    const isSelected = selectedSubtitleId === sub.id;
                    return (
                      <div
                        key={sub.id}
                        onClick={() => setSelectedSubtitleId(sub.id)}
                        className={`p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                          <span>{sub.subtitle_name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-purple-600" />}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {sub.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke Katalog</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-md transition-colors"
              >
                <span>Lanjut ke Pilihan Blueprint</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LANGKAH 4: MULAI DARI BLUEPRINT (OPSIONAL) & KONFIGURASI FINAL */}
        {/* ========================================================================= */}
        {currentStep === 4 && selectedJobTitle && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Langkah 4: Mulai dari Blueprint Teruji (Opsional)
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                  Rilis Resmi GA
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Pilih template blueprint teruji untuk mempercepat pengisian perkakas dan kapabilitas model, atau lanjutkan dengan konfigurasi mandiri.
              </p>
            </div>

            {/* Blueprint Selection Cards */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                Pilih Template Blueprint Kerja
              </label>

              {loadingBlueprints ? (
                <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div className="w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span>Memeriksa ketersediaan blueprint resmi untuk {selectedJobTitle.title_name}...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                  {/* Option: Tanpa Blueprint (Kustom Mandiri) */}
                  <div
                    onClick={() => handleSelectBlueprint(null)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedBlueprintId === null
                        ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 ring-1 ring-purple-500'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        Konfigurasi Mandiri (Tanpa Blueprint)
                      </span>
                      {selectedBlueprintId === null && (
                        <CheckCircle2 className="w-4 h-4 text-purple-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mulai dari kanvas kosong dengan perkakas dasar bawaan jabatan.
                    </p>
                  </div>

                  {/* Blueprint Options */}
                  {blueprints.map((bp) => {
                    const isSelected = selectedBlueprintId === bp.id;
                    return (
                      <div
                        key={bp.id}
                        onClick={() => handleSelectBlueprint(bp)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 ring-1 ring-purple-500 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-800/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {bp.display_name}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-300 font-bold whitespace-nowrap">
                            {bp.industry_category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                          {bp.description}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {bp.recommended_tool_keys.map((tool) => (
                            <span
                              key={tool}
                              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Nama Tampilan Agen */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                Nama Tampilan Staf AI *
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <span className="text-[11px] text-slate-500 block">
                Nama ini akan muncul pada kartu kerja, antrean tiket tugas Kanban, dan riwayat deliverable.
              </span>
            </div>

            {/* Kustomisasi Perkakas Aktif (Tetap Dapat Diedit Tenant) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Perkakas Aktif untuk Staf Ini (Dapat Disesuaikan)
                </label>
                <span className="text-[11px] text-purple-500 font-mono font-semibold">
                  {customTools.length} perkakas aktif
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5">
                {customTools.length === 0 ? (
                  <span className="text-xs text-slate-400">Belum ada perkakas aktif yang dipilih.</span>
                ) : (
                  customTools.map((tool) => (
                    <span
                      key={tool}
                      onClick={() => handleToggleTool(tool)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 cursor-pointer hover:border-red-400 transition-colors"
                      title="Klik untuk menghapus perkakas ini"
                    >
                      <span>{tool}</span>
                      <span className="text-slate-400 hover:text-red-500 font-bold">×</span>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Ringkasan Pra-Penerbitan */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/60 dark:to-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <BadgeCheck className="w-4 h-4 text-emerald-500" />
                  Ringkasan Profil Pra-Penerbitan
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                  Constraint Ready
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block">Departemen:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDepartment ? selectedDepartment.name : 'Organisasi Utama'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Jabatan Resmi (Katalog):</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {selectedJobTitle?.title_name}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Acuan Blueprint:</span>
                  <span className="font-semibold text-purple-600 dark:text-purple-400">
                    {selectedBlueprint ? selectedBlueprint.display_name : 'Kustom Mandiri'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Peran Struktural:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedJobTitle?.structural_role?.name || 'Spesialis'}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>
                  Deliverable Inti: <strong>{selectedJobTitle?.primary_deliverable}</strong>
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Menerbitkan Agen Resmi...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Daftarkan Agen Resmi</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
