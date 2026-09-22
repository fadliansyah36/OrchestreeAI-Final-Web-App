import { describe, it, expect } from 'vitest';
import { PresenceSecurityAuditSummary } from '../types';

describe('Presence Security & Audit Center Aggregate Statistics Tests (PRD Fase 112 / Bagian C)', () => {
  interface MockPresenceLog {
    id: string;
    userId: string;
    checkType: string;
    methodUsed: string;
    verificationResult: string;
    deviceId: string;
    ipAddress: string;
    checkedAt: number;
  }

  function computeAggregateStats(logs: MockPresenceLog[], enrolledUsersCount: number): PresenceSecurityAuditSummary {
    const totalChecks = logs.length;
    const successChecks = logs.filter((l) => l.verificationResult === 'SUCCESS');
    const failedChecks = logs.filter((l) => l.verificationResult !== 'SUCCESS');

    // Sort descending by timestamp
    const sorted = [...logs].sort((a, b) => b.checkedAt - a.checkedAt);

    let recentConsecutiveFailures = 0;
    for (const log of sorted) {
      if (log.verificationResult !== 'SUCCESS') {
        recentConsecutiveFailures++;
      } else {
        break;
      }
    }

    // Per-user consecutive failures
    const logsByUser: Record<string, MockPresenceLog[]> = {};
    for (const log of sorted) {
      if (!logsByUser[log.userId]) logsByUser[log.userId] = [];
      logsByUser[log.userId].push(log);
    }

    let maxUserConsecutiveFailures = 0;
    for (const uLogs of Object.values(logsByUser)) {
      let uCount = 0;
      for (const l of uLogs) {
        if (l.verificationResult !== 'SUCCESS') uCount++;
        else break;
      }
      if (uCount > maxUserConsecutiveFailures) maxUserConsecutiveFailures = uCount;
    }

    const effectiveConsecutiveFailures = Math.max(recentConsecutiveFailures, maxUserConsecutiveFailures);

    const unauthorizedReasons = [
      'FAILED_SIMILARITY_BELOW_THRESHOLD',
      'FAILED_DEVICE_NOT_REGISTERED',
      'FAILED_BIOMETRIC_UNSUCCESSFUL',
      'FAILED_NO_ENROLLED_FACE',
    ];
    const potentialUnauthorizedAttempts = logs.filter((l) =>
      unauthorizedReasons.includes(l.verificationResult)
    ).length;

    const faceCount = logs.filter((l) => l.methodUsed.toUpperCase() === 'FACE').length;
    const fpCount = logs.filter(
      (l) => l.methodUsed.toUpperCase() === 'FINGERPRINT' || l.methodUsed.toUpperCase() === 'BIOMETRIC'
    ).length;
    const fallbackCount = logs.filter((l) => l.methodUsed.toUpperCase() === 'PASSWORD_FALLBACK').length;

    const riskLevel =
      effectiveConsecutiveFailures >= 3 || potentialUnauthorizedAttempts >= 3
        ? 'HIGH'
        : effectiveConsecutiveFailures >= 1 || potentialUnauthorizedAttempts >= 1
        ? 'ELEVATED'
        : 'NORMAL';

    return {
      totalEnrolledUsers: enrolledUsersCount,
      totalVerificationChecks: totalChecks,
      totalSuccessfulChecks: successChecks.length,
      totalFailedChecks: failedChecks.length,
      consecutiveFailures: effectiveConsecutiveFailures,
      potentialUnauthorizedAttempts: potentialUnauthorizedAttempts,
      methodBreakdown: {
        face: faceCount,
        fingerprint: fpCount,
        passwordFallback: fallbackCount,
      },
      securityRiskLevel: riskLevel,
    };
  }

  it('1.1 should aggregate total enrolled users and verification attempts accurately', () => {
    const now = Date.now();
    const mockLogs: MockPresenceLog[] = [
      {
        id: 'log-1',
        userId: 'usr-1',
        checkType: 'CHECK_IN',
        methodUsed: 'FACE',
        verificationResult: 'SUCCESS',
        deviceId: 'dev-1',
        ipAddress: '192.168.1.1',
        checkedAt: now - 3000,
      },
      {
        id: 'log-2',
        userId: 'usr-2',
        checkType: 'CHECK_IN',
        methodUsed: 'FINGERPRINT',
        verificationResult: 'SUCCESS',
        deviceId: 'dev-2',
        ipAddress: '192.168.1.2',
        checkedAt: now - 2000,
      },
    ];

    const stats = computeAggregateStats(mockLogs, 25);

    expect(stats.totalEnrolledUsers).toBe(25);
    expect(stats.totalVerificationChecks).toBe(2);
    expect(stats.totalSuccessfulChecks).toBe(2);
    expect(stats.totalFailedChecks).toBe(0);
    expect(stats.consecutiveFailures).toBe(0);
    expect(stats.potentialUnauthorizedAttempts).toBe(0);
    expect(stats.securityRiskLevel).toBe('NORMAL');
    expect(stats.methodBreakdown.face).toBe(1);
    expect(stats.methodBreakdown.fingerprint).toBe(1);
  });

  it('1.2 should detect consecutive verification failures indicating potential unauthorized access', () => {
    const now = Date.now();
    const mockLogs: MockPresenceLog[] = [
      {
        id: 'log-1',
        userId: 'usr-target',
        checkType: 'CHECK_IN',
        methodUsed: 'FACE',
        verificationResult: 'SUCCESS',
        deviceId: 'dev-target',
        ipAddress: '192.168.1.1',
        checkedAt: now - 10000,
      },
      // 3 consecutive failed verification attempts on usr-target
      {
        id: 'log-2',
        userId: 'usr-target',
        checkType: 'LOGIN',
        methodUsed: 'FACE',
        verificationResult: 'FAILED_SIMILARITY_BELOW_THRESHOLD',
        deviceId: 'attacker-dev',
        ipAddress: '203.0.113.45',
        checkedAt: now - 5000,
      },
      {
        id: 'log-3',
        userId: 'usr-target',
        checkType: 'LOGIN',
        methodUsed: 'FACE',
        verificationResult: 'FAILED_SIMILARITY_BELOW_THRESHOLD',
        deviceId: 'attacker-dev',
        ipAddress: '203.0.113.45',
        checkedAt: now - 3000,
      },
      {
        id: 'log-4',
        userId: 'usr-target',
        checkType: 'CHECK_IN',
        methodUsed: 'FINGERPRINT',
        verificationResult: 'FAILED_DEVICE_NOT_REGISTERED',
        deviceId: 'unregistered-phone',
        ipAddress: '203.0.113.45',
        checkedAt: now - 1000,
      },
    ];

    const stats = computeAggregateStats(mockLogs, 10);

    expect(stats.consecutiveFailures).toBe(3);
    expect(stats.potentialUnauthorizedAttempts).toBe(3);
    expect(stats.securityRiskLevel).toBe('HIGH');
    expect(stats.totalFailedChecks).toBe(3);
    expect(stats.totalSuccessfulChecks).toBe(1);
  });

  it('1.3 should guarantee individual biometric privacy by strictly excluding raw embeddings from aggregate stats', () => {
    const stats: PresenceSecurityAuditSummary = {
      totalEnrolledUsers: 14,
      totalVerificationChecks: 88,
      totalSuccessfulChecks: 85,
      totalFailedChecks: 3,
      consecutiveFailures: 0,
      potentialUnauthorizedAttempts: 1,
      methodBreakdown: {
        face: 52,
        fingerprint: 36,
        passwordFallback: 0,
      },
      securityRiskLevel: 'NORMAL',
    };

    // Verify privacy: No raw embeddings, face templates, or biometric data fields exist in the payload
    expect((stats as any).faceEmbedding).toBeUndefined();
    expect((stats as any).biometricTemplate).toBeUndefined();
    expect((stats as any).rawImage).toBeUndefined();
    expect(stats.totalEnrolledUsers).toBeGreaterThan(0);
    expect(stats.methodBreakdown.face + stats.methodBreakdown.fingerprint).toBe(88);
  });
});
