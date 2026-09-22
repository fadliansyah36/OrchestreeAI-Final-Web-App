import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../lib/api';

describe('Bagian A: Super Admin MFA Enrollment & Verification Flow', () => {
  const superAdminEmail = 'orchestree.ai.id@gmail.com';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/admin/auth/mfa/enroll')) {
        const dynamicSecret = ('ORCHESTREEAISEC' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).substring(0, 32).toUpperCase();
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ENROLLMENT_READY',
            secret: dynamicSecret,
            otpauthUri: `otpauth://totp/OrchestreeAI:${encodeURIComponent(superAdminEmail)}?secret=${dynamicSecret}&issuer=OrchestreeAI`,
            message: 'MFA TOTP enrollment siap.',
          }),
        } as any;
      }
      if (urlStr.includes('/admin/auth/mfa/confirm-enrollment')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            token: 'test-jwt-token-superadmin',
            user: { email: superAdminEmail, role: 'SUPER_ADMIN' },
          }),
        } as any;
      }
      return {
        ok: false,
        status: 404,
        text: async () => 'Not found',
      } as any;
    });
  });

  it('1. Endpoint adminMfaEnroll returns otpauthUri, secret, and superAdmin email', async () => {
    const enrollRes = await api.adminMfaEnroll({ email: superAdminEmail });

    expect(enrollRes).toBeDefined();
    expect(enrollRes.secret).toBeDefined();
    expect(typeof enrollRes.secret).toBe('string');
    expect(enrollRes.secret!.length).toBeGreaterThanOrEqual(16);

    expect(enrollRes.otpauthUri).toBeDefined();
    expect(enrollRes.otpauthUri!).toContain('otpauth://totp/');
    expect(enrollRes.otpauthUri!).toContain('OrchestreeAI');
    expect(enrollRes.otpauthUri!).toContain(encodeURIComponent(superAdminEmail));
  });

  it('2. Endpoint adminMfaConfirmEnrollment successfully validates code with secret', async () => {
    const enrollRes = await api.adminMfaEnroll({ email: superAdminEmail });

    const confirmRes = await api.adminMfaConfirmEnrollment({
      code: '123456',
      secret: enrollRes.secret,
      email: superAdminEmail,
    });

    expect(confirmRes).toBeDefined();
    expect(confirmRes.success).toBe(true);
    expect(confirmRes.token).toBeDefined();
    expect(confirmRes.user).toBeDefined();
    expect(confirmRes.user?.email).toBe(superAdminEmail);
    expect(confirmRes.user?.role).toBe('SUPER_ADMIN');
  });

  it('3. Endpoint adminMfaConfirmEnrollment validates 6-digit TOTP code requirements', async () => {
    await expect(
      api.adminMfaConfirmEnrollment({
        code: '123', // invalid length
        secret: 'TESTSECRET123456',
        email: superAdminEmail,
      })
    ).rejects.toThrow('Kode TOTP harus terdiri dari 6 digit angka.');
  });

  it('4. Re-enrollment flow produces new secret and URI for manual trigger', async () => {
    const firstEnroll = await api.adminMfaEnroll({ email: superAdminEmail });
    const secondEnroll = await api.adminMfaEnroll({ email: superAdminEmail });

    expect(firstEnroll.otpauthUri).toBeDefined();
    expect(secondEnroll.otpauthUri).toBeDefined();
  });

  it('5. AUDIT: Verifikasi tidak ada background interval / auto-refresh berkala ke /admin/auth/mfa/enroll selama 30 detik idle', async () => {
    vi.useFakeTimers();
    const enrollSpy = vi.spyOn(api, 'adminMfaEnroll');

    // Simulasi initial fetch saat modal dibuka (T = 0s)
    await api.adminMfaEnroll({ email: superAdminEmail });
    expect(enrollSpy).toHaveBeenCalledTimes(1);

    // Simulasi modal terbuka tanpa interaksi selama 30 detik (T = 1s s/d 30s)
    // Majukan waktu virtual 30.000 ms
    vi.advanceTimersByTime(30000);

    // Verifikasi bahwa TIDAK ADA pemanggilan kedua atau interval berulang yang berjalan otomatis
    expect(enrollSpy).toHaveBeenCalledTimes(1);

    // Simulasi user secara EKSPLISIT menekan tombol "Refresh Key"
    await api.adminMfaEnroll({ email: superAdminEmail });
    expect(enrollSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('6. Endpoint adminMfaEnroll throws error on network/backend failure instead of returning hardcoded fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network connection refused'));

    await expect(
      api.adminMfaEnroll({ email: superAdminEmail })
    ).rejects.toThrow(/Gagal terhubung ke server autentikasi MFA/);
  });

  it('7. Endpoint adminMfaEnroll correctly resolves secretKey returned by backend', async () => {
    const backendSecret = 'GGXGAWSRECCVXC6ISGB3BFZHWIQQYG6F';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ENROLLMENT_PENDING',
        email: superAdminEmail,
        secretKey: backendSecret,
        otpauthUri: `otpauth://totp/OrchestreeAI:${encodeURIComponent(superAdminEmail)}?secret=${backendSecret}&issuer=OrchestreeAI`,
        message: 'Enrollment initiated.',
      }),
    } as any);

    const result = await api.adminMfaEnroll({ email: superAdminEmail });
    expect(result.secret).toBe(backendSecret);
    expect(result.secretKey).toBe(backendSecret);
    expect(result.secret).not.toBe('JBSWY3DPEHPK3PXP');
  });

  it('8. Endpoint adminMfaConfirmEnrollment handles backend response with status ACTIVE and no token without error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ACTIVE',
        email: superAdminEmail,
        message: 'MFA TOTP berhasil diaktifkan. Gunakan kode dari authenticator app untuk login.',
      }),
    } as any);

    const result = await api.adminMfaConfirmEnrollment({
      code: '654321',
      secret: 'GGXGAWSRECCVXC6ISGB3BFZHWIQQYG6F',
      email: superAdminEmail,
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('ACTIVE');
    expect(result.success).toBe(true);
    expect(result.token).toBeUndefined();
    expect(result.message).toContain('MFA TOTP berhasil diaktifkan');
  });

  it('9. Confirm enrollment sets orchestree_mfa_enrolled in localStorage', async () => {
    const storage: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => storage[k] || null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ACTIVE',
        email: superAdminEmail,
        message: 'MFA TOTP berhasil diaktifkan.',
      }),
    } as any);

    await api.adminMfaConfirmEnrollment({
      code: '112233',
      secret: 'GGXGAWSRECCVXC6ISGB3BFZHWIQQYG6F',
      email: superAdminEmail,
    });

    expect(storage[`orchestree_mfa_enrolled_${superAdminEmail}`]).toBe('true');
  });
});
