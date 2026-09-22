import React, { useState } from 'react';
import { HelpCircle, ChevronDown, Sparkles } from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const FaqSection: React.FC = () => {
  const faqs: FaqItem[] = [
    {
      id: 'faq-1',
      question: 'Apakah data perusahaan kami aman dan tidak digunakan untuk melatih model AI publik?',
      answer: 'Sangat aman. OrchestreeAI menerapkan isolasi multi-tenant dengan PostgreSQL Row-Level Security (RLS) di level database. Setiap panggilan model AI diproses melalui enkripsi koneksi perusahaan dan mematuhi kebijakan perlindungan data bisnis tanpa digunakan untuk pelatihan model publik.',
    },
    {
      id: 'faq-2',
      question: 'Bagaimana cara staf AI terhubung ke akun WhatsApp resmi perusahaan kami?',
      answer: 'Kami menggunakan integrasi resmi Meta WhatsApp Cloud API dengan kredensial sistem terenkripsi KMS. Staf AI membalas pesan sesuai wewenang dan SOP yang ditentukan manajer, dengan opsi eskalasi langsung ke staf manusia.',
    },
    {
      id: 'faq-3',
      question: 'Bagaimana model router memilih model AI terbaik untuk setiap tugas?',
      answer: 'Multi-LLM Smart Router secara otomatis menentukan rute: NVIDIA NIM sebagai prioritas utama untuk inferensi teks berkinerja tinggi, OpenRouter sebagai cadangan redundan, Gemini untuk konteks multimodal panjang, dan GPT-Image-2 untuk generasi visual terstandarisasi.',
    },
    {
      id: 'faq-4',
      question: 'Apakah tindakan staf AI dapat diawasi sebelum dieksekusi secara publik?',
      answer: 'Ya. OrchestreeAI mengadopsi prinsip Human-in-the-Loop secara baku. Tugas-tugas berisiko tinggi seperti pengiriman penawaran harga besar atau mutasi sistem mewajibkan persetujuan manajer melalui satu klik otorisasi.',
    },
    {
      id: 'faq-5',
      question: 'Bagaimana alur pendaftaran dan integrasi organisasi baru?',
      answer: 'Anda dapat mendaftar dengan membuat kode organisasi baru atau bergabung menggunakan kode perusahaan yang telah ada. Setelah menyelesaikan onboarding, sistem langsung siap digunakan.',
    },
  ];

  const [openFaqId, setOpenFaqId] = useState<string | null>(faqs[0].id);

  return (
    <section id="faq" className="py-24 bg-[#0B1B2B] text-white border-t border-white/10 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#1E6FE0]/30 text-xs font-semibold text-[#60A5FA] mb-4">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>PERTANYAAN UMUM</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Pertanyaan yang Sering Diajukan
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Informasi komprehensif mengenai arsitektur, keamanan data, dan mekanisme operasional sistem OrchestreeAI.
          </p>
        </div>

        <div className="mt-12 space-y-3">
          {faqs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <div
                key={faq.id}
                className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden transition-all"
              >
                <button
                  onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-sm sm:text-base font-bold text-white">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180 text-[#34D399]' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal border-t border-white/5 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
