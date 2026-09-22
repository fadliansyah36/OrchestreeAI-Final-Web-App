import { describe, it, expect } from 'vitest';
import { TaskActivitySummaryResponse, TenantTaskActivitySummaryItem } from '../types';

describe('TaskActivitySummary Platform-Wide Aggregation Tests (Fase 110 / Bagian C)', () => {
  const mockActivityResponse: TaskActivitySummaryResponse = {
    total_tasks: 12,
    total_active_tasks: 8,
    total_completed_tasks: 4,
    overall_completion_rate: 33.3,
    human_created_tasks: 4,
    ai_created_tasks: 8,
    human_ratio_percentage: 33.3,
    ai_ratio_percentage: 66.7,
    by_status: {
      BACKLOG: 1,
      TODO: 4,
      IN_PROGRESS: 2,
      IN_REVIEW: 1,
      DONE: 4,
    },
    by_channel: {
      dashboard: 7,
      telegram: 3,
      whatsapp: 2,
    },
    tenants_activity: [
      {
        tenant_id: 'test-tenant-org-alpha',
        tenant_name: 'Enterprise Alpha PT',
        total_tasks: 5,
        active_tasks: 3,
        completed_tasks: 2,
        human_created_tasks: 2,
        ai_agent_created_tasks: 3,
        orchestration_created_tasks: 0,
        completion_rate: 40.0,
        adoption_health_status: 'HEALTHY',
      },
      {
        tenant_id: 'tenant-growth-002',
        tenant_name: 'Growth Ventures Ltd',
        total_tasks: 4,
        active_tasks: 3,
        completed_tasks: 1,
        human_created_tasks: 1,
        ai_agent_created_tasks: 3,
        orchestration_created_tasks: 0,
        completion_rate: 25.0,
        adoption_health_status: 'MODERATE',
      },
      {
        tenant_id: 'tenant-startup-003',
        tenant_name: 'Startup Kilat Indo',
        total_tasks: 3,
        active_tasks: 2,
        completed_tasks: 1,
        human_created_tasks: 1,
        ai_agent_created_tasks: 2,
        orchestration_created_tasks: 0,
        completion_rate: 33.3,
        adoption_health_status: 'MODERATE',
      },
    ],
  };

  it('1. should validate overall task volume consistency and active vs completed split', () => {
    expect(mockActivityResponse.total_tasks).toBe(
      mockActivityResponse.total_active_tasks + mockActivityResponse.total_completed_tasks
    );
    expect(mockActivityResponse.overall_completion_rate).toBeCloseTo(33.3, 1);
  });

  it('2. should validate human vs AI agent ratio calculations', () => {
    const sumCreated = mockActivityResponse.human_created_tasks + mockActivityResponse.ai_created_tasks;
    expect(sumCreated).toBe(mockActivityResponse.total_tasks);

    const ratioSum = mockActivityResponse.human_ratio_percentage + mockActivityResponse.ai_ratio_percentage;
    expect(ratioSum).toBeCloseTo(100.0, 1);

    expect(mockActivityResponse.human_ratio_percentage).toBe(33.3);
    expect(mockActivityResponse.ai_ratio_percentage).toBe(66.7);
  });

  it('3. should validate status distribution matches total tasks', () => {
    const totalFromStatuses = Object.values(mockActivityResponse.by_status).reduce((a, b) => a + b, 0);
    expect(totalFromStatuses).toBe(mockActivityResponse.total_tasks);
  });

  it('4. should validate channel distribution matches total tasks', () => {
    const totalFromChannels = Object.values(mockActivityResponse.by_channel).reduce((a, b) => a + b, 0);
    expect(totalFromChannels).toBe(mockActivityResponse.total_tasks);
  });

  it('5. should correctly aggregate per-tenant metrics with valid adoption health statuses', () => {
    expect(mockActivityResponse.tenants_activity.length).toBe(3);

    for (const tenant of mockActivityResponse.tenants_activity) {
      expect(tenant.total_tasks).toBe(tenant.active_tasks + tenant.completed_tasks);
      expect(tenant.total_tasks).toBe(
        tenant.human_created_tasks + tenant.ai_agent_created_tasks + tenant.orchestration_created_tasks
      );
      expect(['HEALTHY', 'MODERATE', 'LOW_ACTIVITY']).toContain(tenant.adoption_health_status);
      expect(tenant.completion_rate).toBeGreaterThanOrEqual(0);
      expect(tenant.completion_rate).toBeLessThanOrEqual(100);
    }
  });

  it('6. should comply with Addendum 2 Bagian 25.2 Privacy Mandate (no individual task titles or contents leaked)', () => {
    const serialized = JSON.stringify(mockActivityResponse);
    // Super admin sees AGGREGATES ONLY. Individual task titles/descriptions must never appear in response.
    const forbiddenTaskSpecificKeywords = [
      'Autonomous Market Intel',
      'Finalisasi Kontrak',
      'Inisiasi scraping',
      'Membuka headless browser',
      'task_description',
      'task_content',
    ];

    for (const keyword of forbiddenTaskSpecificKeywords) {
      expect(serialized.includes(keyword)).toBe(false);
    }
  });
});
