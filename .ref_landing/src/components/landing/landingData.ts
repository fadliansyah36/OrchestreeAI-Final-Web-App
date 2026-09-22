export interface PublicAgentNode {
  id: string;
  name: string;
  role: string;
  department: 'EXECUTIVE' | 'MARKETING' | 'SALES' | 'FINANCE' | 'HR' | 'OPERATIONS' | 'CREATIVE' | 'TECH';
  type: 'AI' | 'HUMAN';
  avatarEmoji?: string;
  avatarUrl?: string;
  status: 'WORKING' | 'WAITING' | 'SCHEDULED' | 'IDLE';
  score: number;
  workingHours: string;
  humanCounterpart?: string;
  connectedTools: string[];
  currentTask: string;
  skills: string[];
  responsibilities: string[];
}

export const CANONICAL_PUBLIC_WORKFORCE_NODES: PublicAgentNode[] = [
  // Executive
  {
    id: 'agent-cos-01',
    name: 'Arya',
    role: 'AI Chief of Staff',
    department: 'EXECUTIVE',
    type: 'AI',
    avatarEmoji: '👑',
    status: 'WORKING',
    score: 98,
    workingHours: '08:00 - 20:00 WIB',
    humanCounterpart: 'Budi Santoso (CEO / Founder)',
    connectedTools: ['Slack', 'WhatsApp', 'Company Brain', 'Trello', 'Google Workspace'],
    currentTask: 'Dekomposisi sasaran Q3 & orkestrasi 14 sub-agen operasional',
    skills: ['Goal Decomposition', 'Executive Briefing', 'Multi-Agent Routing', 'SLA Governance'],
    responsibilities: ['Koordinasi lintas departemen', 'Pemberian instruksi otonom', 'Eskalasi persetujuan eksekutif'],
  },
  {
    id: 'human-ceo-01',
    name: 'Budi Santoso',
    role: 'Chief Executive Officer (CEO)',
    department: 'EXECUTIVE',
    type: 'HUMAN',
    avatarEmoji: '👔',
    status: 'WORKING',
    score: 96,
    workingHours: '08:30 - 18:00 WIB',
    humanCounterpart: 'Arya (AI Chief of Staff)',
    connectedTools: ['WhatsApp', 'Dashboard Cockpit', 'Executive Approvals'],
    currentTask: 'Meninjau laporan pertumbuhan bulanan dan menyetujui anggaran ekspansi',
    skills: ['Strategic Vision', 'Corporate Governance', 'Capital Allocation', 'Team Leadership'],
    responsibilities: ['Keputusan final bisnis', 'Kebijakan strategis', 'Evaluasi performa eksekutif'],
  },

  // Marketing
  {
    id: 'agent-mkt-01',
    name: 'Kirana',
    role: 'AI Marketing Strategist',
    department: 'MARKETING',
    type: 'AI',
    avatarEmoji: '🚀',
    status: 'WORKING',
    score: 96,
    workingHours: '08:00 - 18:00 WIB',
    humanCounterpart: 'Maya Wulandari (Marketing Director)',
    connectedTools: ['Instagram API', 'Google Analytics 4', 'Meta Ads', 'WhatsApp'],
    currentTask: 'Optimasi performa kampanye Omnichannel Q3 & alokasi budget ROAS',
    skills: ['GTM Strategy', 'Funnel Analytics', 'Audience Segmentation', 'Omnichannel Scheduling'],
    responsibilities: ['Penyusunan strategi kampanye', 'Analisis tren pasar', 'Pelaporan mingguan'],
  },
  {
    id: 'human-mkt-01',
    name: 'Maya Wulandari',
    role: 'Marketing Director',
    department: 'MARKETING',
    type: 'HUMAN',
    avatarEmoji: '👩‍💼',
    status: 'WORKING',
    score: 94,
    workingHours: '09:00 - 17:30 WIB',
    humanCounterpart: 'Kirana (AI Marketing Strategist)',
    connectedTools: ['Slack', 'Instagram', 'Trello', 'Creative Studio'],
    currentTask: 'Review dan persetujuan 8 varian konten media sosial mingguan',
    skills: ['Brand Identity', 'Campaign Approval', 'Creative Direction', 'Stakeholder Management'],
    responsibilities: ['Approval konten', 'Kepemimpinan tim promosi', 'Supervisi brand compliance'],
  },
  {
    id: 'agent-mkt-copy-02',
    name: 'Reza Copy',
    role: 'AI Persuasive Copywriter',
    department: 'MARKETING',
    type: 'AI',
    avatarEmoji: '✍️',
    status: 'WORKING',
    score: 97,
    workingHours: '08:00 - 18:00 WIB',
    humanCounterpart: 'Content Marketing Staff',
    connectedTools: ['Google Docs', 'Telegram', 'WordPress', 'Instagram'],
    currentTask: 'Sintesis 12 caption Instagram & 3 naskah video TikTok dengan Bahasa Indonesia natural',
    skills: ['Direct Response Copywriting', 'SEO Copywriting', 'Storytelling', 'Headline Hook Formulation'],
    responsibilities: ['Penulisan caption harian', 'Naskah video promosi', 'Email newsletter'],
  },
  {
    id: 'agent-mkt-social-03',
    name: 'Siti Social',
    role: 'AI Social Media Scheduler',
    department: 'MARKETING',
    type: 'AI',
    avatarEmoji: '📱',
    status: 'SCHEDULED',
    score: 99,
    workingHours: '24/7 Autopilot',
    humanCounterpart: 'Social Media Specialist',
    connectedTools: ['Instagram', 'TikTok', 'LinkedIn', 'Facebook', 'X / Twitter'],
    currentTask: 'Menjadwalkan penerbitan otomatis konten Carousel pkl 19:00 WIB',
    skills: ['Optimal Time Dispatch', 'Hashtag Matrix', 'Engagement Monitoring', 'Multi-Platform Sync'],
    responsibilities: ['Penjadwalan otomatis', 'Monitoring interaksi komentar', 'Pelaporan jangkauan'],
  },

  // Sales & CRM
  {
    id: 'agent-sales-01',
    name: 'Rian',
    role: 'AI Sales & CRM Partner',
    department: 'SALES',
    type: 'AI',
    avatarEmoji: '💼',
    status: 'WORKING',
    score: 97,
    workingHours: '08:00 - 20:00 WIB',
    humanCounterpart: 'Doni Pratama (Senior Account Executive)',
    connectedTools: ['WhatsApp Gateway', 'HubSpot CRM', 'Email', 'Google Sheets'],
    currentTask: 'Menganalisis 42 calon customer & menyiapkan draft follow-up personalisasi via WhatsApp',
    skills: ['Lead Qualification', 'WhatsApp Conversational Sales', 'Objection Handling', 'Pipeline Analytics'],
    responsibilities: ['Kualifikasi prospek', 'Draft penawaran harga', 'Pengingat follow-up otomatis'],
  },
  {
    id: 'human-sales-01',
    name: 'Doni Pratama',
    role: 'Senior Account Executive',
    department: 'SALES',
    type: 'HUMAN',
    avatarEmoji: '🧑‍💼',
    status: 'WORKING',
    score: 95,
    workingHours: '08:30 - 17:30 WIB',
    humanCounterpart: 'Rian (AI Sales Partner)',
    connectedTools: ['WhatsApp', 'CRM Mobile', 'Zoom'],
    currentTask: 'Meeting negosiasi kontrak enterprise dengan 3 klien B2B utama',
    skills: ['High-Value Negotiation', 'Relationship Building', 'Deal Closing', 'Contract Structuring'],
    responsibilities: ['Penutupan deal enterprise', 'Pertemuan tatap muka klien', 'Persetujuan diskon khusus'],
  },

  // Creative & Production
  {
    id: 'agent-creative-01',
    name: 'Dimas Art',
    role: 'AI Creative Director & Video Specialist',
    department: 'CREATIVE',
    type: 'AI',
    avatarEmoji: '🎨',
    status: 'WORKING',
    score: 98,
    workingHours: '08:00 - 18:00 WIB',
    humanCounterpart: 'Andi Creative Lead',
    connectedTools: ['OpenAI GPT-4o', 'Gemini 3.7 Flash', 'Imagen 3', 'Creative Studio'],
    currentTask: 'Render storyboard 4-scene visual untuk peluncuran produk dengan visual safe-zone compliance',
    skills: ['Visual Synthesis', 'Prompt Engineering', 'Color Grading Tokens', 'Multi-Format Export'],
    responsibilities: ['Sintesis aset visual & copywriting', 'Pemeriksaan safe-zone visual', 'Generasi storyboard'],
  },
  {
    id: 'agent-brand-02',
    name: 'Citra Guardian',
    role: 'AI Brand & Compliance Guardian',
    department: 'CREATIVE',
    type: 'AI',
    avatarEmoji: '🛡️',
    status: 'WORKING',
    score: 99,
    workingHours: '24/7 Autopilot',
    humanCounterpart: 'Head of Brand',
    connectedTools: ['Brand Kit Engine', 'Claim Filters', 'Palette Verifier'],
    currentTask: 'Memverifikasi rasio kontras palet warna #10B981 & filter klaim terlarang pada 6 materi promo',
    skills: ['WCAG AAA Verification', 'Forbidden Claims Detection', 'Typography Scale Enforcer', 'HMAC Validation'],
    responsibilities: ['Audit visual token brand', 'Pencegahan klaim menyesatkan', 'Quality gate rilis'],
  },

  // Finance & Accounting
  {
    id: 'agent-cfo-01',
    name: 'Hendra',
    role: 'AI CFO & Financial Modeler',
    department: 'FINANCE',
    type: 'AI',
    avatarEmoji: '📈',
    status: 'WORKING',
    score: 98,
    workingHours: '08:00 - 18:00 WIB',
    humanCounterpart: 'Siti Rahma (Finance Manager)',
    connectedTools: ['Jurnal / Accurate API', 'Bank BCA API', 'Google Sheets', 'Invoice Vault'],
    currentTask: 'Rekonsiliasi 128 invoice masuk, analisis cash runway 6 bulan, dan deteksi anomali pengeluaran',
    skills: ['Cashflow Forecasting', 'Automated Reconciliation', 'Anomaly Detection', 'Unit Economics LTV/CAC'],
    responsibilities: ['Penyusunan cashflow harian', 'Rekonsiliasi rekening koran', 'Kalkulasi laba kotor'],
  },
  {
    id: 'human-cfo-01',
    name: 'Siti Rahma',
    role: 'Finance & Tax Manager',
    department: 'FINANCE',
    type: 'HUMAN',
    avatarEmoji: '👩‍💼',
    status: 'WORKING',
    score: 96,
    workingHours: '08:30 - 17:00 WIB',
    humanCounterpart: 'Hendra (AI CFO)',
    connectedTools: ['Internet Banking', 'Tax Portal', 'Financial Approvals'],
    currentTask: 'Persetujuan transfer pembayaran vendor dan validasi laporan SPT masa PPN',
    skills: ['Tax Compliance', 'Audit Oversight', 'Cashflow Authorization', 'Budget Governance'],
    responsibilities: ['Otorisasi pencairan dana', 'Kepatuhan pajak negara', 'Pemeriksaan audit eksternal'],
  },

  // Human Resources & People
  {
    id: 'agent-hr-01',
    name: 'Nadia',
    role: 'AI HR & Talent Coordinator',
    department: 'HR',
    type: 'AI',
    avatarEmoji: '👥',
    status: 'WORKING',
    score: 95,
    workingHours: '08:00 - 18:00 WIB',
    humanCounterpart: 'Rina Kartika (HR Director)',
    connectedTools: ['Talent ATS', 'WhatsApp Gateway', 'Attendance System', 'Company Brain'],
    currentTask: 'Screening 64 CV kandidat teknis dan evaluasi kehadiran & produktivitas mingguan tim',
    skills: ['Automated Candidate Screening', 'Workforce Sentiment Analysis', 'Policy FAQ Answering', 'KPI Tracking'],
    responsibilities: ['Penyaringan awal kandidat', 'Onboarding otomatis staff baru', 'Penyusunan rekap absensi'],
  },

  // Operations & Logistics
  {
    id: 'agent-ops-01',
    name: 'Bagus',
    role: 'AI Operations & Logistics Controller',
    department: 'OPERATIONS',
    type: 'AI',
    avatarEmoji: '⚙️',
    status: 'WORKING',
    score: 97,
    workingHours: '24/7 Autopilot',
    humanCounterpart: 'Fajar (Operations Lead)',
    connectedTools: ['WMS Inventory', 'JNE / SiCepat API', 'Telegram', 'Trello'],
    currentTask: 'Monitoring 210 pengiriman barang dan otomatisasi restock PO saat buffer stock menipis',
    skills: ['Inventory Restock Trigger', 'SLA Tracking', 'Courier API Dispatch', 'Process Orchestration'],
    responsibilities: ['Pemantauan pengiriman pesanan', 'Trigger restock otomatis', 'Eskalasi keterlambatan kurir'],
  },
];

// 7 Problem -> Solution Transformations (§13)
export interface ProblemSolutionItem {
  id: string;
  problemNumber: number;
  problemTitle: string;
  problemDesc: string;
  solutionTitle: string;
  solutionDesc: string;
  stateBadge: 'DISCONNECTED' | 'CONNECTED' | 'ORCHESTRATED' | 'AUTONOMOUS' | 'MEASURABLE' | 'LEARNING';
}

export const CANONICAL_PROBLEMS_SOLUTIONS: ProblemSolutionItem[] = [
  {
    id: 'ps-1',
    problemNumber: 1,
    problemTitle: 'Karyawan Bekerja di Tool Terisolasi & Terfragmentasi',
    problemDesc: 'Chat di WhatsApp, task di Trello, spreadsheet di Google Drive, data pelanggan di CRM terpisah tanpa jembatan data.',
    solutionTitle: 'OrchestreeAI Coordination Layer',
    solutionDesc: 'Satu lapisan orkestrasi cerdas yang menghubungkan seluruh tool kerja karyawan dan AI dalam single pane of glass.',
    stateBadge: 'CONNECTED',
  },
  {
    id: 'ps-2',
    problemNumber: 2,
    problemTitle: 'Manajemen Buta Progres Pekerjaan Real-Time',
    problemDesc: 'Pimpinan baru mengetahui hambatan atau keterlambatan saat meeting mingguan yang sudah terlambat untuk dimitigasi.',
    solutionTitle: 'Real-Time Operating Cockpit',
    solutionDesc: 'Visibilitas seketika terhadap status tugas, beban kerja tim, SLA, serta eskalasi otomatis saat terjadi anomali.',
    stateBadge: 'MEASURABLE',
  },
  {
    id: 'ps-3',
    problemNumber: 3,
    problemTitle: 'Tool AI Berjalan Sendiri Tanpa Struktur Organisasi',
    problemDesc: 'ChatGPT atau Copilot dipakai personal tanpa standarisasi SOP, tanpa koordinasi, dan tanpa delegasi berantai.',
    solutionTitle: 'Organized AI Workforce',
    solutionDesc: 'AI Agen memiliki jabatan formal, jobdesk spesifik, partner kerja manusia, dan berkolaborasi layaknya departemen nyata.',
    stateBadge: 'ORCHESTRATED',
  },
  {
    id: 'ps-4',
    problemNumber: 4,
    problemTitle: 'Input Tugas & Laporan Manual Berulang Membuang Waktu',
    problemDesc: 'Staff menghabiskan 30% jam kerja hanya untuk copy-paste laporan harian dan input data administratif berulang.',
    solutionTitle: 'Chat Gateway (WhatsApp & Telegram)',
    solutionDesc: 'Staff cukup mengetik atau voice-note via WhatsApp: "@SalesAI buat penawaran ke PT Maju", sistem mengeksekusi otomatis.',
    stateBadge: 'AUTONOMOUS',
  },
  {
    id: 'ps-5',
    problemNumber: 5,
    problemTitle: 'AI Generik Buta Konteks Rahasia & SOP Perusahaan',
    problemDesc: 'Prompt AI sering halusinasi atau menghasilkan output tidak relevan karena tidak memahami riwayat dan kebijakan bisnis.',
    solutionTitle: 'Company Brain & Closed-Loop Memory',
    solutionDesc: 'AI membaca profil bisnis, SOP, katalog produk, dan histori transaksi secara terisolasi dengan proteksi RBAC ketat.',
    stateBadge: 'LEARNING',
  },
  {
    id: 'ps-6',
    problemNumber: 6,
    problemTitle: 'Output AI Tidak Pernah Menjadi Hasil Kerja Nyata',
    problemDesc: 'Teks dari AI berhenti di layar chat tanpa aksi riil ke sistem database, jadwal posting, invoice, atau inventory.',
    solutionTitle: 'Goal → Task → Tool Execution → Outcome',
    solutionDesc: 'AI mengeksekusi API pihak ketiga, menjadwalkan konten, merender video Veo 2, dan mengirim laporan terverifikasi.',
    stateBadge: 'AUTONOMOUS',
  },
  {
    id: 'ps-7',
    problemNumber: 7,
    problemTitle: 'Manajemen Tidak Dapat Membandingkan & Mengukur Efisiensi',
    problemDesc: 'Tidak ada metrik objektif untuk mengetahui ROI implementasi teknologi berbanding kontribusi SDM.',
    solutionTitle: 'Human + AI Performance Scoring & HR Audit',
    solutionDesc: 'Evaluasi performa objektif berbasis target ketercapaian, kecepatan respon, akurasi, dan kontribusi nyata.',
    stateBadge: 'MEASURABLE',
  },
];

// 8 How OrchestreeAI Works Steps (§14)
export interface HowItWorksStep {
  stepNumber: string;
  title: string;
  subtitle: string;
  description: string;
  highlightPoints: string[];
  icon: string;
}

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    stepNumber: '01',
    title: 'Connect Your Company',
    subtitle: 'Registrasi & Inisialisasi Organisasi',
    description: 'Daftarkan profil perusahaan Anda, tentukan industri vertikal, dan bangun Company Brain dengan dokumen SOP serta panduan brand resmi.',
    highlightPoints: ['Isolasi Multi-Tenant Enkripsi AES-256', 'Penyusunan Knowledge Base SOP', 'Konfigurasi Brand Visual Tokens'],
    icon: 'Building2',
  },
  {
    stepNumber: '02',
    title: 'Register Human Workforce',
    subtitle: 'Undang & Petakan Staff Asli Anda',
    description: 'Tambahkan pimpinan divisi dan staf operasional dengan peran RBAC terstruktur (CEO, Marketing, Sales, Finance, HR, Operations).',
    highlightPoints: ['Role-Based Access Control (RBAC)', 'Verifikasi Nomor WhatsApp & Email', 'Pemetaan Jobdesk & Tanggung Jawab'],
    icon: 'Users',
  },
  {
    stepNumber: '03',
    title: 'Assign AI Workforce Partners',
    subtitle: 'Pasangkan AI Spesialis ke Setiap Staff',
    description: 'Pilih dan aktifkan staf AI Agent spesialis yang bertindak sebagai partner kerja langsung bagi masing-masing staf manusia Anda.',
    highlightPoints: ['AI Chief of Staff, CFO, Copywriter, dll.', 'Hak Akses Data Proporsional', 'Target & Key Results (OKR) Khusus'],
    icon: 'Sparkles',
  },
  {
    stepNumber: '04',
    title: 'Connect Tools & Platforms',
    subtitle: 'Integrasi Ekosistem Kerja Terpadu',
    description: 'Hubungkan tool operasional yang sudah digunakan sehari-hari: WhatsApp, Telegram, Slack, Trello, Google Workspace, Instagram, hingga Accurate.',
    highlightPoints: ['Integrasi WhatsApp Gateway HMAC SHA-256', 'Koneksi REST API & Webhooks 2 Arah', 'Integrasi Model Router OpenAI & Gemini'],
    icon: 'Workflow',
  },
  {
    stepNumber: '05',
    title: 'Set Working Hours & Policies',
    subtitle: 'Atur Jadwal Kerja & Batasan Autonomi',
    description: 'Tentukan jam kerja operasional AI (misal: 08:00 - 18:00 atau 24/7 Autopilot), batasan pengeluaran finansial, dan syarat persetujuan manusia.',
    highlightPoints: ['Tingkat Autonomi: Assisted s/d Full Auto', 'Pemisahan Kebijakan Jam Sibuk', 'Eskalasi Otomatis Saat Ada Anomali'],
    icon: 'Clock',
  },
  {
    stepNumber: '06',
    title: 'AI Workforce Executes Tasks',
    subtitle: 'Eksekusi Otonom & Delegasi Berantai',
    description: 'AI Agen menerima tugas via chat atau jadwal terjadwal, menganalisis Company Brain, memanggil tools resmi, dan menghasilkan draft kerja nyata.',
    highlightPoints: ['Goal Decomposition Otomatis', 'Penyusunan Konten, Laporan, & Analitik', 'Eksekusi Multi-Step Workflow Graph'],
    icon: 'Cpu',
  },
  {
    stepNumber: '07',
    title: 'Human + AI Performance Monitoring',
    subtitle: 'Supervisi Seketika & Scoring Bulanan',
    description: 'Pantau status pengerjaan tugas di Real-Time Operating Cockpit. Pimpinan dan HR menerima rekap skor performa objektif karyawan dan AI.',
    highlightPoints: ['Skor Kualitas & Ketepatan Waktu', 'Monitoring Tingkat Eskalasi & Koreksi', 'Rekapitulasi Ketercapaian Target Bisnis'],
    icon: 'BarChart3',
  },
  {
    stepNumber: '08',
    title: 'Closed-Loop Improvement',
    subtitle: 'Pembelajaran Berkesinambungan Sistem',
    description: 'Setiap feedback koreksi dari manajer manusia otomatis disimpan ke memori jangka panjang AI sehingga kualitas kerja berikutnya semakin presisi.',
    highlightPoints: ['Memori Episodik & Semantik Terisolasi', 'Penyempurnaan SOP Mandiri', 'Peningkatan Efisiensi ROI Operasional'],
    icon: 'RefreshCw',
  },
];

// 16 AI Workforce Persona Cards (§15, §16)
export interface AiPersonaCard {
  id: string;
  name: string;
  role: string;
  department: string;
  avatarEmoji: string;
  colorTheme: string;
  skills: string[];
  responsibilities: string[];
  connectedHuman: string;
  connectedTools: string[];
  todayWorkSummary: string;
}

export const AI_WORKFORCE_PERSONAS: AiPersonaCard[] = [
  {
    id: 'p-cos',
    name: 'Arya',
    role: 'AI Chief of Staff',
    department: 'Eksekutif & Strategi',
    avatarEmoji: '👑',
    colorTheme: 'from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-300',
    skills: ['Goal Decomposition', 'Executive Briefing', 'Cross-Dept Sync', 'Governance'],
    responsibilities: ['Dekomposisi sasaran strategis pimpinan', 'Orkestrasi seluruh sub-agen divisi', 'Penyusunan laporan ringkasan eksekutif'],
    connectedHuman: 'CEO / Business Owner',
    connectedTools: ['Slack', 'WhatsApp', 'Company Brain', 'Trello'],
    todayWorkSummary: 'Mengoordinasikan peluncuran kampanye Q3 dan memonitor SLA pengerjaan 18 tugas lintas divisi.',
  },
  {
    id: 'p-cfo',
    name: 'Hendra',
    role: 'AI CFO & Financial Modeler',
    department: 'Keuangan & Akuntansi',
    avatarEmoji: '📈',
    colorTheme: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/40 text-emerald-300',
    skills: ['Cash Runway Simulation', 'Unit Economics LTV/CAC', 'Automated Reconciliation', 'Anomaly Alert'],
    responsibilities: ['Penyusunan laporan arus kas mingguan', 'Audit otomatis invoice masuk', 'Proyeksi break-even dan runway bisnis'],
    connectedHuman: 'Finance Manager / Akuntan',
    connectedTools: ['Accurate / Jurnal API', 'Bank BCA API', 'Google Sheets'],
    todayWorkSummary: 'Merekonsiliasi 128 faktur tagihan dan mendeteksi selisih pengeluaran operasional 1.4% untuk ditinjau manajer.',
  },
  {
    id: 'p-hr',
    name: 'Nadia',
    role: 'AI HR & Talent Manager',
    department: 'SDM & People Operations',
    avatarEmoji: '👥',
    colorTheme: 'from-indigo-500/20 to-blue-500/10 border-indigo-500/40 text-indigo-300',
    skills: ['Candidate Screening', 'Workforce Health Audit', 'SOP FAQ Answering', 'Performance Analytics'],
    responsibilities: ['Penyaringan otomatis CV pelamar', 'Onboarding mandiri karyawan baru via WA', 'Penyusunan evaluasi performa bulanan'],
    connectedHuman: 'HR Director / HR Specialist',
    connectedTools: ['Talent ATS', 'WhatsApp Gateway', 'Company Brain'],
    todayWorkSummary: 'Menyaring 64 CV pelamar teknis dan menjawab 18 pertanyaan staf mengenai kebijakan cuti tahunan.',
  },
  {
    id: 'p-mkt',
    name: 'Kirana',
    role: 'AI Marketing Strategist',
    department: 'Pemasaran & Pertumbuhan',
    avatarEmoji: '🚀',
    colorTheme: 'from-pink-500/20 to-rose-500/10 border-pink-500/40 text-pink-300',
    skills: ['Omnichannel GTM', 'Funnel Analytics', 'Budget Allocation', 'Audience Insights'],
    responsibilities: ['Formulasi rencana kampanye promosi', 'Analisis efisiensi ROAS iklan', 'Penyusunan kalender editorial konten'],
    connectedHuman: 'Marketing Director',
    connectedTools: ['Meta Ads API', 'Google Analytics 4', 'Instagram'],
    todayWorkSummary: 'Menyusun strategi promosi Flash Sale dan mengalokasikan anggaran periklanan Meta Ads dengan target ROAS 4.8x.',
  },
  {
    id: 'p-sales',
    name: 'Rian',
    role: 'AI Sales & CRM Partner',
    department: 'Penjualan & Akun Bisnis',
    avatarEmoji: '💼',
    colorTheme: 'from-blue-500/20 to-cyan-500/10 border-blue-500/40 text-blue-300',
    skills: ['Lead Qualification', 'WhatsApp Conversational Sales', 'Proposal Drafting', 'Pipeline Forecast'],
    responsibilities: ['Kualifikasi instan pesan prospek masuk', 'Penyusunan draft surat penawaran harga', 'Pengingat follow-up terjadwal ke sales rep'],
    connectedHuman: 'Senior Account Executive',
    connectedTools: ['HubSpot CRM', 'WhatsApp Gateway', 'Email SMTP'],
    todayWorkSummary: 'Menganalisis 42 chat prospek masuk di WhatsApp dan menyiapkan draf penawaran paket enterprise untuk 6 calon klien prioritas.',
  },
  {
    id: 'p-ops',
    name: 'Bagus',
    role: 'AI Operations Controller',
    department: 'Operasional & Logistik',
    avatarEmoji: '⚙️',
    colorTheme: 'from-slate-500/20 to-zinc-500/10 border-slate-500/40 text-slate-300',
    skills: ['Inventory Buffer Alerts', 'Courier SLA Tracking', 'Order Dispatch', 'Bottleneck Detection'],
    responsibilities: ['Monitoring alur gudang dan ekspedisi', 'Trigger order restock bahan baku otomatis', 'Peringatan dini kendala pengiriman'],
    connectedHuman: 'Operations & Supply Chain Lead',
    connectedTools: ['WMS Database', 'JNE / SiCepat API', 'Telegram'],
    todayWorkSummary: 'Melacak 210 resi pengiriman aktif dan otomatis memicu PO restock kemasan sebelum batas minimum tercapai.',
  },
  {
    id: 'p-creative',
    name: 'Dimas Art',
    role: 'AI Creative Director & Video',
    department: 'Kreatif & Visual Studio',
    avatarEmoji: '🎨',
    colorTheme: 'from-purple-500/20 to-violet-500/10 border-purple-500/40 text-purple-300',
    skills: ['Visual Synthesis', 'Visual Safe-Zone Geometry', 'Storyboard Direction', 'Multi-Format Render'],
    responsibilities: ['Generasi visual promosi dan copywriting', 'Penyusunan visual prompt konsisten', 'Pemeriksaan zona aman teks overlay'],
    connectedHuman: 'Head of Creative / Art Director',
    connectedTools: ['OpenAI GPT-4o', 'Gemini 3.7 Flash', 'Imagen 3'],
    todayWorkSummary: 'Menghasilkan 3 varian storyboard video reel produk baru dengan voiceover Bahasa Indonesia studio 48kHz.',
  },
  {
    id: 'p-social',
    name: 'Siti Social',
    role: 'AI Social Media Manager',
    department: 'Media Sosial & Distribusi',
    avatarEmoji: '📱',
    colorTheme: 'from-cyan-500/20 to-teal-500/10 border-cyan-500/40 text-cyan-300',
    skills: ['Auto Publishing Dispatch', 'Hashtag Optimization', 'Comment Triage', 'Viral Trend Curation'],
    responsibilities: ['Penjadwalan otomatis multi-platform', 'Monitoring respon komentar publik', 'Laporan engagement rate mingguan'],
    connectedHuman: 'Social Media Specialist',
    connectedTools: ['Instagram API', 'TikTok API', 'LinkedIn API', 'X API'],
    todayWorkSummary: 'Menerbitkan 4 postingan feed terjadwal dan mengelompokkan 85 komentar netizen untuk ditindaklanjuti customer support.',
  },
  {
    id: 'p-copy',
    name: 'Reza Copy',
    role: 'AI Copywriter & Storyteller',
    department: 'Pemasaran & Konten',
    avatarEmoji: '✍️',
    colorTheme: 'from-amber-500/20 to-yellow-500/10 border-amber-500/40 text-amber-300',
    skills: ['Direct Response Copy', 'SEO Articles', 'Ad Headlines', 'Email Drip Sequences'],
    responsibilities: ['Penulisan caption persuasif', 'Pembuatan naskah video pendek', 'Artikel edukasi blog perusahaan'],
    connectedHuman: 'Content Writer Staff',
    connectedTools: ['Google Docs', 'WordPress CMS', 'Grammar Checker'],
    todayWorkSummary: 'Memproduksi 12 draft caption Instagram dan 1 buletin email edukasi dengan tingkat keterbacaan tinggi.',
  },
  {
    id: 'p-support',
    name: 'Dewi Support',
    role: 'AI Customer Support Agent',
    department: 'Layanan Pelanggan',
    avatarEmoji: '💬',
    colorTheme: 'from-emerald-500/20 to-green-500/10 border-emerald-500/40 text-emerald-300',
    skills: ['24/7 First Response', 'Order Status Look-up', 'Complaint Escalation', 'Sentiment Analysis'],
    responsibilities: ['Menjawab kueri umum pelanggan dalam <5 detik', 'Pemeriksaan status pesanan dari resi', 'Eskalasi keluhan kompleks ke tim manusia'],
    connectedHuman: 'Customer Service Lead',
    connectedTools: ['WhatsApp Business API', 'CRM Ticket System', 'Live Chat'],
    todayWorkSummary: 'Menyelesaikan 182 percakapan pelanggan dengan tingkat kepuasan 98.4% dan waktu respon rata-rata 3.2 detik.',
  },
  {
    id: 'p-project',
    name: 'Tomi PM',
    role: 'AI Project Manager',
    department: 'Manajemen Proyek',
    avatarEmoji: '📋',
    colorTheme: 'from-blue-500/20 to-indigo-500/10 border-blue-500/40 text-blue-300',
    skills: ['Sprint Planning', 'Task Dependency Mapping', 'Daily Standup Summary', 'Resource Balancing'],
    responsibilities: ['Pemetaan dependensi tugas tim', 'Rekap progres harian otomatis via Slack', 'Peringatan potensi keterlambatan milestone'],
    connectedHuman: 'Senior Project Manager',
    connectedTools: ['Trello API', 'Jira API', 'Slack Bot', 'Google Calendar'],
    todayWorkSummary: 'Memperbarui status pengerjaan sprint rilis produk dan mengingatkan 3 PIC tugas yang mendekati tenggat waktu.',
  },
  {
    id: 'p-analyst',
    name: 'Farhan Data',
    role: 'AI Business & Data Analyst',
    department: 'Analitik & Business Intel',
    avatarEmoji: '📊',
    colorTheme: 'from-violet-500/20 to-purple-500/10 border-violet-500/40 text-violet-300',
    skills: ['SQL Analytics Engine', 'Cohort Retention', 'Sales Funnel Drop-off', 'Predictive Modeling'],
    responsibilities: ['Eksekusi query data analitik berkala', 'Pembuatan dashboard metrik visual', 'Identifikasi pola anomali konversi'],
    connectedHuman: 'Head of Data / BI Lead',
    connectedTools: ['PostgreSQL DB', 'BigQuery', 'Google Looker Studio'],
    todayWorkSummary: 'Menghasilkan analisis retensi pengguna bulan ke-3 dan visualisasi tren penjualan produk unggulan.',
  },
  {
    id: 'p-brand-guard',
    name: 'Citra Guardian',
    role: 'AI Brand & Compliance Guardian',
    department: 'Tata Kelola Brand',
    avatarEmoji: '🛡️',
    colorTheme: 'from-red-500/20 to-rose-500/10 border-red-500/40 text-red-300',
    skills: ['Forbidden Claims Detection', 'Color Hex Token Audit', 'WCAG Contrast Verification', 'Legal Disclaimers'],
    responsibilities: ['Penyaringan klaim promosi yang melanggar hukum', 'Audit palet warna dan tipografi', 'Pemeriksaan klausul disclaimer'],
    connectedHuman: 'Legal & Brand Director',
    connectedTools: ['Brand Kit Engine', 'Compliance Guardrails', 'OCR Scanner'],
    todayWorkSummary: 'Memvalidasi 10 materi promosi baru dan memastikan nol pelanggaran klaim terlarang sebelum disetujui kurator.',
  },
  {
    id: 'p-procure',
    name: 'Indra Procurement',
    role: 'AI Procurement & Vendor Partner',
    department: 'Pengadaan & Vendor',
    avatarEmoji: '📦',
    colorTheme: 'from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-300',
    skills: ['Vendor Price Comparison', 'Purchase Order Generator', 'Invoice Matching', 'Contract Expiry Alert'],
    responsibilities: ['Perbandingan penawaran harga vendor', 'Penyusunan draft Purchase Order (PO)', 'Pengingat perpanjangan kontrak vendor'],
    connectedHuman: 'Procurement Specialist',
    connectedTools: ['Vendor Portal', 'ERP Database', 'Google Sheets'],
    todayWorkSummary: 'Membandingkan penawaran 4 supplier bahan baku dan menghemat estimasi pengeluaran sebesar 8.2% pada PO terbaru.',
  },
  {
    id: 'p-research',
    name: 'Lestari Research',
    role: 'AI Market & Competitor Researcher',
    department: 'Riset & Intelijen Bisnis',
    avatarEmoji: '🔍',
    colorTheme: 'from-teal-500/20 to-emerald-500/10 border-teal-500/40 text-teal-300',
    skills: ['Competitor Price Scraping', 'Industry Trend Analysis', 'Regulatory Tracking', 'Patent & Tech Scouting'],
    responsibilities: ['Riset perkembangan pasar industri', 'Monitoring pergerakan harga kompetitor', 'Ekstraksi intisari laporan studi kasus'],
    connectedHuman: 'VP of Strategy / Research Lead',
    connectedTools: ['Web Search Engine', 'News Feed Scraper', 'Company Brain'],
    todayWorkSummary: 'Menyusun laporan ringkas 5 halaman mengenai strategi penetapan harga 3 kompetitor utama di pasar Asia Tenggara.',
  },
  {
    id: 'p-legal',
    name: 'Faisal Legal',
    role: 'AI Legal & Contract Support',
    department: 'Hukum & Kepatuhan',
    avatarEmoji: '⚖️',
    colorTheme: 'from-slate-500/20 to-blue-500/10 border-slate-500/40 text-slate-300',
    skills: ['NDA & Contract Review', 'Regulatory Clause Check', 'Risk Flagging', 'Legal Template Generator'],
    responsibilities: ['Pemeriksaan draft perjanjian kerjasama (NDA/MOU)', 'Identifikasi klausul berisiko tinggi', 'Penyusunan draft awal surat perjanjian'],
    connectedHuman: 'Corporate Legal Counsel',
    connectedTools: ['Contract Vault', 'Legal Document Parser', 'Company Brain'],
    todayWorkSummary: 'Memeriksa 3 draft kontrak vendor dan menandai 2 klausul ganti rugi yang memerlukan revisi oleh staf legal perusahaan.',
  },
];

// 30 Comprehensive Indonesian FAQ Questions & Answers (§28, §52)
export interface FaqItem {
  id: string;
  category: 'GENERAL' | 'WORKFORCE' | 'AI_AGENTS' | 'HUMAN_STAFF' | 'INTEGRATIONS' | 'WHATSAPP_TELEGRAM' | 'TASKS' | 'SOCIAL' | 'CREATIVE' | 'PERFORMANCE' | 'SECURITY' | 'PRICING';
  question: string;
  answer: string;
}

export const CANONICAL_FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-1',
    category: 'GENERAL',
    question: '1. Apa itu OrchestreeAI?',
    answer: 'OrchestreeAI adalah Human + AI Workforce Operating System pertama di Asia Tenggara yang menghubungkan staf manusia asli perusahaan dengan staf AI Agent spesialis untuk bekerja bersama sebagai satu sistem operasional yang terorkestrasi, otomatis, dan terukur.',
  },
  {
    id: 'faq-2',
    category: 'GENERAL',
    question: '2. Apa perbedaan AI Agent dengan chatbot biasa?',
    answer: 'Chatbot biasa bersifat reaktif dan hanya menjawab teks saat diberi prompt. Sebaliknya, AI Agent di OrchestreeAI memiliki jabatan resmi, jobdesk, jadwal kerja, otoritas memanggil tools bisnis (seperti CRM, WhatsApp, akuntansi), mampu bekerja otonom tanpa prompt manual, dan menghasilkan output pekerjaan nyata.',
  },
  {
    id: 'faq-3',
    category: 'AI_AGENTS',
    question: '3. Bagaimana AI Staff bekerja otomatis?',
    answer: 'AI Staff bekerja berdasarkan jadwal operasional (misal jam kerja 08:00 - 18:00 atau 24/7), event webhook (misal pesan prospek masuk di WhatsApp atau status pesanan baru), dan dekomposisi sasaran dari pimpinan yang dipecah menjadi pipeline sub-tugas terstruktur.',
  },
  {
    id: 'faq-4',
    category: 'HUMAN_STAFF',
    question: '4. Bagaimana saya mendaftarkan Staff Human?',
    answer: 'Melalui menu Team & Organization di OrchestreeAI, pemilik atau HR perusahaan dapat mengundang staf manusia via email dan nomor WhatsApp, lalu menetapkan peran RBAC (seperti CEO, Marketing Director, Sales Rep, Finance Manager, Staff).',
  },
  {
    id: 'faq-5',
    category: 'HUMAN_STAFF',
    question: '5. Bagaimana Staff Human terhubung dengan AI Agent?',
    answer: 'Setiap staf manusia dipasangkan secara cerdas dengan AI Agent partner spesifik di divisinya. Staf manusia menerima draf kerja, memberikan review atau revisi, dan memberikan otorisasi persetujuan akhir sebelum aksi penting dieksekusi ke publik.',
  },
  {
    id: 'faq-6',
    category: 'AI_AGENTS',
    question: '6. Bagaimana AI Agent mengetahui jobdesk?',
    answer: 'Jobdesk, SOP, batasan kewenangan, dan Key Performance Indicators (KPI) tiap agen telah dikonfigurasi dalam Capability Registry dan diselaraskan secara dinamis dengan Company Brain perusahaan Anda.',
  },
  {
    id: 'faq-7',
    category: 'AI_AGENTS',
    question: '7. Bagaimana mengatur jam kerja AI Agent?',
    answer: 'Melalui menu Pengaturan Workforce & Kebijakan, Anda dapat menentukan jam aktif masing-masing agen (contoh: Senin–Jumat pkl 08:00–18:00 WIB untuk tim administrasi, atau 24 Jam Non-Stop untuk Customer Support dan Social Media Scheduler).',
  },
  {
    id: 'faq-8',
    category: 'TASKS',
    question: '8. Bagaimana AI Agent mendapatkan task?',
    answer: 'AI Agent menerima tugas melalui 3 jalur utama: (1) Perintah chat natural dari staf manusia via WhatsApp/Telegram/Slack, (2) Pemicu otomatis dari kalender dan webhook integrasi tools, atau (3) Delegasi sasaran tingkat tinggi dari AI Chief of Staff.',
  },
  {
    id: 'faq-9',
    category: 'WHATSAPP_TELEGRAM',
    question: '9. Bisakah task dikirim melalui WhatsApp?',
    answer: 'Ya, tentu saja! Staf manusia cukup mengirim pesan teks atau voice note ke nomor WhatsApp Gateway resmi perusahaan Anda, seperti: "@MarketingAI buatkan draf kampanye promo kemerdekaan untuk Instagram". Agen akan langsung memprosesnya seketika.',
  },
  {
    id: 'faq-10',
    category: 'WHATSAPP_TELEGRAM',
    question: '10. Bisakah task dikirim melalui Telegram?',
    answer: 'Ya. OrchestreeAI mendukung integrasi bot Telegram resmi yang terotentikasi dengan tanda tangan digital HMAC SHA-256 untuk interaksi instruksi dan pelaporan tugas tim operasional.',
  },
  {
    id: 'faq-11',
    category: 'INTEGRATIONS',
    question: '11. Bisakah task berasal dari Slack?',
    answer: 'Ya. Integrasi Slack Bot memungkinkan tim Anda mengetik instruksi langsung di channel divisi (misal #sales atau #marketing) atau menerima permintaan persetujuan (approval) dengan satu kali klik.',
  },
  {
    id: 'faq-12',
    category: 'INTEGRATIONS',
    question: '12. Bisakah task berasal dari Trello?',
    answer: 'Ya. OrchestreeAI dapat memantau perpindahan kartu di papan Trello atau membuat kartu tugas baru secara otomatis saat AI menyelesaikan suatu milestone pekerjaan.',
  },
  {
    id: 'faq-13',
    category: 'WORKFORCE',
    question: '13. Bagaimana AI membaca data perusahaan?',
    answer: 'AI mengakses Company Brain yang berisikan dokumen SOP, profil bisnis, katalog produk, dan histori percakapan melalui basis data vektor terenkripsi dengan izin akses proporsional sesuai peran RBAC.',
  },
  {
    id: 'faq-14',
    category: 'WORKFORCE',
    question: '14. Apa fungsi Company Brain?',
    answer: 'Company Brain adalah pusat memori dan pengetahuan terpusat perusahaan Anda. Ini memastikan seluruh staf AI memahami konteks unik, gaya bahasa brand, harga produk, dan aturan bisnis tanpa terjadi halusinasi generik.',
  },
  {
    id: 'faq-15',
    category: 'WORKFORCE',
    question: '15. Bagaimana approval bekerja?',
    answer: 'Untuk tindakan berisiko (seperti memublikasikan postingan ke Instagram, mengirim penawaran harga bernilai besar, atau transfer dana), AI akan menghentikan eksekusi dan mengirim notifikasi izin ke staf manajer manusia yang berwenang.',
  },
  {
    id: 'faq-16',
    category: 'AI_AGENTS',
    question: '16. Apakah AI bisa melakukan pekerjaan tanpa prompt?',
    answer: 'Ya! Berbeda dengan tools AI generik, AI Workforce OrchestreeAI beroperasi secara proaktif berdasarkan jadwal waktu (cron), pemantauan data metrik, dan trigger webhook tanpa menunggu manusia mengetik prompt setiap hari.',
  },
  {
    id: 'faq-17',
    category: 'TASKS',
    question: '17. Bagaimana AI membuat laporan?',
    answer: 'AI secara otomatis mengagregasi data pengerjaan tugas, metrik ketercapaian, dan performa dari tools terintegrasi, lalu menyusunnya menjadi ringkasan PDF atau pesan rekap harian yang dikirim langsung ke WhatsApp/Email pimpinan pada sore hari.',
  },
  {
    id: 'faq-18',
    category: 'PERFORMANCE',
    question: '18. Bagaimana Human dan AI dinilai?',
    answer: 'Keduanya dinilai secara transparan dan objektif. Staf manusia dinilai berdasarkan penyelesaian tugas, ketepatan waktu, kualitas output, dan kolaborasi. Staf AI dinilai berdasarkan tingkat keberhasilan eksekusi, akurasi, waktu respon SLA, dan frekuensi intervensi manusia.',
  },
  {
    id: 'faq-19',
    category: 'PERFORMANCE',
    question: '19. Bagaimana ranking workforce bekerja?',
    answer: 'Setiap karyawan dan AI memiliki skor performa (0-100) yang dihitung secara matematis setiap siklus. Papan peringkat memberikan visibilitas kepada pimpinan untuk melihat kontribusi dan produktivitas tertinggi di setiap departemen.',
  },
  {
    id: 'faq-20',
    category: 'PERFORMANCE',
    question: '20. Bagaimana HR melakukan evaluasi bulanan?',
    answer: 'Pada akhir bulan, modul HR Analytics menyajikan ringkasan komparatif: data jam kerja, tugas terselesaikan, skor kualitas, serta rekomendasi rencana pelatihan atau optimasi alokasi kerja untuk setiap anggota tim.',
  },
  {
    id: 'faq-21',
    category: 'SOCIAL',
    question: '21. Bagaimana Social Media terhubung?',
    answer: 'OrchestreeAI terhubung langsung ke API resmi Instagram, TikTok, LinkedIn, Facebook, dan X (Twitter). Tim kreatif AI menyusun materi, meninjau kepatuhan brand, meminta approval manajer, dan menjadwalkan publikasi secara otomatis.',
  },
  {
    id: 'faq-22',
    category: 'CREATIVE',
    question: '22. Bagaimana Creative Workforce bekerja?',
    answer: 'Creative Workforce mengombinasikan Creative Director, Copywriter, dan Visual Specialist yang didukung model kelas dunia seperti OpenAI GPT-4o, Gemini 3.7, dan Imagen 3 untuk menghasilkan materi visual dan copywriting berkualitas studio dengan zona aman visual yang presisi.',
  },
  {
    id: 'faq-23',
    category: 'SECURITY',
    question: '23. Bagaimana keamanan data perusahaan?',
    answer: 'Keamanan adalah prioritas mutlak kami. Data Anda dilindungi dengan enkripsi AES-256 saat istirahat dan TLS 1.3 saat transmisi, isolasi database multi-tenant, dan otentikasi Policy Decision Point (PDP) yang ketat.',
  },
  {
    id: 'faq-24',
    category: 'SECURITY',
    question: '24. Bagaimana tenant isolation bekerja?',
    answer: 'Setiap organisasi perusahaan memiliki partisi basis data dan ruang memori terisolasi. Data rahasia dan Company Brain perusahaan Anda tidak akan pernah bocor atau tercampur dengan organisasi pengguna lainnya.',
  },
  {
    id: 'faq-25',
    category: 'PRICING',
    question: '25. Bagaimana biaya langganan dihitung?',
    answer: 'Biaya langganan dihitung secara transparan berbasis paket organisasi (Starter, Growth, Business, Enterprise) dengan kuota staf AI aktif, kapasitas staf manusia, dan integrasi yang disertakan tanpa biaya tersembunyi.',
  },
  {
    id: 'faq-26',
    category: 'AI_AGENTS',
    question: '26. Apakah AI dapat bekerja 24/7?',
    answer: 'Ya. Agen yang ditugaskan pada mode 24/7 Autopilot (seperti Customer Support, Social Scheduler, dan Anomaly Monitor) akan tetap aktif melayani dan memantau operasional bahkan saat staf manusia sedang beristirahat.',
  },
  {
    id: 'faq-27',
    category: 'SECURITY',
    question: '27. Apakah manusia tetap memiliki kontrol?',
    answer: 'Selalu. OrchestreeAI menganut prinsip Human-in-the-Loop. Anda dapat mengatur 4 level kontrol: Assisted (rekomendasi saja), Supervised (eksekusi wajib approval), Autonomous (otonom sesuai SOP), dan Escalated (wajib intervensi manual).',
  },
  {
    id: 'faq-28',
    category: 'SECURITY',
    question: '28. Apa yang terjadi jika AI gagal?',
    answer: 'Sistem memiliki mekanisme failover otomatis (misal beralih ke provider AI cadangan dengan zero-downtime) dan eskalasi otomatis. Jika tugas gagal memenuhi ambang akurasi, tugas langsung dialihkan ke staf manusia terkait beserta log penjelasannya.',
  },
  {
    id: 'faq-29',
    category: 'AI_AGENTS',
    question: '29. Bagaimana AI melakukan escalation?',
    answer: 'Saat mendeteksi situasi di luar batas toleransi SOP (seperti komplain keras pelanggan atau transaksi bernilai di atas batas wewenang), AI secara proaktif mengirim notifikasi tanda darurat ke WhatsApp/Email staf penanggung jawab.',
  },
  {
    id: 'faq-30',
    category: 'AI_AGENTS',
    question: '30. Bagaimana AI belajar dari hasil pekerjaan?',
    answer: 'Setiap masukan, koreksi teks, atau persetujuan dari manajer manusia disimpan ke Closed-Loop Memory Vault. Agen secara berkala menyempurnakan bobot penalaran dan gaya responnya agar semakin selaras dengan standar pimpinan.',
  },
];

// Pricing Plans (§23)
export interface CanonicalPlanConfig {
  id: 'starter' | 'growth' | 'business' | 'enterprise' | 'custom' | string;
  name: string;
  badge?: string;
  monthlyPriceIdr: number;
  annualPriceIdr: number;
  description: string;
  aiWorkforceCount: number;
  humanSeatsCount: number | 'Unlimited';
  taskMonthlyLimit: string;
  features: string[];
  isPopular?: boolean;
}

export const CANONICAL_PLANS: CanonicalPlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter Team',
    monthlyPriceIdr: 500000,
    annualPriceIdr: 400000,
    description: 'Cocok untuk bisnis rintisan & UMKM yang ingin mengotomatiskan tugas harian staf inti.',
    aiWorkforceCount: 1,
    humanSeatsCount: 3,
    taskMonthlyLimit: '1.000 Kredit Tugas / Bulan',
    features: [
      '1 Staf AI Spesialis (Marketing, Sales, Copy)',
      'Hingga 3 Akun Staf Manusia',
      'Integrasi WhatsApp & Telegram Gateway',
      'Company Brain (Hingga 50 Dokumen SOP)',
      'Real-time Dashboard Cockpit',
      'Dukungan Komunitas & Email Standard',
    ],
  },
  {
    id: 'growth',
    name: 'Growth Business',
    badge: 'Paling Populer',
    monthlyPriceIdr: 2500000,
    annualPriceIdr: 2000000,
    description: 'Untuk perusahaan bertumbuh yang membutuhkan orkestrasi lintas departemen penuh.',
    aiWorkforceCount: 5,
    humanSeatsCount: 15,
    taskMonthlyLimit: '6.000 Kredit Tugas / Bulan',
    isPopular: true,
    features: [
      '5 Staf AI Spesialis (Termasuk AI Chief of Staff & CFO)',
      'Hingga 15 Akun Staf Manusia',
      'Integrasi Omnichannel (WA, IG, TikTok, Slack, Trello)',
      'Creative Studio AI (OpenAI & Gemini)',
      'Company Brain & Closed-Loop Memory Vault',
      'Human + AI Performance Scoring & Ranking',
      'Dukungan Prioritas SLA 4 Jam',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise Core',
    badge: 'Skala Lengkap',
    monthlyPriceIdr: 10000000,
    annualPriceIdr: 8000000,
    description: 'Untuk korporasi menengah yang membutuhkan otomatisasi autopilot multi-cabang.',
    aiWorkforceCount: 20,
    humanSeatsCount: 50,
    taskMonthlyLimit: '30.000 Kredit Tugas / Bulan',
    features: [
      '20 Staf AI Lengkap Seluruh Divisi',
      'Hingga 50 Akun Staf Manusia',
      'Integrasi API Custom & Webhook 2 Arah',
      'Audit Kepatuhan Brand & Safe-Zone Geometri',
      'Evaluasi Kinerja Bulanan Otomatis HR',
      'Multi-Model Gateway dengan Failover Zero-Downtime',
      'Dedicated Account Manager & Training Tim',
    ],
  },
  {
    id: 'custom',
    name: 'Custom Sovereign',
    badge: 'Custom Deployment',
    monthlyPriceIdr: 0,
    annualPriceIdr: 0,
    description: 'Solusi terdedikasi on-premise atau private cloud dengan isolasi data kedaulatan penuh.',
    aiWorkforceCount: 50,
    humanSeatsCount: 'Unlimited',
    taskMonthlyLimit: 'Unlimited / Custom SLA',
    features: [
      'Unlimited / Custom Jumlah Staf AI & Human',
      'Private Cloud / On-Premise Container Ingress',
      'Kustomisasi Model AI Khusus Industri (Fine-Tuning)',
      'Enkripsi Data Tingkat Militer & Audit Keamanan Penuh',
      'SLA Uptime 99.99% & 24/7 Dedicated Support',
      'Perjanjian Kerahasiaan (NDA) Khusus Enterprise',
    ],
  },
];
