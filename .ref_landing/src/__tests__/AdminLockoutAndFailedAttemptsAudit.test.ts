import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, AdminAuthApiError } from '../lib/api';

class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] || null;
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as any).sessionStorage = new MockStorage();
}
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new MockStorage();
}

describe('Audit State Client: Failed Attempts & Lockout Synchronization', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. AdminAuthApiError retains failedAttempts, isLocked, and remainingSeconds from API response', () => {
    const error = new AdminAuthApiError('Percobaan login gagal.', {
      status: 401,
      failedAttempts: 2,
      isLocked: false,
      remainingSeconds: 0,
    });

    expect(error.failedAttempts).toBe(2);
    expect(error.isLocked).toBe(false);
    expect(error.status).toBe(401);
  });

  it('2. adminLogin propagates AdminAuthApiError with failedAttempts and remainingSeconds from 401 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'Email atau kata sandi tidak valid.',
        failedAttempts: 1,
        isLocked: false,
        remainingSeconds: 0,
      }),
    } as any);

    try {
      await api.adminLogin('admin@orchestree.biz.id', 'WrongPass123!');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AdminAuthApiError);
      expect(err.failedAttempts).toBe(1);
      expect(err.isLocked).toBe(false);
      expect(err.status).toBe(401);
    }
  });

  it('3. adminLogin propagates AdminAuthApiError with 429 lockout payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: 'Akun Super Admin terkunci selama 15 menit.',
        failedAttempts: 3,
        isLocked: true,
        remainingSeconds: 900,
      }),
    } as any);

    try {
      await api.adminLogin('admin@orchestree.biz.id', 'WrongPassAgain!');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AdminAuthApiError);
      expect(err.failedAttempts).toBe(3);
      expect(err.isLocked).toBe(true);
      expect(err.remainingSeconds).toBe(900);
      expect(err.status).toBe(429);
    }
  });

  it('4. Ensures no sessionStorage or localStorage pollution of orchestree_failed_logins', () => {
    expect(sessionStorage.getItem('orchestree_failed_logins')).toBeNull();
    expect(sessionStorage.getItem('orchestree_lockout_until')).toBeNull();
    expect(localStorage.getItem('orchestree_failed_logins')).toBeNull();
    expect(localStorage.getItem('orchestree_lockout_until')).toBeNull();
  });
});
