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
  Users
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

interface AgentCreationScreenProps {
  tenantId: string;
  userRole?: string;
  onSuccess: (newAgent: any) => void;
  onCancel: () => void;
}

export const AgentCreationScreen: React.FC<AgentCreationScreenProps> = ({
  tenantId,
  userRole = 'TENANT_OWNER',
  onSuccess,
  onCancel,
}) => {
  // Stepper state: 1 = Departemen, 2 = Katalog Jabatan, 3 = Struktural Opsional
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Data states
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [jobTitles, setJobTitles] = useState<StandardizedJobTitleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form selections
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedJobTitleId, setSelectedJobTitleId] = useState<string | null>(null);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [selectedStructuralRoleId, setSelectedStructuralRoleId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');

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
  }, [tenantId]);

  // Selected entities lookup
  const selectedDepartment = useMemo(() => {
    if (!selectedDeptId) return null;
    return departments.find((d) => d.id === selectedDeptId) || null;
  }, [departments, selectedDeptId]);

  const selectedJobTitle = useMemo(() => {
    if (!selectedJobTitleId) return null;
    return jobTitles.find((jt) => jt.id === selectedJobTitleId) || null;
  }, [jobTitles, selectedJobTitleId]);

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
    }
  }, [selectedJobTitle, selectedDepartment]);

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
        throw new Error(data.error || 'Pendaftaran agen ditolak oleh sistem.');
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

      {/* Stepper Progress Bar */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs font-medium">
          {/* Step 1 */}
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

          <div className="w-8 h-[1px] bg-slate-200 dark:bg-slate-700" />

          {/* Step 2 */}
          <div
            className={`flex items-center gap-2 cursor-pointer transition-colors ${
              currentStep === 2
                ? 'text-purple-600 dark:text-purple-400 font-bold'
                : currentStep > 2
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400'
            }`}
            onClick={() => setCurrentStep(2)}
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
            <span>Jabatan Utama (15 Katalog)</span>
          </div>

          <div className="w-8 h-[1px] bg-slate-200 dark:bg-slate-700" />

          {/* Step 3 */}
          <div
            className={`flex items-center gap-2 cursor-pointer transition-colors ${
              currentStep === 3
                ? 'text-purple-600 dark:text-purple-400 font-bold'
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
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}
            >
              3
            </div>
            <span>Struktural Opsional</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-medium hidden sm:block">
          Langkah {currentStep} dari 3
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="m-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-3 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div className="flex-1">
            <span className="font-semibold block">Pemberitahuan Sistem:</span>
            {errorMessage}
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Memuat data katalog resmi dan struktur organisasi...
            </p>
          </div>
        ) : currentStep === 1 ? (
          /* ========================================================================= */
          /* LANGKAH 1: DEPARTEMEN & PENEMPATAN KERJA                                 */
          /* ========================================================================= */
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Pilih Departemen Penempatan Agen</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tentukan unit kerja tempat agen AI akan ditempatkan, atau pilih lintas departemen untuk peran strategis platform.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Option: Lintas Departemen / Organisasi Utama */}
              <div
                onClick={() => setSelectedDeptId(null)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedDeptId === null
                    ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 ring-2 ring-purple-600/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center font-bold">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  {selectedDeptId === null && (
                    <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  )}
                </div>
                <h4 className="font-bold text-xs text-slate-900 dark:text-white mt-3">
                  Organisasi Utama / Lintas Divisi
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  Dikelola langsung di bawah kendali manajemen puncak atau melayani seluruh departemen organisasi.
                </p>
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                  Cakupan Lintas Organisasi
                </div>
              </div>

              {/* Department Cards */}
              {departments.map((dept) => {
                const isSelected = selectedDeptId === dept.id;
                return (
                  <div
                    key={dept.id}
                    onClick={() => setSelectedDeptId(dept.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 ring-2 ring-purple-600/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white"
                        style={{ backgroundColor: dept.color_tag || '#8B5CF6' }}
                      >
                        <Building2 className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white mt-3">
                      {dept.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {dept.description || 'Departemen operasional aktif organisasi.'}
                    </p>
                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Staf Aktif:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {dept.active_staff_count || 0} Anggota
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                Pilihan saat ini:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {selectedDepartment ? selectedDepartment.name : 'Organisasi Utama / Lintas Divisi'}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <span>Lanjut ke Katalog Jabatan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : currentStep === 2 ? (
          /* ========================================================================= */
          /* LANGKAH 2: JABATAN UTAMA DARI 15 KATALOG TERSTANDARISASI                */
          /* ========================================================================= */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Pilih Jabatan Utama (15 Katalog Terstandarisasi)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Wajib memilih 1 dari 15 jabatan resmi. Constraint database NOT NULL akan menolak pembuatan agen tanpa katalog resmi.
                </p>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  aria-label="Cari jabatan resmi"
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                    categoryFilter === c
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {c === 'ALL' ? 'Semua (15)' : c}
                </button>
              ))}
            </div>

            {/* 15 Job Titles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[460px] overflow-y-auto pr-1">
              {filteredJobTitles.map((jt) => {
                const isSelected = selectedJobTitleId === jt.id;
                return (
                  <div
                    key={jt.id}
                    onClick={() => {
                      setSelectedJobTitleId(jt.id);
                      setSelectedSubtitleId(null);
                      if (jt.structural_role?.id) {
                        setSelectedStructuralRoleId(jt.structural_role.id);
                      }
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 ring-2 ring-emerald-600/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                            {jt.job_level?.level_code || 'L3'}
                          </span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {jt.category_tag}
                          </span>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                      </div>

                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {jt.title_name}
                      </h4>
                      <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 mb-2">
                        {jt.title_code}
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
                        {jt.primary_duties}
                      </p>

                      <div className="space-y-1.5 text-[11px] bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 mb-3">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Target className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="font-semibold truncate">Deliverable: {jt.primary_deliverable}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Shield className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">Peran: {jt.structural_role?.name || 'Spesialis'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                      <span>{jt.subtitles?.length || 0} Sub-Spesialisasi</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {jt.badge_stars}
                      </span>
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

              <div className="flex items-center gap-3">
                {!selectedJobTitleId && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Pilih 1 jabatan resmi untuk lanjut
                  </span>
                )}
                <button
                  type="button"
                  disabled={!selectedJobTitleId}
                  onClick={() => setCurrentStep(3)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                    selectedJobTitleId
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span>Lanjut ke Struktural Opsional</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* LANGKAH 3: STRUKTURAL & SPESIALISASI OPSIONAL                            */
          /* ========================================================================= */
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Konfigurasi Struktural & Nama Agen</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Langkah terakhir: tentukan sub-spesialisasi opsional, konfirmasi peran hierarki, dan beri nama resmi staf AI.
              </p>
            </div>

            {/* Subtitle / Spesialisasi Spesifik (Opsional) */}
            {selectedJobTitle && selectedJobTitle.subtitles && selectedJobTitle.subtitles.length > 0 && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Fokus Sub-Spesialisasi (Opsional)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setSelectedSubtitleId(null)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedSubtitleId === null
                        ? 'border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 ring-1 ring-purple-600/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        Umum / Seluruh Cakupan Jabatan
                      </span>
                      {selectedSubtitleId === null && (
                        <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Mencakup seluruh spektrum tugas resmi {selectedJobTitle.title_name}.
                    </p>
                  </div>

                  {selectedJobTitle.subtitles.map((sub) => {
                    const isSubSelected = selectedSubtitleId === sub.id;
                    return (
                      <div
                        key={sub.id}
                        onClick={() => setSelectedSubtitleId(sub.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSubSelected
                            ? 'border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 ring-1 ring-purple-600/30'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {sub.subtitle_name}
                          </span>
                          {isSubSelected && (
                            <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {sub.description}
                        </p>
                        {sub.focus_areas && sub.focus_areas.length > 0 && (
                          <div className="flex items-center gap-1 mt-2 overflow-hidden">
                            {sub.focus_areas.slice(0, 2).map((fa, i) => (
                              <span
                                key={i}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-medium"
                              >
                                {fa}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  <span className="text-[11px] text-slate-400 block">Tingkat Level:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedJobTitle?.job_level?.level_code} ({selectedJobTitle?.job_level?.name})
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Peran Struktural:</span>
                  <span className="font-semibold text-purple-600 dark:text-purple-400">
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
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke Katalog</span>
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
