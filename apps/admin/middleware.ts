import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Super Admin navigation perimeter.
 * MFA and platform-admin membership are authoritative in FastAPI.
 * No client header, localStorage flag, or boolean cookie is trusted as MFA.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    const secureCookie = request.cookies.get('__Host-orchestree_access')?.value;
    const localCookie = request.cookies.get('orchestree_access')?.value;
    if (!secureCookie && !localCookie) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('auth_required', '1');
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
