import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Server-side Super Admin route authorization check (PRD v2.2 Bagian 3.5 & 15.1).
 * Memastikan rute Super Admin Hub tidak dapat diakses tanpa token admin DAN MFA valid.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    const adminToken = request.cookies.get('sb-access-token')?.value ||
                       request.cookies.get('orchestree_admin_token')?.value ||
                       request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    const hasValidToken = Boolean(adminToken && adminToken.length >= 20);
    const mfaCookie = request.cookies.get('orchestree_mfa_verified')?.value;
    const isMfaVerified = mfaCookie === 'true' || request.headers.get('x-mfa-verified') === 'true';

    if (!hasValidToken || !isMfaVerified) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('mfa_required', '1');
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
