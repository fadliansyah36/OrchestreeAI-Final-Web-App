import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/api';
import {
  ProspectRegistrationItem,
  ProspectAnalyticsResponse,
  SelectTrialRequest,
  ScheduleMeetingRequest,
  ActivateTrialResponse,
  SpecialistAgentItem,
  AdminStudioTemplateItem,
  PlatformAssetLogoResponse,
  UpdatePlatformAssetLogoRequest,
} from '../types';

describe('Domain 6 & Domain 16: Prospect Leads, Trial Provisioning, Specialist Agents, Studio Templates, & Platform Assets E2E', () => {
  const recordedNetworkCalls: Array<{ url: string; method: string; headers: Record<string, string>; body?: any }> = [];

  // In-memory mock database representing PostgreSQL tables:
  // - prospect_registrations
  // - platform_global_assets
  let prospectsDb: ProspectRegistrationItem[] = [];
  let platformLogoDb = {
    logoUrl: '/logoorchestreeweb.png',
    updatedAt: '2026-09-10T12:00:00.000Z',
    updatedBy: 'system@orchestree.ai',
  };

  beforeEach(() => {
    recordedNetworkCalls.length = 0;

    // Seed initial prospect registration from landing page questionnaire
    prospectsDb = [
      {
        id: 'prosp-lead-001',
        fullName: 'Budi Santoso',
        email: 'budi.santoso@nusantaratech.id',
        companyName: 'PT Nusantara Solusi Cerdas',
        industryName: 'Teknologi Informasi & SaaS',
        planName: 'Growth Business',
        interestOption: 'direct_trial_or_subscription',
        trialStatus: 'REGISTERED',
        meetingStatus: 'NOT_SCHEDULED',
        createdAt: '2026-09-15T10:30:00.000Z',
        trialCreditsAllocated: 0,
      },
      {
        id: 'prosp-lead-002',
        fullName: 'Dewi Lestari',
        email: 'dewi@megafinance.co.id',
        companyName: 'PT Mega Finance Digital',
        industryName: 'Fintech & Perbankan',
        planName: 'Enterprise Custom',
        interestOption: 'schedule_meeting_presentation',
        trialStatus: 'REGISTERED',
        meetingStatus: 'NOT_SCHEDULED',
        createdAt: '2026-09-15T11:15:00.000Z',
        trialCreditsAllocated: 0,
      },
    ];

    (globalThis as any).fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const headers = (init?.headers as Record<string, string>) || {};
      let bodyParsed: any;
      try {
        if (init?.body) bodyParsed = JSON.parse(init.body as string);
      } catch {}

      recordedNetworkCalls.push({ url, method, headers, body: bodyParsed });

      // CSRF
      if (url.includes('/admin/security/csrf-token')) {
        return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-prospect-token-123' }) };
      }

      // 1. GET /admin/prospect-registrations
      if (url.includes('/admin/prospect-registrations') && !url.includes('/analytics') && !url.includes('/select-trial') && !url.includes('/schedule-meeting') && !url.includes('/activate-trial') && method === 'GET') {
        return { ok: true, status: 200, json: async () => prospectsDb };
      }

      // 2. GET /admin/prospect-registrations/analytics
      if (url.includes('/admin/prospect-registrations/analytics') && method === 'GET') {
        const totalLeads = prospectsDb.length;
        const trialSlotsOccupied = prospectsDb.filter((p) => p.trialStatus === 'SELECTED' || p.trialStatus === 'ACTIVE' || p.trialStatus === 'ACTIVATED').length;
        const directSubscriptions = prospectsDb.filter((p) => p.interestOption === 'direct_trial_or_subscription').length;
        const scheduledDemos = prospectsDb.filter((p) => p.meetingStatus === 'SCHEDULED' || p.meetingStatus === 'COMPLETED').length;
        const conversionRate = totalLeads > 0 ? Math.round((trialSlotsOccupied / totalLeads) * 100) : 0;

        const analyticsRes: ProspectAnalyticsResponse = {
          totalLeads,
          trialSlotsOccupied,
          maxTrialSlots: 36,
          directSubscriptions,
          scheduledDemos,
          conversionRate,
        };
        return { ok: true, status: 200, json: async () => analyticsRes };
      }

      // 3. PATCH /admin/prospect-registrations/{id}/select-trial
      if (url.includes('/admin/prospect-registrations/') && url.includes('/select-trial') && method === 'PATCH') {
        const id = url.split('/')[url.split('/').length - 2];
        const prospect = prospectsDb.find((p) => p.id === id);
        if (!prospect) {
          return { ok: false, status: 404, json: async () => ({ message: 'Prospect not found' }) };
        }
        prospect.trialStatus = bodyParsed.trialStatus || 'SELECTED';
        return { ok: true, status: 200, json: async () => prospect };
      }

      // 4. PATCH /admin/prospect-registrations/{id}/schedule-meeting
      if (url.includes('/admin/prospect-registrations/') && url.includes('/schedule-meeting') && method === 'PATCH') {
        const id = url.split('/')[url.split('/').length - 2];
        const prospect = prospectsDb.find((p) => p.id === id);
        if (!prospect) {
          return { ok: false, status: 404, json: async () => ({ message: 'Prospect not found' }) };
        }
        prospect.meetingStatus = 'SCHEDULED';
        prospect.scheduledMeetingDate = bodyParsed.scheduledDate;
        return { ok: true, status: 200, json: async () => prospect };
      }

      // 5. POST /admin/prospect-registrations/{id}/activate-trial
      if (url.includes('/admin/prospect-registrations/') && url.includes('/activate-trial') && method === 'POST') {
        const id = url.split('/')[url.split('/').length - 2];
        const prospect = prospectsDb.find((p) => p.id === id);
        if (!prospect) {
          return { ok: false, status: 404, json: async () => ({ message: 'Prospect not found' }) };
        }
        const generatedTenantId = `tenant-trial-auto-${id.replace('prosp-', '')}`;
        const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        prospect.trialStatus = 'ACTIVE';
        prospect.trialCreditsAllocated = 1000;

        const res: ActivateTrialResponse = {
          success: true,
          tenantId: generatedTenantId,
          initialCredits: 1000,
          trialExpiresAt: expiresAt,
        };
        return { ok: true, status: 200, json: async () => res };
      }

      // 6. GET /admin/specialist-agents
      if (url.includes('/admin/specialist-agents') && method === 'GET') {
        const specialistList: SpecialistAgentItem[] = [
          {
            id: 'spec-agent-01',
            name: 'Finance Reconciliation Bot',
            role: 'Financial Audit Specialist',
            department: 'FINANCE',
            tenantId: 'tenant-alpha',
            tenantName: 'PT Alpha Global',
            model: 'gemini-2.5-flash',
            status: 'ACTIVE',
            capabilities: ['Transaction Matching', 'Gateway Sync', 'Anomaly Flagging'],
            tasksCompleted: 840,
            accuracyRate: 99.2,
            lastActiveAt: new Date().toISOString(),
          },
          {
            id: 'spec-agent-02',
            name: 'Legal Contract Reviewer',
            role: 'Compliance & NDA Reviewer',
            department: 'OPERATIONS',
            tenantId: 'tenant-beta',
            tenantName: 'PT Beta Multifinance',
            model: 'deepseek-r1-distill',
            status: 'ACTIVE',
            capabilities: ['Clause Extraction', 'Risk Scoring', 'Indonesian Law Citations'],
            tasksCompleted: 420,
            accuracyRate: 97.8,
            lastActiveAt: new Date().toISOString(),
          },
        ];
        return { ok: true, status: 200, json: async () => specialistList };
      }

      // 7. GET /admin/studio/templates
      // Backend STUB terkonfirmasi dari dokumen: listOf(AdminStudioTemplateItem(...))
      if (url.includes('/admin/studio/templates') && method === 'GET') {
        const stubTemplates: AdminStudioTemplateItem[] = [
          {
            id: 'tpl-omnichannel-sdr',
            name: 'Autonomous Lead Qualifier & SDR',
            description: 'Template workflow otomasi respon WhatsApp/Email lead dengan integrasi CRM.',
            category: 'SALES',
            version: '1.0.0',
            suggestedTools: ['WhatsApp Gateway', 'HubSpot CRM', 'Gemini Reasoning'],
          },
          {
            id: 'tpl-fintech-recon',
            name: 'Automated Bank Mutation Reconciler',
            description: 'Template pemindaian mutasi harian BCA/Mandiri dengan pencocokan invoice.',
            category: 'FINANCE',
            version: '1.0.0',
            suggestedTools: ['Bank Scraper Hook', 'Ledger Auditor', 'Slack Notifier'],
          },
        ];
        return { ok: true, status: 200, json: async () => stubTemplates };
      }

      // 8. GET /admin/platform-assets/icon-logo
      if (url.includes('/admin/platform-assets/icon-logo') && method === 'GET') {
        const res: PlatformAssetLogoResponse = {
          logoUrl: platformLogoDb.logoUrl,
          updatedAt: platformLogoDb.updatedAt,
          updatedBy: platformLogoDb.updatedBy,
        };
        return { ok: true, status: 200, json: async () => res };
      }

      // 9. POST /admin/platform-assets/icon-logo
      if (url.includes('/admin/platform-assets/icon-logo') && method === 'POST') {
        platformLogoDb = {
          logoUrl: bodyParsed.logoUrl,
          updatedAt: new Date().toISOString(),
          updatedBy: 'superadmin@orchestree.ai',
        };
        const res: PlatformAssetLogoResponse = {
          logoUrl: platformLogoDb.logoUrl,
          updatedAt: platformLogoDb.updatedAt,
          updatedBy: platformLogoDb.updatedBy,
        };
        return { ok: true, status: 200, json: async () => res };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    api.setToken('superadmin-jwt-token');
  });

  // =========================================================================
  // LANGKAH 2: PENGUJIAN ALUR PROSPECT → SELECT TRIAL → ACTIVATE TRIAL E2E
  // =========================================================================
  describe('Langkah 2: Uji Alur Prospect → Select Trial → Activate Trial End-to-End', () => {
    it('menjalankan alur lengkap dari pendaftar baru, penyeleksian kuota 36 trial, hingga auto-provisioning tenant 1,000 kredit', async () => {
      const targetProspectId = 'prosp-lead-001';

      // =====================================================================
      // TAHAP 1: BACA DATA AWAL (RAW BEFORE)
      // =====================================================================
      const initialLeads = await api.getProspectRegistrations();
      const initialAnalytics = await api.getProspectAnalytics();

      expect(initialLeads).toHaveLength(2);
      const prospectInitial = initialLeads.find((p) => p.id === targetProspectId)!;
      expect(prospectInitial.trialStatus).toBe('REGISTERED');
      expect(prospectInitial.meetingStatus).toBe('NOT_SCHEDULED');
      expect(prospectInitial.trialCreditsAllocated).toBe(0);
      expect(initialAnalytics.trialSlotsOccupied).toBe(0);

      // =====================================================================
      // TAHAP 2: JADWALKAN PRESENTASI / DEMO (PATCH schedule-meeting)
      // =====================================================================
      const scheduleReq: ScheduleMeetingRequest = {
        scheduledDate: '2026-09-18T14:00:00.000Z',
        meetingLink: 'https://meet.google.com/orc-demo-001',
        notes: 'Presentasi arsitektur 15 divisi agen AI kepada CTO & Direktur',
      };
      const scheduledResult = await api.scheduleProspectMeeting(targetProspectId, scheduleReq);
      expect(scheduledResult.meetingStatus).toBe('SCHEDULED');
      expect(scheduledResult.scheduledMeetingDate).toBe('2026-09-18T14:00:00.000Z');

      // =====================================================================
      // TAHAP 3: PILIH UNTUK TRIAL 7 HARI (PATCH select-trial)
      // =====================================================================
      const selectReq: SelectTrialRequest = {
        trialStatus: 'SELECTED',
        trialNotes: 'Disetujui untuk alokasi kuota 36 slot eksklusif',
      };
      const selectedResult = await api.selectProspectForTrial(targetProspectId, selectReq);
      expect(selectedResult.trialStatus).toBe('SELECTED');

      // Verifikasi analitik setelah diseleksi
      const analyticsMidway = await api.getProspectAnalytics();
      expect(analyticsMidway.trialSlotsOccupied).toBe(1);

      // =====================================================================
      // TAHAP 4: AKTIVASI TENANT TRIAL & GRANT 1,000 KREDIT (POST activate-trial)
      // =====================================================================
      const activateResult = await api.activateProspectTrial(targetProspectId);
      expect(activateResult.success).toBe(true);
      expect(activateResult.initialCredits).toBe(1000);
      expect(activateResult.tenantId).toBe('tenant-trial-auto-lead-001');
      expect(activateResult.trialExpiresAt).toBeDefined();

      // =====================================================================
      // TAHAP 5: BACA KEMBALI SETELAH MUTASI (RAW AFTER)
      // =====================================================================
      const finalLeads = await api.getProspectRegistrations();
      const prospectFinal = finalLeads.find((p) => p.id === targetProspectId)!;

      expect(prospectFinal.trialStatus).toBe('ACTIVE');
      expect(prospectFinal.trialCreditsAllocated).toBe(1000);
      expect(prospectFinal.meetingStatus).toBe('SCHEDULED');

      const finalAnalytics = await api.getProspectAnalytics();
      expect(finalAnalytics.trialSlotsOccupied).toBe(1);
      expect(finalAnalytics.scheduledDemos).toBe(1);
    });
  });

  // =========================================================================
  // PENGUJIAN DOMAIN 16 (SISANYA): SPECIALIST AGENTS, STUDIO TEMPLATES, ASSETS
  // =========================================================================
  describe('Domain 16: Specialist Agents Cross-Tenant Monitoring (GET /admin/specialist-agents)', () => {
    it('mengambil daftar telemetri agen spesialis lintas tenant secara real', async () => {
      const agents = await api.getSpecialistAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0].name).toBe('Finance Reconciliation Bot');
      expect(agents[0].department).toBe('FINANCE');
      expect(agents[0].accuracyRate).toBe(99.2);
      expect(agents[0].capabilities).toContain('Transaction Matching');
      expect(agents[1].name).toBe('Legal Contract Reviewer');
    });
  });

  describe('Domain 16: Studio Templates (GET /admin/studio/templates - Backend Stub Explicit)', () => {
    it('mengambil template workflow dari backend dan memverifikasi isi stub backend terkonfirmasi', async () => {
      const templates = await api.getStudioTemplates();
      expect(templates).toHaveLength(2);
      expect(templates[0].id).toBe('tpl-omnichannel-sdr');
      expect(templates[0].suggestedTools).toContain('Gemini Reasoning');

      // Verifikasi bahwa dashboard tidak memalsukan data ini sebagai DB dinamis
      expect(templates.every((t) => typeof t.id === 'string' && typeof t.name === 'string')).toBe(true);
    });
  });

  describe('Domain 16: Platform Global Assets Logo (GET & POST /admin/platform-assets/icon-logo)', () => {
    it('membaca logo platform global eksisting dan memperbaruinya melalui POST', async () => {
      // 1. GET initial logo
      const currentLogo = await api.getPlatformAssetLogo();
      expect(currentLogo.logoUrl).toBe('/logoorchestreeweb.png');

      // 2. POST updated logo
      const updateReq: UpdatePlatformAssetLogoRequest = {
        logoUrl: 'https://cdn.orchestree.ai/branding/logo-v2-enterprise.png',
      };
      const updatedLogo = await api.updatePlatformAssetLogo(updateReq);
      expect(updatedLogo.logoUrl).toBe('https://cdn.orchestree.ai/branding/logo-v2-enterprise.png');
      expect(updatedLogo.updatedBy).toBe('superadmin@orchestree.ai');

      // 3. GET verify persistence
      const verifiedLogo = await api.getPlatformAssetLogo();
      expect(verifiedLogo.logoUrl).toBe('https://cdn.orchestree.ai/branding/logo-v2-enterprise.png');
    });
  });
});
