'use client';

import { useEffect, useState } from 'react';

export interface AdminSession {
  authenticated: boolean;
  user_id: string;
  tenant_id: string | null;
  roles: string[];
  capabilities: string[];
  is_mfa_verified: boolean;
  app_scope: string;
}

export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/auth/session', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as AdminSession;
      })
      .then((value) => {
        if (active) setSession(value?.authenticated ? value : null);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const isPlatformAdmin = Boolean(
    session?.authenticated &&
    session.is_mfa_verified &&
    session.roles.some((role) =>
      ['SUPER_ADMIN', 'PLATFORM_SUPER_ADMIN', 'PLATFORM_SUPERADMIN'].includes(role.toUpperCase())
    )
  );

  return { session, loading, isPlatformAdmin };
}
