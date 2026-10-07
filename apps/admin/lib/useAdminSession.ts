'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@orchestree/api-client';

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
    apiClient
      .get<AdminSession>('/api/v1/auth/session', { cache: 'no-store' })
      .then((value) => {
        if (active) setSession(value?.authenticated ? value : null);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
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
