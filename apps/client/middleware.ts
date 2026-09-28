import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Route perimeter guard.
 * Cookie presence is only a navigation guard; the FastAPI PDP remains authoritative
 * and cryptographically verifies the Supabase JWT on every protected API request.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedPath = [
    '/overview',
    '/workforce',
    '/sales',
    '/sales-marketing',
    '/billing',
    '/inbox',
    '/generative',
    '/selection',
    '/permissions',
    '/proactive',
    '/omnichannel',
    '/enterprise',
    '/intelligence',
    '/settings',
  ].some(route => pathname.startsWith(route));

  if (isProtectedPath) {
    const secureCookie = request.cookies.get('__Host-orchestree_access')?.value;
    const localCookie = request.cookies.get('orchestree_access')?.value;
    if (!secureCookie && !localCookie) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('auth_required', '1');
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/overview/:path*',
    '/workforce/:path*',
    '/sales/:path*',
    '/sales-marketing/:path*',
    '/billing/:path*',
    '/inbox/:path*',
    '/generative/:path*',
    '/selection/:path*',
    '/permissions/:path*',
    '/proactive/:path*',
    '/omnichannel/:path*',
    '/enterprise/:path*',
    '/intelligence/:path*',
    '/settings/:path*',
  ],
};
