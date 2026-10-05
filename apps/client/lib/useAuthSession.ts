'use client';

import { useEffect, useState } from 'react';

export interface AuthSessionContext {
  authenticated: boolean;
  user_id: string;
  tenant_id: string | null;
  roles: string[];
  capabilities: string[];
  is_mfa_verified: boolean;
  app_scope: string;
  membership_id: string | null;
  tenant_legal_name: string | null;
  tenant_display_name: string | null;
  tenant_status: string | null;
  tenant_created_at: string | null;
}

export function useAuthSession() {
  const [session, setSession] = useState<AuthSessionContext | null>(null);
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
        return (await response.json()) as AuthSessionContext;
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

    return () => {
      active = false;
    };
  }, []);

  return { session, loading };
}
