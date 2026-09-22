import { api, ApiClient } from './api';
import { supabase } from './supabaseClient';

export class ApiError extends Error {
  status: number;
  endpoint?: string;
  rawDetails?: any;

  constructor(status: number, message: any, endpoint?: string, rawDetails?: any) {
    let cleanMessage = `API Request failed with status ${status}`;
    if (typeof message === 'string' && message.trim() && message.trim() !== '{}' && message.trim() !== '[]' && message.trim() !== '[object Object]') {
      cleanMessage = message.trim();
    } else if (typeof message === 'object' && message !== null) {
      if (typeof message.error === 'string' && message.error.trim() && message.error.trim() !== '{}') {
        cleanMessage = message.error.trim();
      } else if (typeof message.message === 'string' && message.message.trim() && message.message.trim() !== '{}') {
        cleanMessage = message.message.trim();
      }
    }
    super(cleanMessage);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
    this.rawDetails = rawDetails;
  }
}

const getBaseUrl = (): string => {
  const gProcess = (globalThis as any).process;
  const envUrl = (
    (typeof import.meta !== 'undefined' && import.meta.env && ((import.meta.env as any).NEXT_PUBLIC_BACKEND_API_URL || import.meta.env.VITE_BACKEND_API_URL)) ||
    (gProcess && gProcess.env && (gProcess.env.NEXT_PUBLIC_BACKEND_API_URL || gProcess.env.VITE_BACKEND_API_URL || gProcess.env.BACKEND_API_URL)) ||
    'https://api.orchestree.biz.id/api/v1'
  ).trim();
  const cleaned = envUrl.replace(/\/+$/, '');
  return cleaned.endsWith('/api/v1') ? cleaned : `${cleaned}/api/v1`;
};

/**
 * Helper to read Super Admin session token from secure cookie
 */
const getAdminTokenFromCookie = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)orchestree_admin_token=([^;]*)/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
};

/**
 * Centralized API Client according to Phase 121/139 architecture specification.
 * Enforces unified NEXT_PUBLIC_BACKEND_API_URL and standard authentication headers.
 */
export const apiClient = {
  baseUrl: getBaseUrl(),

  /**
   * BUG 1 FIX: Method khusus untuk mengambil token Super Admin yang tersimpan.
   * Dipakai khusus di context Super Admin Dashboard agar tidak ada ambiguitas token mana yang aktif.
   */
  getSuperAdminToken(): string | null {
    // 1. In-memory ApiClient token
    const memToken = api.getToken();
    if (memToken) return memToken;

    // 2. Secure cookie token
    const cookieToken = getAdminTokenFromCookie();
    if (cookieToken) return cookieToken;

    // 3. SessionStorage fallback
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem('orchestree_superadmin_token');
      if (stored) return stored;
    }

    // 4. LocalStorage fallback
    if (typeof localStorage !== 'undefined') {
      const storedLocal = localStorage.getItem('orchestree_superadmin_token');
      if (storedLocal) return storedLocal;
    }

    return null;
  },

  /**
   * BUG 1 FIX: Prioritaskan token Super Admin tersimpan (api.getToken() / cookie)
   * TERLEBIH DAHULU ketimbang sesi Supabase. Alur Super Admin TIDAK login lewat Supabase Auth,
   * melainkan lewat endpoint backend khusus Super Admin.
   */
  async getSessionToken(): Promise<string | null> {
    // 1. PRIORITAS UTAMA: Token Super Admin (Dedicated Backend Auth)
    const superAdminToken = this.getSuperAdminToken();
    if (superAdminToken) {
      return superAdminToken;
    }

    // 2. Fallback ke Supabase session (jika ada sesi pengguna consumer)
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        return data.session.access_token;
      }
    } catch {
      // Session lookup fallback
    }

    return null;
  },

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getSessionToken();
    const method = (options.method || 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // CSRF Double-Submit Protection (Fase 124 Bagian B / Domain 16):
    // Mutating requests MUST carry the X-CSRF-Token header retrieved from /admin/security/csrf-token
    let csrfToken = api.getCsrfToken();
    if (isMutation && !csrfToken) {
      csrfToken = await api.initCsrf().catch(() => null);
    }

    const effectiveOperator = api.getEffectiveOperatorId();
    const effectiveTenant = (options.headers as Record<string, string>)?.[ 'X-Tenant-Id'] || api.getEffectiveTenantId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // =========================================================================
      // SECURITY AUDIT NOTE (BUG 4):
      // Header 'X-Admin-Role: SUPER_ADMIN' dikirim HANYA untuk keperluan
      // logging, request tracing, dan debugging di sisi server.
      // INI BUKAN MEKANISME OTORISASI!
      //
      // PERHATIAN UNTUK TIM BACKEND:
      // Wajib audit fungsi enforceSuperAdmin() / guard di backend. Pastikan role
      // SUPER_ADMIN ditentukan murni dan divalidasi secara kriptografis dari klaim
      // di dalam JWT token (req.user.role === 'SUPER_ADMIN'), BUKAN membaca dari
      // header ini. Siapa pun dapat mereproduksi header ini via curl/DevTools tanpa
      // token asli, sehingga mengandalkan header ini untuk otorisasi adalah cacat keamanan kritis.
      // =========================================================================
      'X-Admin-Role': 'SUPER_ADMIN',
      ...(effectiveOperator ? { 'X-Operator-Id': effectiveOperator } : {}),
      ...(effectiveTenant ? { 'X-Tenant-Id': effectiveTenant } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(isMutation && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let rawText = '';
      try {
        rawText = await res.text();
      } catch {}

      let parsedMessage = rawText;
      let rawDetails: any = rawText;
      try {
        const parsed = JSON.parse(rawText);
        rawDetails = parsed;
        if (parsed.error && typeof parsed.error === 'string' && parsed.error.trim() && parsed.error.trim() !== '{}') {
          parsedMessage = parsed.error.trim();
        } else if (parsed.message && typeof parsed.message === 'string' && parsed.message.trim() && parsed.message.trim() !== '{}') {
          parsedMessage = parsed.message.trim();
        } else if (parsed.error && typeof parsed.error === 'object' && parsed.error?.message) {
          parsedMessage = String(parsed.error.message);
        } else if (parsed.status && typeof parsed.status === 'string' && parsed.status !== 'error') {
          parsedMessage = `Status: ${parsed.status}`;
        }
      } catch {}

      const finalMessage = parsedMessage && parsedMessage.trim().length > 0 && parsedMessage.trim() !== '{}' && parsedMessage.trim() !== '[]' && parsedMessage.trim() !== '[object Object]'
        ? parsedMessage.trim()
        : `Backend returned HTTP ${res.status} for ${cleanPath}`;

      throw new ApiError(res.status, finalMessage, cleanPath, rawDetails);
    }

    return res.json() as Promise<T>;
  },

  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  },

  async post<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async put<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async patch<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  },

  /**
   * Super Admin Login via backend authentication endpoint
   */
  async adminLogin(email: string, pass: string) {
    return api.adminLogin(email, pass);
  },

  /**
   * Super Admin TOTP MFA verification via backend
   */
  async adminVerifyMfa(email: string, code: string, challengeToken?: string) {
    return api.adminVerifyMfa(email, code, challengeToken);
  },
};

export { api, ApiClient };
export default apiClient;
