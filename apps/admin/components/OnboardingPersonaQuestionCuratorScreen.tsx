'use client';

import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  RefreshCw,
  Layers,
  ArrowUpDown,
  FileText,
  CheckSquare,
  Radio,
  Sliders,
  AlertTriangle,
} from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export interface PersonaQuestion {
  id: string;
  question_key: string;
  question_text: string;
  question_type: 'single_choice' | 'multi_choice' | 'essay';
  options?: Array<{ value: string; label: string }> | null;
  category: string;
  display_order: number;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'all', label: 'Semua Kategori' },
  { value: 'company_profile', label: 'Profil Perusahaan' },
  { value: 'industry', label: 'Sektor & Industri' },
  { value: 'target_market', label: 'Target Pasar' },
  { value: 'pain_points', label: 'Tantangan Operasional' },
  { value: 'goals', label: 'Sasaran Strategis' },
  { value: 'team_structure', label: 'Struktur Tim' },
  { value: 'competitor_context', label: 'Konteks Kompetitor' },
  { value: 'brand_voice', label: 'Karakter & Nada Brand' },
];

export function OnboardingPersonaQuestionCuratorScreen() {
  const [questions, setQuestions] = useState<PersonaQuestion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<PersonaQuestion | null>(null);

  // Form states
  const [formKey, setFormKey] = useState<string>('');
  const [formText, setFormText] = useState<string>('');
  const [formType, setFormType] = useState<'single_choice' | 'multi_choice' | 'essay'>('single_choice');
  const [formCategory, setFormCategory] = useState<string>('company_profile');
  const [formOrder, setFormOrder] = useState<number>(0);
  const [formRequired, setFormRequired] = useState<boolean>(true);
  const [formActive, setFormActive] = useState<boolean>(true);
  const [formOptionsText, setFormOptionsText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchQuestions = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/v1/onboarding/questions/admin', {
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Type': 'system_admin',
          'X-Tenant-Role': 'super_admin',
        },
      });
      if (!res.ok) {
        throw new Error('Gagal memuat daftar pertanyaan kuesioner.');
      }
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Gagal tersambung ke repositori kuesioner.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const openCreateModal = () => {
    setEditingQuestion(null);
    setFormKey('');
    setFormText('');
    setFormType('single_choice');
    setFormCategory('company_profile');
    setFormOrder(questions.length + 1);
    setFormRequired(true);
    setFormActive(true);
    setFormOptionsText(
      JSON.stringify(
        [
          { value: 'opsi_1', label: 'Opsi Pertama' },
          { value: 'opsi_2', label: 'Opsi Kedua' },
        ],
        null,
        2
      )
    );
    setIsModalOpen(true);
  };

  const openEditModal = (q: PersonaQuestion) => {
    setEditingQuestion(q);
    setFormKey(q.question_key);
    setFormText(q.question_text);
    setFormType(q.question_type);
    setFormCategory(q.category);
    setFormOrder(q.display_order);
    setFormRequired(q.is_required);
    setFormActive(q.is_active);
    setFormOptionsText(q.options ? JSON.stringify(q.options, null, 2) : '');
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formText.trim()) {
      setFeedback({ type: 'error', message: 'Teks pertanyaan wajib diisi.' });
      return;
    }

    let parsedOptions: Array<{ value: string; label: string }> | null = null;
    if (formType !== 'essay' && formOptionsText.trim()) {
      try {
        parsedOptions = JSON.parse(formOptionsText);
        if (!Array.isArray(parsedOptions)) {
          throw new Error('Format opsi harus berupa array JSON.');
        }
      } catch (err: any) {
        setFeedback({ type: 'error', message: `Format opsi JSON tidak valid: ${err.message}` });
        return;
      }
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (editingQuestion) {
        // Update existing question
        const res = await fetch(`/api/v1/onboarding/questions/admin/${editingQuestion.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Actor-Type': 'system_admin',
            'X-Tenant-Role': 'super_admin',
          },
          body: JSON.stringify({
            question_text: formText.trim(),
            question_type: formType,
            options: parsedOptions,
            category: formCategory,
            display_order: formOrder,
            is_required: formRequired,
            is_active: formActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Gagal memperbarui pertanyaan.');
        setFeedback({ type: 'success', message: 'Pertanyaan persona berhasil diperbarui.' });
      } else {
        // Create new question
        if (!formKey.trim()) {
          throw new Error('Kunci pertanyaan (question_key) unik wajib diisi.');
        }
        const res = await fetch('/api/v1/onboarding/questions/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Actor-Type': 'system_admin',
            'X-Tenant-Role': 'super_admin',
          },
          body: JSON.stringify({
            question_key: formKey.trim().toLowerCase(),
            question_text: formText.trim(),
            question_type: formType,
            options: parsedOptions,
            category: formCategory,
            display_order: formOrder,
            is_required: formRequired,
            is_active: formActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Gagal menambahkan pertanyaan baru.');
        setFeedback({ type: 'success', message: 'Pertanyaan persona baru berhasil ditambahkan.' });
      }

      setIsModalOpen(false);
      fetchQuestions();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (q: PersonaQuestion) => {
    try {
      const res = await fetch(`/api/v1/onboarding/questions/admin/${q.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Type': 'system_admin',
          'X-Tenant-Role': 'super_admin',
        },
        body: JSON.stringify({
          is_active: !q.is_active,
        }),
      });
      if (res.ok) {
        setQuestions((prev) =>
          prev.map((item) => (item.id === q.id ? { ...item, is_active: !q.is_active } : item))
        );
      }
    } catch (err: any) {
      console.error('Gagal mengubah status aktif pertanyaan:', err);
    }
  };

  const filteredQuestions = questions.filter((q) => {
    const matchesCategory = selectedCategory === 'all' || q.category === selectedCategory;
    const matchesSearch =
      q.question_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.question_key.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0B1220] border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-emerald-400" />
            <span>Kurator Kuesioner Persona Onboarding</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Repositori pertanyaan eksplorasi profil bisnis yang otomatis disintesis menjadi Company Brain via RAG/PGVector.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchQuestions}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition"
            title="Muat Ulang"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Pertanyaan</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
        <div className="flex items-center gap-2 w-full md:w-80 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="text"
            aria-label="Cari kata kunci atau key"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-200 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Question Table / List */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 text-xs">Memuat katalog pertanyaan persona...</div>
      ) : filteredQuestions.length === 0 ? (
        <EmptyState
          id="empty-persona-questions"
          icon={HelpCircle}
          title="Tidak Ada Pertanyaan Ditemukan"
          description="Belum ada pertanyaan pada kategori ini atau filter pencarian tidak menemukan hasil."
          actionLabel="Tambah Pertanyaan Baru"
          onAction={openCreateModal}
        />
      ) : (
        <div className="rounded-2xl border border-slate-800 overflow-hidden bg-[#0A101D]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0D1527] border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">Urutan</th>
                  <th className="py-3 px-4">Pertanyaan & Key</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Tipe Respon</th>
                  <th className="py-3 px-4 text-center">Wajib</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3 px-4 text-center font-mono text-slate-400">{q.display_order}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white max-w-md">{q.question_text}</div>
                      <div className="text-[11px] font-mono text-emerald-400 mt-0.5">{q.question_key}</div>
                      {q.options && q.options.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {q.options.slice(0, 3).map((opt) => (
                            <span
                              key={opt.value}
                              className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]"
                            >
                              {opt.label}
                            </span>
                          ))}
                          {q.options.length > 3 && (
                            <span className="text-[10px] text-slate-500 self-center">
                              +{q.options.length - 3} lainnya
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700 capitalize">
                        {q.category.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-300">
                        {q.question_type === 'single_choice' && <Radio className="w-3.5 h-3.5 text-sky-400" />}
                        {q.question_type === 'multi_choice' && <CheckSquare className="w-3.5 h-3.5 text-purple-400" />}
                        {q.question_type === 'essay' && <FileText className="w-3.5 h-3.5 text-amber-400" />}
                        <span className="capitalize">{q.question_type.replace(/_/g, ' ')}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {q.is_required ? (
                        <span className="text-emerald-400 font-semibold text-[11px]">Ya</span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Opsional</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(q)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border cursor-pointer transition ${
                          q.is_active
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900/60'
                            : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                        }`}
                      >
                        {q.is_active ? 'Aktif' : 'Non-Aktif'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openEditModal(q)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Sunting Pertanyaan"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Tambah / Sunting Pertanyaan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-[#0C1322] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>{editingQuestion ? 'Sunting Pertanyaan Persona' : 'Tambah Pertanyaan Persona Baru'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {!editingQuestion && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Question Key (Unik, snake_case)
                  </label>
                  <input
                    type="text"
                    required
                    aria-label="Question Key"
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Teks Pertanyaan
                </label>
                <textarea
                  required
                  rows={3}
                  aria-label="Teks Pertanyaan"
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tipe Respon</label>
                  <select
                    value={formType}
                    onChange={(e: any) => setFormType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="single_choice">Pilihan Tunggal (Radio)</option>
                    <option value="multi_choice">Pilihan Ganda (Checkbox)</option>
                    <option value="essay">Esai Terbuka</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Kategori Domain</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formType !== 'essay' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Opsi Pilihan (Format JSON Array)
                  </label>
                  <textarea
                    rows={4}
                    value={formOptionsText}
                    onChange={(e) => setFormOptionsText(e.target.value)}
                    aria-label="Opsi Pilihan JSON"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Urutan Tampil</label>
                  <input
                    type="number"
                    value={formOrder}
                    onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="chk-required"
                    checked={formRequired}
                    onChange={(e) => setFormRequired(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700"
                  />
                  <label htmlFor="chk-required" className="text-xs text-slate-300 cursor-pointer">
                    Pertanyaan Wajib
                  </label>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="chk-active"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700"
                  />
                  <label htmlFor="chk-active" className="text-xs text-slate-300 cursor-pointer">
                    Status Aktif
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40"
                >
                  {isSubmitting ? 'Menyimpan...' : editingQuestion ? 'Simpan Perubahan' : 'Buat Pertanyaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
