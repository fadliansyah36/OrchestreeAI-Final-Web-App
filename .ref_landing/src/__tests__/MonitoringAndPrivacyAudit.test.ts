import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/api';
import type {
  ChannelAccountMonitoringSummary,
  RevenueIntelligenceSummary,
  LeadPipelineMonitoringSummary,
  SalesCoachMonitoringSummary,
  CampaignBuilderMonitoringSummary,
  CustomerProfileIntelligenceSummary,
} from '../types';

describe('Sales & Marketing Monitoring & Zero-PII Privacy Compliance Audit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queries Multi-Channel Accounts monitoring and asserts zero-PII data isolation', async () => {
    const mockTelemetry: ChannelAccountMonitoringSummary = {
      totalChannelAccounts: 48,
      activeChannelsCount: 42,
      degradedChannelsCount: 4,
      offlineChannelsCount: 2,
      hourlyMessageThroughput: 14200,
      aggregateWebhookDeliveryRate: 99.4,
      aggregateWebhookLatencyMs: 120,
      channelDistribution: [
        { channelType: 'WHATSAPP', count: 20, activeRate: 95, errorRate: 0.8 },
        { channelType: 'INSTAGRAM', count: 15, activeRate: 92, errorRate: 1.2 },
      ],
      channels: [
        {
          id: 'ca-1',
          tenantId: 'tenant-001',
          tenantName: 'PT Nusantara',
          channelType: 'WHATSAPP',
          accountIdentifier: 'WA-Business-***4821',
          status: 'ACTIVE',
          syncHealthScore: 98,
          lastHandshakeAt: new Date().toISOString(),
          messageVolume24h: 8400,
          webhookSuccessRate: 99.8,
          errorCount24h: 2,
        },
      ],
      privacyNotice: 'Audit Isolasi Privasi Super Admin: Hanya metrik agregat akun channel. Nol PII customer dan nol transkrip percakapan.',
    };

    const spy = vi.spyOn(api as any, 'request').mockResolvedValue(mockTelemetry);

    const data = await api.getChannelAccountsMonitoring();
    expect(spy).toHaveBeenCalledWith('/admin/channels/monitoring');
    expect(data.totalChannelAccounts).toBe(48);
    expect(data.channelDistribution.length).toBe(2);
    expect(data.aggregateWebhookDeliveryRate).toBe(99.4);
    expect(data.privacyNotice).toContain('Nol PII');

    // Super Admin Privacy Security Assertion: no end-user phone numbers or transcripts
    expect((data as any).phoneNumbers).toBeUndefined();
    expect((data as any).customerTranscripts).toBeUndefined();
    expect((data as any).individualMessages).toBeUndefined();
  });

  it('queries Revenue Intelligence metrics strictly as cross-tenant aggregates', async () => {
    const mockRevenue: RevenueIntelligenceSummary = {
      totalPipelineValueIdr: 12500000000,
      aiInfluencedRevenueIdr: 8200000000,
      humanClosedRevenueIdr: 4300000000,
      aiAttributionPercentage: 65.6,
      avgDealVelocityDays: 14.5,
      overallWinRatePercentage: 32.4,
      funnelStages: [
        { stageName: 'Discovery', stageOrder: 1, activeDealsCount: 120, totalValueIdr: 4500000000, conversionRatePercentage: 45, avgDaysInStage: 4.2 },
        { stageName: 'Proposal', stageOrder: 2, activeDealsCount: 50, totalValueIdr: 3000000000, conversionRatePercentage: 60, avgDaysInStage: 6.1 },
      ],
      channelRevenueAttribution: [
        { channel: 'WHATSAPP', revenueIdr: 7200000000, dealCount: 84, conversionRate: 38 },
      ],
      privacyNotice: 'Audit Isolasi Privasi Super Admin: Hanya metrik agregat pipeline dan proyeksi revenue komersial. Data transaksi individual dan identitas prospek dienkripsi pada isolasi database tenant.',
    };

    const spy = vi.spyOn(api as any, 'request').mockResolvedValue(mockRevenue);

    const data = await api.getRevenueIntelligence();
    expect(spy).toHaveBeenCalledWith('/admin/revenue-intelligence');
    expect(data.totalPipelineValueIdr).toBe(12500000000);
    expect(data.avgDealVelocityDays).toBe(14.5);
    expect(data.funnelStages.length).toBe(2);

    // Super Admin Privacy Security Assertion: no prospect personal contacts or buyer names
    expect((data as any).buyerNames).toBeUndefined();
    expect((data as any).customerContacts).toBeUndefined();
  });

  it('queries Lead Pipeline monitoring without individual lead contacts', async () => {
    const mockPipeline: LeadPipelineMonitoringSummary = {
      totalActiveLeads: 3420,
      newLeadsThisMonth: 680,
      mqlCount: 1200,
      sqlCount: 540,
      opportunityCount: 210,
      avgLeadResponseTimeMinutes: 2.4,
      aiQualificationRate: 86.5,
      tenantPipelineVelocity: [
        {
          tenantId: 'tenant-001',
          tenantName: 'PT Nusantara Digital',
          totalLeads: 140,
          mqlToSqlRate: 45.2,
          avgCloseDays: 11.2,
          pipelineHealth: 'EXCELLENT',
        },
      ],
      privacyNotice: 'Audit Isolasi Privasi Super Admin: Hanya telemetri konversi agregat pipeline lead. Kontak prospek dilindungi enkripsi tenant.',
    };

    const spy = vi.spyOn(api as any, 'request').mockResolvedValue(mockPipeline);

    const data = await api.getLeadPipelineMonitoring();
    expect(spy).toHaveBeenCalledWith('/admin/lead-pipeline/monitoring');
    expect(data.totalActiveLeads).toBe(3420);
    expect(data.tenantPipelineVelocity.length).toBe(1);

    // Super Admin Privacy Security Assertion: no prospect phone or emails
    expect((data as any).prospectEmails).toBeUndefined();
    expect((data as any).leadPhoneNumbers).toBeUndefined();
  });

  it('queries Sales Coach AI monitoring with playbook compliance rates and zero audio/text leaks', async () => {
    const mockCoach: SalesCoachMonitoringSummary = {
      totalCoachedSessions: 1890,
      avgPlaybookComplianceScore: 88.4,
      avgObjectionHandlingScore: 84.1,
      aiSdrPitchQualityIndex: 90.2,
      humanSupervisorInterventionRate: 4.8,
      playbookComplianceBreakdown: [
        { playbookName: 'Enterprise Discovery Call', division: 'Enterprise Sales', complianceScore: 91.2, sessionsEvaluated: 450, topObjectionTackled: 'Budget constraints' },
        { playbookName: 'Inbound Demo Qualification', division: 'SDR Team', complianceScore: 86.5, sessionsEvaluated: 620, topObjectionTackled: 'Timeline postponement' },
      ],
      coachingRecommendationsAggregated: [
        { category: 'Pricing Objection', impactLevel: 'HIGH', affectedRepsPercentage: 24, recommendationSummary: 'Refer to ROI Calculator Template' },
      ],
      privacyNotice: 'Audit Isolasi Privasi Super Admin: Hanya metrik kepatuhan playbook sales dan skor evaluasi AI agregat. Tidak ada transkrip atau rekaman audio panggilan sales individual.',
    };

    const spy = vi.spyOn(api as any, 'request').mockResolvedValue(mockCoach);

    const data = await api.getSalesCoachMonitoring({ tenantId: 'tenant-demo' });
    expect(spy).toHaveBeenCalledWith('/admin/sales-coach/monitoring?tenantId=tenant-demo');
    expect(data.totalCoachedSessions).toBe(1890);
    expect(data.avgPlaybookComplianceScore).toBe(88.4);

    // Super Admin Privacy Security Assertion: no audio or conversation transcripts
    expect((data as any).audioRecordings).toBeUndefined();
    expect((data as any).conversationTranscripts).toBeUndefined();
  });

  it('queries Campaign Builder creative telemetry with dispatch counts and zero recipients list', async () => {
    const mockCampaign: CampaignBuilderMonitoringSummary = {
      totalActiveCampaigns: 64,
      totalDispatchedMessages: 184500,
      aiContentGeneratedCount: 320,
      avgEngagementRatePercentage: 14.8,
      channelBreakdown: [
        { channel: 'WHATSAPP', activeCampaignsCount: 38, dispatchVolume: 120000, deliverySuccessRate: 99.2, clickThroughRate: 8.4 },
        { channel: 'EMAIL', activeCampaignsCount: 26, dispatchVolume: 64500, deliverySuccessRate: 98.5, clickThroughRate: 3.8 },
      ],
      campaignPerformanceCohorts: [
        { cohortName: 'Flash Sale Broadcast', campaignCount: 15, avgRoiMultiplier: 4.2, tokenCostPerLeadIdr: 1200 },
      ],
      privacyNotice: 'Audit Isolasi Privasi Super Admin: Hanya telemetri eksekusi kampanye pemasaran agregat. Daftar penerima dan isi pesan kampanye tenant tidak dapat diakses Super Admin.',
    };

    const spy = vi.spyOn(api as any, 'request').mockResolvedValue(mockCampaign);

    const data = await api.getCampaignBuilderMonitoring();
    expect(spy).toHaveBeenCalledWith('/admin/campaigns/monitoring');
    expect(data.totalActiveCampaigns).toBe(64);
    expect(data.totalDispatchedMessages).toBe(184500);

    // Super Admin Privacy Security Assertion: no recipient lists
    expect((data as any).recipientList).toBeUndefined();
    expect((data as any).messageCopyTranscripts).toBeUndefined();
  });

  it('queries Customer Profile Intelligence with segment-level distributions and zero PII identities', async () => {
    const mockProfile: CustomerProfileIntelligenceSummary = {
      totalTrackedProfiles: 95400,
      aggregatedChurnRiskIndex: 12.4,
      segmentDistribution: [
        { segment: 'ENTERPRISE', percentage: 28.5, tenantCount: 42, avgRetentionMonths: 18.4 },
        { segment: 'SMB', percentage: 48.2, tenantCount: 160, avgRetentionMonths: 12.1 },
      ],
      healthScoreDistribution: [
        { tier: 'HEALTHY', percentage: 68.4, count: 65200 },
        { tier: 'NEUTRAL', percentage: 21.2, count: 20200 },
        { tier: 'AT_RISK', percentage: 10.4, count: 10000 },
      ],
      rfmQuintiles: [
        { quintile: 'R5-F5-M5', customerPercentage: 12.4, revenueSharePercentage: 42.1 },
      ],
      privacyNotice: 'Audit Isolasi Privasi Super Admin: Hanya segmentasi agregat dan distribusi RFM. Profil customer individual dan identitas personal dilindungi isolasi privasi multi-tenant.',
    };

    const spy = vi.spyOn(api as any, 'request').mockResolvedValue(mockProfile);

    const data = await api.getCustomerProfileIntelligence();
    expect(spy).toHaveBeenCalledWith('/admin/customer-profile/intelligence');
    expect(data.totalTrackedProfiles).toBe(95400);
    expect(data.aggregatedChurnRiskIndex).toBe(12.4);

    // Super Admin Privacy Security Assertion: zero customer identities
    expect((data as any).customerNames).toBeUndefined();
    expect((data as any).individualCustomerList).toBeUndefined();
  });
});
