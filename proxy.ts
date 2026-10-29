import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, verifyAccess } from '@/lib/server/auth/jwt';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Temporary language pause: preserve Arabic translations and old links, but show English.
  if (path === '/ar' || path.startsWith('/ar/')) {
    const target = request.nextUrl.clone();
    target.pathname = path.replace(/^\/ar(?=\/|$)/, '/en');
    return NextResponse.redirect(target, 307);
  }
  if (['/admin/login', '/api/admin/auth/login', '/api/admin/auth/refresh'].includes(path))
    return NextResponse.next();
  try {
    await verifyAccess(request.cookies.get(ACCESS_COOKIE)?.value || '');
    return NextResponse.next();
  } catch {
    if (path.startsWith('/api/'))
      return NextResponse.json(
        { ok: false, error: 'unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    const login = new URL('/admin/login', request.url);
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }
}
export const config = { matcher: ['/ar/:path*', '/admin/:path*', '/api/admin/:path*'] };
