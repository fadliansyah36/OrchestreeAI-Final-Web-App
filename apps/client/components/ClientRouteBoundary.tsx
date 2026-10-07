'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ClientAppShell } from './ClientAppShell';

/**
 * FE-03 route boundary.
 *
 * The public landing page is an existing product surface and must not inherit
 * the authenticated dashboard shell. Authenticated application routes keep
 * the existing ClientAppShell and its navigation/components.
 *
 * Keep this boundary explicit so adding a public route is a deliberate
 * route-contract change rather than an accidental shell inheritance.
 */
const PUBLIC_ROUTES = new Set(['/']);

export function ClientRouteBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';

  if (PUBLIC_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  return <ClientAppShell>{children}</ClientAppShell>;
}
