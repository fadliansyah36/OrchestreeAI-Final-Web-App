import React from 'react';

/**
 * Public route group layout.
 *
 * This layout intentionally contains no authenticated navigation, workspace
 * chrome, or dashboard shell. Existing PublicLandingScreen components remain
 * the source of truth for the public landing experience.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div data-route-surface="public-landing">{children}</div>;
}
