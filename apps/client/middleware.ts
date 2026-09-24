import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Server-side route authorization check (PRD v2.2 Bagian 3.5 & 15.1).
 * Memastikan rute internal tenant tidak dapat diakses tanpa sesi terotentikasi.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedPath = [
    '/overview',
    '/workforce',
    '/sales',
    '/billing',
    '/inbox',
    '/generative',
    '/selection',
    '/permissions',
    '/proactive',
    '/omnichannel',
  ].some(route => pathname.startsWith(route));

  if (isProtectedPath) {
    const token = request.cookies.get('sb-access-token')?.value ||
                  request.cookies.get('orchestree_auth_token')?.value ||
                  request.headers.get('authorization');

    if (!token) {
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
    '/billing/:path*',
    '/inbox/:path*',
    '/generative/:path*',
    '/selection/:path*',
    '/permissions/:path*',
    '/proactive/:path*',
    '/omnichannel/:path*',
  ],
};
